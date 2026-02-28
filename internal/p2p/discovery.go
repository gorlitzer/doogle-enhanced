package p2p

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	dht "github.com/libp2p/go-libp2p-kad-dht"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/p2p/discovery/mdns"
	"github.com/multiformats/go-multiaddr"
)

// Discovery manages peer discovery via Kademlia DHT and mDNS.
type Discovery struct {
	host    host.Host
	dht     *dht.IpfsDHT
	peerCh  chan peer.AddrInfo
	mdnsSvc mdns.Service
}

// NewDiscovery creates the discovery subsystem with a Kademlia DHT.
func NewDiscovery(ctx context.Context, h host.Host, bootstrapPeers []string, enableMDNS bool) (*Discovery, error) {
	d := &Discovery{
		host:   h,
		peerCh: make(chan peer.AddrInfo, 64),
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

	// Connect to bootstrap peers
	if len(bootstrapPeers) > 0 {
		d.connectBootstrapPeers(ctx, bootstrapPeers)
	}

	// Start mDNS for local discovery
	if enableMDNS {
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
	}
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
