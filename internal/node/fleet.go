package node

import (
	"context"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/libp2p/go-libp2p/core/peer"
	ma "github.com/multiformats/go-multiaddr"

	"github.com/doogle/doogle-v2/internal/fleet"
	"github.com/doogle/doogle-v2/internal/p2p"
	"github.com/doogle/doogle-v2/internal/store"
)

// initFleet configures the fleet subsystem based on the fleet role.
func (n *Node) initFleet() error {
	role := n.cfg.Fleet.Role
	if role == "standalone" {
		return nil
	}

	switch role {
	case "", "coordinator":
		secret, err := fleet.LoadOrCreateSecret(n.cfg.Storage.DataDir, n.cfg.Fleet.FleetSecret)
		if err != nil {
			return fmt.Errorf("fleet secret: %w", err)
		}
		slog.Info("fleet: coordinator mode",
			"secret_hex", hex.EncodeToString(secret)[:16]+"...",
		)
		return n.initFleetCoordinator(secret)

	case "worker":
		if n.cfg.Fleet.FleetSecret == "" {
			return fmt.Errorf("fleet worker requires --fleet-secret")
		}
		if n.cfg.Fleet.CoordinatorPeer == "" {
			return fmt.Errorf("fleet worker requires --fleet-coordinator")
		}
		secret, err := fleet.LoadOrCreateSecret(n.cfg.Storage.DataDir, n.cfg.Fleet.FleetSecret)
		if err != nil {
			return fmt.Errorf("fleet secret: %w", err)
		}
		return n.initFleetWorker(secret)

	default:
		return fmt.Errorf("unknown fleet role: %s", role)
	}
}

func (n *Node) initFleetCoordinator(secret []byte) error {
	// Create fleet store.
	n.fleetStore = store.NewFleetStore(n.badger)

	// Create coordinator.
	n.coordinator = fleet.NewCoordinator(
		n.peerID,
		secret,
		n.fleetStore,
		n.cfg.Fleet.Allowlist,
		n.cfg.Fleet.NodeTimeout,
	)

	// Register heartbeat protocol handler.
	p2p.RegisterFleetHeartbeatProtocol(n.host, n.coordinator.HandleHeartbeat)

	// Derive API token.
	n.fleetAPIToken = fleet.DeriveAPIToken(secret)
	slog.Info("fleet: API token derived", "prefix", n.fleetAPIToken[:16]+"...")

	return nil
}

func (n *Node) initFleetWorker(secret []byte) error {
	// Parse coordinator multiaddr and extract peer ID.
	maddr, err := ma.NewMultiaddr(n.cfg.Fleet.CoordinatorPeer)
	if err != nil {
		return fmt.Errorf("parse coordinator multiaddr: %w", err)
	}

	addrInfo, err := peer.AddrInfoFromP2pAddr(maddr)
	if err != nil {
		return fmt.Errorf("extract coordinator addr info: %w", err)
	}

	// Add coordinator to peerstore.
	n.host.Peerstore().AddAddrs(addrInfo.ID, addrInfo.Addrs, time.Hour*24)

	localAPIAddr := fmt.Sprintf("127.0.0.1:%d", n.cfg.API.Port)

	// Create worker.
	n.worker = fleet.NewWorker(
		n.peerID,
		addrInfo.ID,
		secret,
		localAPIAddr,
		n.cfg.NodeName,
		n.cfg.Fleet.HeartbeatInterval,
		n.workerStats,
	)

	// Register proxy protocol handler.
	p2p.RegisterFleetProxyProtocol(n.host, func(senderID peer.ID, req *fleet.ProxyRequest, w io.Writer) {
		n.worker.HandleProxy(senderID, req, w)
	})

	// Force API to bind to localhost only.
	n.cfg.API.Bind = "127.0.0.1"
	slog.Info("fleet: worker mode",
		"coordinator", addrInfo.ID.String()[:12],
		"api_bind", localAPIAddr,
	)

	return nil
}

// workerStats returns the current stats for fleet heartbeats.
func (n *Node) workerStats() fleet.WorkerStats {
	docCount, _ := n.bleveIdx.DocCount()
	dooglePeers := n.shards.AllMembers()
	peerCount := len(dooglePeers) - 1
	if peerCount < 0 {
		peerCount = 0
	}
	return fleet.WorkerStats{
		IndexedDocs:    int(docCount),
		CrawledURLs:    int(n.urlStore.CrawledCount()),
		URLsInQueue:    n.scheduler.Pending(),
		ConnectedPeers: peerCount,
		Uptime:         time.Since(n.startedAt).Round(time.Second).String(),
	}
}

// fleetProxyHTTP sends a proxy request to a worker via the fleet proxy protocol.
func (n *Node) fleetProxyHTTP(ctx context.Context, peerID, method, path, query string, headers map[string]string, body []byte) (*p2p.ProxyResponseHeader, []byte, error) {
	pid, err := peer.Decode(peerID)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid peer ID: %w", err)
	}

	req := &fleet.ProxyRequest{
		Method:  method,
		Path:    path,
		Query:   query,
		Headers: headers,
		Body:    body,
	}
	fleet.SignProxyRequest(n.coordinator.Secret(), req)

	return p2p.SendFleetProxy(ctx, n.host, pid, req, 60*time.Second)
}
