package p2p

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	dht "github.com/libp2p/go-libp2p-kad-dht"
	"github.com/libp2p/go-libp2p/core/discovery"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"
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

	// Connect to IPFS public DHT bootstrap peers and set up routing discovery.
	// We use raw RoutingDiscovery (no BackoffDiscovery wrapper) because our
	// 30s polling interval is already reasonable rate-limiting. BackoffDiscovery
	// caches FindPeers results with exponential backoff up to 5min, which
	// prevents fresh DHT lookups and returns stale peer records.
	if cfg.EnableDHTDiscovery {
		d.connectIPFSBootstrapPeers(ctx)
		d.routingDisc = drouting.NewRoutingDiscovery(kadDHT)
	}

	// Start mDNS for local discovery
	if cfg.EnableMDNS {
		svc := mdns.NewMdnsService(h, "doogle-p2p", d)
		if err := svc.Start(); err != nil {
			slog.Warn("mDNS start failed", "err", err)
		} else {
			d.mdnsSvc = svc
			slog.Info("mDNS discovery enabled")
		}
	}

	return d, nil
}

// HandlePeerFound implements mdns.Notifee.
func (d *Discovery) HandlePeerFound(pi peer.AddrInfo) {
	if pi.ID == d.host.ID() {
		return
	}
	slog.Debug("mDNS: discovered peer", "peer", pi.ID.String()[:12])
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := d.host.Connect(ctx, pi); err != nil {
		slog.Debug("mDNS: failed to connect", "peer", pi.ID.String()[:12], "err", err)
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
	slog.Info("DHT discovery: advertising", "rendezvous", d.cfg.DHTRendezvous)
	dutil.Advertise(ctx, d.routingDisc, d.cfg.DHTRendezvous)

	// Log host addresses after a delay so AutoRelay has time to obtain relay addresses.
	go func() {
		select {
		case <-time.After(30 * time.Second):
		case <-ctx.Done():
			return
		}
		d.logHostAddresses()
	}()
}

// logHostAddresses logs the node's current addresses, highlighting circuit relay addresses.
func (d *Discovery) logHostAddresses() {
	addrs := d.host.Addrs()
	var relayAddrs, directAddrs []string
	for _, a := range addrs {
		s := a.String()
		if strings.Contains(s, "p2p-circuit") {
			relayAddrs = append(relayAddrs, s)
		} else {
			directAddrs = append(directAddrs, s)
		}
	}
	slog.Debug("host addresses", "direct", len(directAddrs), "relay", len(relayAddrs))
	for _, a := range directAddrs {
		slog.Debug("host address", "type", "direct", "addr", a)
	}
	for _, a := range relayAddrs {
		slog.Debug("host address", "type", "relay", "addr", a)
	}
	if len(relayAddrs) == 0 {
		slog.Debug("no relay addresses yet, AutoRelay may still be searching")
	}
}

// StartFindingPeers periodically searches the DHT for other Doogle nodes.
func (d *Discovery) StartFindingPeers(ctx context.Context) {
	if d.routingDisc == nil {
		return
	}

	// Wait for DHT routing tables to populate from IPFS bootstrap peers.
	// This needs enough time for the DHT to exchange routing info with
	// bootstrap peers so that provider record lookups can succeed.
	slog.Debug("DHT discovery: waiting for bootstrap to settle", "delay", "15s")
	select {
	case <-time.After(15 * time.Second):
	case <-ctx.Done():
		return
	}
	slog.Debug("DHT discovery: bootstrap settled", "rt_size", d.dht.RoutingTable().Size())

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
	slog.Debug("DHT discovery: searching for peers", "rendezvous", d.cfg.DHTRendezvous, "rt_size", d.dht.RoutingTable().Size(), "connected", len(d.host.Network().Peers()))

	findCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	peerCh, err := d.routingDisc.FindPeers(findCtx, d.cfg.DHTRendezvous, discovery.Limit(d.cfg.DHTMaxPeers))
	if err != nil {
		slog.Error("DHT discovery: FindPeers failed", "err", err)
		return
	}

	found, connected, alreadyConn, failed := 0, 0, 0, 0
	for pi := range peerCh {
		if pi.ID == d.host.ID() {
			continue
		}
		found++

		if d.host.Network().Connectedness(pi.ID) == network.Connected {
			alreadyConn++
			// Still fire the callback — if this peer was found via rendezvous,
			// it's a Doogle peer even if already connected (e.g. via DHT routing).
			if d.cfg.OnDooglePeerConnected != nil {
				d.cfg.OnDooglePeerConnected(pi.ID)
			}
			continue
		}

		if len(pi.Addrs) == 0 {
			slog.Debug("DHT discovery: peer has no addresses", "peer", pi.ID.String()[:12])
			failed++
			continue
		}

		slog.Debug("DHT discovery: dialing peer", "peer", pi.ID.String()[:12], "addrs", len(pi.Addrs))
		connCtx, connCancel := context.WithTimeout(ctx, 15*time.Second)
		err := d.host.Connect(connCtx, pi)
		connCancel()
		if err != nil {
			slog.Debug("DHT discovery: failed to connect", "peer", pi.ID.String()[:12], "err", err)
			failed++
		} else {
			slog.Debug("DHT discovery: connected to Doogle peer", "peer", pi.ID.String()[:12])
			connected++
			if d.cfg.OnDooglePeerConnected != nil {
				d.cfg.OnDooglePeerConnected(pi.ID)
			}
		}
	}
	slog.Debug("DHT discovery: round complete", "found", found, "new", connected, "already_connected", alreadyConn, "failed", failed)
}

// DHT returns the underlying Kademlia DHT.
func (d *Discovery) DHT() *dht.IpfsDHT {
	return d.dht
}

// Close shuts down discovery services.
func (d *Discovery) Close() error {
	if d.mdnsSvc != nil {
		if err := d.mdnsSvc.Close(); err != nil {
			slog.Warn("mDNS close error", "err", err)
		}
	}
	return d.dht.Close()
}

func (d *Discovery) connectBootstrapPeers(ctx context.Context, addrs []string) {
	var wg sync.WaitGroup
	for _, addrStr := range addrs {
		ma, err := multiaddr.NewMultiaddr(addrStr)
		if err != nil {
			slog.Warn("invalid bootstrap addr", "addr", addrStr, "err", err)
			continue
		}
		pi, err := peer.AddrInfoFromP2pAddr(ma)
		if err != nil {
			slog.Warn("invalid bootstrap peer info", "addr", addrStr, "err", err)
			continue
		}
		wg.Add(1)
		go func(pi peer.AddrInfo) {
			defer wg.Done()
			connCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
			defer cancel()
			if err := d.host.Connect(connCtx, pi); err != nil {
				slog.Warn("failed to connect to bootstrap peer", "peer", pi.ID.String()[:12], "err", err)
			} else {
				slog.Info("connected to bootstrap peer", "peer", pi.ID.String()[:12])
			}
		}(*pi)
	}
	wg.Wait()
}

// connectIPFSBootstrapPeers connects to the well-known IPFS DHT bootstrap nodes in parallel.
func (d *Discovery) connectIPFSBootstrapPeers(ctx context.Context) {
	ipfsBootstrapPeers := dht.GetDefaultBootstrapPeerAddrInfos()
	if len(ipfsBootstrapPeers) == 0 {
		slog.Warn("DHT discovery: no IPFS bootstrap peers available")
		return
	}

	slog.Debug("DHT discovery: connecting to IPFS bootstrap peers", "count", len(ipfsBootstrapPeers))

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
				slog.Debug("DHT discovery: failed to connect to IPFS bootstrap", "peer", pi.ID.String()[:12], "err", err)
			} else {
				mu.Lock()
				connected++
				mu.Unlock()
			}
		}(pi)
	}
	wg.Wait()

	slog.Info("DHT discovery: IPFS bootstrap complete", "connected", connected, "total", len(ipfsBootstrapPeers))
}
