package node

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/libp2p/go-libp2p/core/peer"
	ma "github.com/multiformats/go-multiaddr"

	"github.com/doogle/doogle-v2/internal/api"
	"github.com/doogle/doogle-v2/internal/fleet"
	"github.com/doogle/doogle-v2/internal/p2p"
	"github.com/doogle/doogle-v2/internal/store"
	"github.com/doogle/doogle-v2/internal/updater"
)

// initFleet configures the fleet subsystem based on the fleet role.
func (n *Node) initFleet() error {
	role := n.cfg.Fleet.Role
	if role == "standalone" {
		return nil
	}

	// Light nodes cannot be fleet workers (they don't crawl).
	if n.cfg.LightNode && role == "worker" {
		return fmt.Errorf("light nodes cannot run as fleet workers (no crawl capability)")
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
	nodeType := "full"
	if n.IsLight() {
		nodeType = "light"
	}
	var crawledURLs int64
	if n.urlStore != nil {
		crawledURLs = n.urlStore.CrawledCount()
	}
	var urlsInQueue int
	if n.scheduler != nil {
		urlsInQueue = n.scheduler.Pending()
	}
	return fleet.WorkerStats{
		IndexedDocs:    int(docCount),
		CrawledURLs:    int(crawledURLs),
		URLsInQueue:    urlsInQueue,
		ConnectedPeers: peerCount,
		Uptime:         time.Since(n.startedAt).Round(time.Second).String(),
		Version:        n.cfg.Version,
		NodeType:       nodeType,
	}
}

// fleetUpgrade performs a rolling upgrade of fleet workers.
// If peerIDs is empty, all online workers are upgraded.
// progressFn is called with status events for each worker.
func (n *Node) fleetUpgrade(ctx context.Context, peerIDs []string, progressFn func(api.FleetUpgradeEvent)) error {
	// 1. Fetch target version from GitHub.
	token, err := updater.ResolveToken()
	if err != nil {
		return fmt.Errorf("github token: %w", err)
	}
	release, err := updater.FetchLatestRelease(token)
	if err != nil {
		return fmt.Errorf("fetch release: %w", err)
	}
	targetVersion := release.TagName

	progressFn(api.FleetUpgradeEvent{
		Step:    "start",
		Message: fmt.Sprintf("Target version: %s", targetVersion),
		Version: targetVersion,
	})

	// 2. Determine which workers to upgrade.
	summary := n.coordinator.Summary()
	type target struct {
		peerID string
		name   string
		version string
	}
	var targets []target

	if len(peerIDs) > 0 {
		peerSet := make(map[string]bool, len(peerIDs))
		for _, id := range peerIDs {
			peerSet[id] = true
		}
		for _, nd := range summary.Nodes {
			if peerSet[nd.PeerID] && nd.Status == "online" {
				targets = append(targets, target{nd.PeerID, nd.Name, nd.Stats.Version})
			}
		}
	} else {
		for _, nd := range summary.Nodes {
			if nd.Status == "online" {
				targets = append(targets, target{nd.PeerID, nd.Name, nd.Stats.Version})
			}
		}
	}

	total := len(targets)
	if total == 0 {
		progressFn(api.FleetUpgradeEvent{Step: "complete", Message: "No online workers to upgrade"})
		return nil
	}

	// 3. Sequential rolling upgrade.
	for i, t := range targets {
		num := i + 1

		// Skip if already on target version.
		if t.version == targetVersion && t.version != "dev" {
			progressFn(api.FleetUpgradeEvent{
				PeerID: t.peerID, PeerName: t.name,
				Step: "skipped", Message: fmt.Sprintf("Already on %s", targetVersion),
				Version: t.version, WorkerNum: num, Total: total,
			})
			continue
		}

		// Send update-restart to worker via proxy.
		progressFn(api.FleetUpgradeEvent{
			PeerID: t.peerID, PeerName: t.name,
			Step: "updating", Message: "Sending update-restart command",
			WorkerNum: num, Total: total,
		})

		_, respBody, err := n.fleetProxyHTTP(ctx, t.peerID, "POST", "/api/admin/update-restart", "", nil, nil)
		if err != nil {
			progressFn(api.FleetUpgradeEvent{
				PeerID: t.peerID, PeerName: t.name,
				Step: "failed", Message: fmt.Sprintf("Proxy error: %v", err),
				WorkerNum: num, Total: total,
			})
			continue
		}

		// Check if the update itself succeeded.
		var updateResp struct {
			Status     string `json:"status"`
			Error      string `json:"error"`
			NewVersion string `json:"new_version"`
		}
		if err := json.Unmarshal(respBody, &updateResp); err != nil || updateResp.Error != "" {
			msg := updateResp.Error
			if msg == "" {
				msg = "unexpected response"
			}
			progressFn(api.FleetUpgradeEvent{
				PeerID: t.peerID, PeerName: t.name,
				Step: "failed", Message: msg,
				WorkerNum: num, Total: total,
			})
			continue
		}

		progressFn(api.FleetUpgradeEvent{
			PeerID: t.peerID, PeerName: t.name,
			Step: "restarting", Message: "Update applied, waiting for restart",
			Version: updateResp.NewVersion, WorkerNum: num, Total: total,
		})

		// 4. Poll heartbeats until worker comes back with new version (90s timeout).
		deadline := time.After(90 * time.Second)
		ticker := time.NewTicker(2 * time.Second)
		came_back := false

		func() {
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-deadline:
					return
				case <-ticker.C:
					nd := n.coordinator.GetNode(t.peerID)
					if nd != nil && nd.Status == "online" && nd.Stats.Version == targetVersion {
						came_back = true
						return
					}
				}
			}
		}()

		if came_back {
			progressFn(api.FleetUpgradeEvent{
				PeerID: t.peerID, PeerName: t.name,
				Step: "online", Message: fmt.Sprintf("Back online with %s", targetVersion),
				Version: targetVersion, WorkerNum: num, Total: total,
			})
		} else {
			progressFn(api.FleetUpgradeEvent{
				PeerID: t.peerID, PeerName: t.name,
				Step: "timeout", Message: "Worker did not come back within 90s",
				WorkerNum: num, Total: total,
			})
		}
	}

	progressFn(api.FleetUpgradeEvent{Step: "complete", Message: "Fleet upgrade finished"})
	return nil
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
