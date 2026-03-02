package p2p

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"

	dht "github.com/libp2p/go-libp2p-kad-dht"
	"github.com/libp2p/go-libp2p/core/discovery"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/p2p/discovery/backoff"
	"github.com/libp2p/go-libp2p/p2p/discovery/mdns"
	drouting "github.com/libp2p/go-libp2p/p2p/discovery/routing"
	dutil "github.com/libp2p/go-libp2p/p2p/discovery/util"
	"github.com/multiformats/go-multiaddr"
)

// DiscoveryConfig holds all discovery-related settings.
type DiscoveryConfig struct {
	BootstrapPeers        []string
	EnableMDNS            bool
	EnableDHTDiscovery    bool
	DHTRendezvous         string
	DHTDiscoveryInterval  time.Duration
	DHTMaxPeers           int
	OnDooglePeerConnected func(peer.ID) // called when a verified Doogle peer connects
}

// Discovery manages peer discovery via Kademlia DHT, mDNS, and IPFS routing discovery.
type Discovery struct {
	host        host.Host
	dht         *dht.IpfsDHT
	peerCh      chan peer.AddrInfo
	mdnsSvc     mdns.Service
	routingDisc discovery.Discovery
	cfg         DiscoveryConfig
}

// NewDiscovery creates the discovery subsystem with a Kademlia DHT.
func NewDiscovery(ctx context.Context, h host.Host, cfg DiscoveryConfig) (*Discovery, error) {
	d := &Discovery{
		host:   h,
		peerCh: make(chan peer.AddrInfo, 64),
		cfg:    cfg,
	}

	// Create Kademlia DHT
	kadDHT, err := dht.New(ctx, h, dht.Mode(dht.ModeAutoServer))
	if err != nil {
		return nil, fmt.Errorf("create DHT: %w", err)
	}
	d.dht = kadDHT

	// Bootstrap the DHT
	if err := kadDHT.Bootstrap(ctx); err != nil {
		return nil, fmt.Errorf("bootstrap DHT: %w", err)
	}

	// Connect to user-provided bootstrap peers
	if len(cfg.BootstrapPeers) > 0 {
		d.connectBootstrapPeers(ctx, cfg.BootstrapPeers)
	}

	// Connect to IPFS public DHT bootstrap peers and set up routing discovery
	if cfg.EnableDHTDiscovery {
		d.connectIPFSBootstrapPeers(ctx)

		routingDisc := drouting.NewRoutingDiscovery(kadDHT)
		backoffFactory := backoff.NewExponentialBackoff(
			time.Second,
			5*time.Minute,
			backoff.FullJitter,
			time.Second,
			2.0,
			0,
			rand.NewSource(time.Now().UnixNano()),
		)
		backedOff, err := backoff.NewBackoffDiscovery(routingDisc, backoffFactory)
		if err != nil {
			return nil, fmt.Errorf("backoff discovery: %w", err)
		}
		d.routingDisc = backedOff
	}

	// Start mDNS for local discovery
	if cfg.EnableMDNS {
		svc := mdns.NewMdnsService(h, "doogle-p2p", d)
		if err := svc.Start(); err != nil {
			log.Printf("mDNS start failed (non-fatal): %v", err)
		} else {
			d.mdnsSvc = svc
			log.Println("mDNS discovery enabled")
		}
	}

	return d, nil
}

// HandlePeerFound implements mdns.Notifee.
func (d *Discovery) HandlePeerFound(pi peer.AddrInfo) {
	if pi.ID == d.host.ID() {
		return
	}
	log.Printf("mDNS: discovered peer %s", pi.ID.String()[:12])
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := d.host.Connect(ctx, pi); err != nil {
		log.Printf("mDNS: failed to connect to %s: %v", pi.ID.String()[:12], err)
	} else if d.cfg.OnDooglePeerConnected != nil {
		d.cfg.OnDooglePeerConnected(pi.ID)
	}
}

// StartAdvertising advertises this node on the DHT under the configured rendezvous namespace.
// It spawns a background goroutine that re-advertises automatically.
func (d *Discovery) StartAdvertising(ctx context.Context) {
	if d.routingDisc == nil {
		return
	}
	log.Printf("DHT discovery: advertising as %q", d.cfg.DHTRendezvous)
	dutil.Advertise(ctx, d.routingDisc, d.cfg.DHTRendezvous)
}

// StartFindingPeers periodically searches the DHT for other Doogle nodes.
func (d *Discovery) StartFindingPeers(ctx context.Context) {
	if d.routingDisc == nil {
		return
	}

	// Initial delay to let DHT bootstrap settle
	select {
	case <-time.After(5 * time.Second):
	case <-ctx.Done():
		return
	}

	ticker := time.NewTicker(d.cfg.DHTDiscoveryInterval)
	defer ticker.Stop()

	for {
		d.findAndConnectPeers(ctx)

		select {
		case <-ticker.C:
		case <-ctx.Done():
			return
		}
	}
}

func (d *Discovery) findAndConnectPeers(ctx context.Context) {
	// Connection limits are handled by the connmgr; always search for Doogle peers.
	log.Printf("DHT discovery: searching for peers under %q...", d.cfg.DHTRendezvous)

	findCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	peerCh, err := d.routingDisc.FindPeers(findCtx, d.cfg.DHTRendezvous, discovery.Limit(d.cfg.DHTMaxPeers))
	if err != nil {
		log.Printf("DHT discovery: FindPeers error: %v", err)
		return
	}

	found := 0
	for pi := range peerCh {
		if pi.ID == d.host.ID() {
			continue
		}
		found++
		if d.host.Network().Connectedness(pi.ID) == network.Connected {
			continue
		}

		log.Printf("DHT discovery: found peer %s, dialing...", pi.ID.String()[:12])
		connCtx, connCancel := context.WithTimeout(ctx, 10*time.Second)
		err := d.host.Connect(connCtx, pi)
		connCancel()
		if err != nil {
			log.Printf("DHT discovery: failed to connect to %s: %v", pi.ID.String()[:12], err)
		} else {
			log.Printf("DHT discovery: connected to Doogle peer %s", pi.ID.String()[:12])
			if d.cfg.OnDooglePeerConnected != nil {
				d.cfg.OnDooglePeerConnected(pi.ID)
			}
		}
	}
	log.Printf("DHT discovery: round complete, found %d peer(s)", found)
}

// DHT returns the underlying Kademlia DHT.
func (d *Discovery) DHT() *dht.IpfsDHT {
	return d.dht
}

// Close shuts down discovery services.
func (d *Discovery) Close() error {
	if d.mdnsSvc != nil {
		if err := d.mdnsSvc.Close(); err != nil {
			log.Printf("mDNS close error: %v", err)
		}
	}
	return d.dht.Close()
}

func (d *Discovery) connectBootstrapPeers(ctx context.Context, addrs []string) {
	var wg sync.WaitGroup
	for _, addrStr := range addrs {
		ma, err := multiaddr.NewMultiaddr(addrStr)
		if err != nil {
			log.Printf("invalid bootstrap addr %q: %v", addrStr, err)
			continue
		}
		pi, err := peer.AddrInfoFromP2pAddr(ma)
		if err != nil {
			log.Printf("invalid bootstrap peer info %q: %v", addrStr, err)
			continue
		}
		wg.Add(1)
		go func(pi peer.AddrInfo) {
			defer wg.Done()
			connCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
			defer cancel()
			if err := d.host.Connect(connCtx, pi); err != nil {
				log.Printf("failed to connect to bootstrap peer %s: %v", pi.ID.String()[:12], err)
			} else {
				log.Printf("connected to bootstrap peer: %s", pi.ID.String()[:12])
			}
		}(*pi)
	}
	wg.Wait()
}

// connectIPFSBootstrapPeers connects to the well-known IPFS DHT bootstrap nodes in parallel.
func (d *Discovery) connectIPFSBootstrapPeers(ctx context.Context) {
	ipfsBootstrapPeers := dht.GetDefaultBootstrapPeerAddrInfos()
	if len(ipfsBootstrapPeers) == 0 {
		log.Println("DHT discovery: no IPFS bootstrap peers available")
		return
	}

	log.Printf("DHT discovery: connecting to %d IPFS bootstrap peers...", len(ipfsBootstrapPeers))

	var wg sync.WaitGroup
	var connected int
	var mu sync.Mutex

	for _, pi := range ipfsBootstrapPeers {
		wg.Add(1)
		go func(pi peer.AddrInfo) {
			defer wg.Done()
			connCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
			defer cancel()
			if err := d.host.Connect(connCtx, pi); err != nil {
				log.Printf("DHT discovery: failed to connect to IPFS bootstrap %s: %v", pi.ID.String()[:12], err)
			} else {
				mu.Lock()
				connected++
				mu.Unlock()
			}
		}(pi)
	}
	wg.Wait()

	log.Printf("DHT discovery: connected to %d/%d IPFS bootstrap peers", connected, len(ipfsBootstrapPeers))
}
