package fleet

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"sync"
	"time"

	"github.com/libp2p/go-libp2p/core/peer"
)

// FleetStore is the interface for persisting fleet nodes.
type FleetStore interface {
	PutNode(node *FleetNode) error
	GetNode(peerID string) (*FleetNode, error)
	AllNodes() ([]*FleetNode, error)
	DeleteNode(peerID string) error
}

// Coordinator manages the fleet of worker nodes.
type Coordinator struct {
	hostID      peer.ID
	secret      []byte
	store       FleetStore
	allowlist   map[string]bool // nil = accept all with valid secret
	nodeTimeout time.Duration
	mu          sync.RWMutex
	nodes       map[string]*FleetNode // in-memory cache
}

// NewCoordinator creates a new fleet coordinator.
func NewCoordinator(hostID peer.ID, secret []byte, store FleetStore, allowlist []string, nodeTimeout time.Duration) *Coordinator {
	c := &Coordinator{
		hostID:      hostID,
		secret:      secret,
		store:       store,
		nodeTimeout: nodeTimeout,
		nodes:       make(map[string]*FleetNode),
	}

	if len(allowlist) > 0 {
		c.allowlist = make(map[string]bool, len(allowlist))
		for _, id := range allowlist {
			c.allowlist[id] = true
		}
	}

	// Load persisted nodes into cache.
	if nodes, err := store.AllNodes(); err == nil {
		for _, n := range nodes {
			c.nodes[n.PeerID] = n
		}
	}

	return c
}

// HandleHeartbeat processes a heartbeat from a worker.
func (c *Coordinator) HandleHeartbeat(senderID peer.ID, req *HeartbeatRequest) *HeartbeatResponse {
	// Verify peer ID matches claimed identity.
	if senderID.String() != req.PeerID {
		return &HeartbeatResponse{Status: "rejected", Reason: "peer ID mismatch"}
	}

	// Verify allowlist.
	if c.allowlist != nil && !c.allowlist[req.PeerID] {
		return &HeartbeatResponse{Status: "rejected", Reason: "not in allowlist"}
	}

	// Verify timestamp (±60s).
	now := time.Now().Unix()
	if math.Abs(float64(now-req.Timestamp)) > 60 {
		return &HeartbeatResponse{Status: "rejected", Reason: "timestamp expired"}
	}

	// Verify HMAC signature.
	msg := heartbeatSignPayload(req)
	if !HMACVerify(c.secret, msg, req.Signature) {
		return &HeartbeatResponse{Status: "rejected", Reason: "invalid signature"}
	}

	// Upsert node.
	c.mu.Lock()
	existing, ok := c.nodes[req.PeerID]
	now2 := time.Now()
	if !ok {
		existing = &FleetNode{
			PeerID:    req.PeerID,
			FirstSeen: now2,
		}
		slog.Info("fleet: new worker registered", "peer", req.PeerID[:12], "name", req.NodeName)
	}
	existing.Name = req.NodeName
	existing.Stats = req.Stats
	existing.Status = "online"
	existing.LastSeen = now2
	c.nodes[req.PeerID] = existing
	c.mu.Unlock()

	// Persist to store.
	if err := c.store.PutNode(existing); err != nil {
		slog.Error("fleet: persist node error", "err", err)
	}

	return &HeartbeatResponse{Status: "ok"}
}

// Summary returns an aggregated view of the fleet.
func (c *Coordinator) Summary() *FleetSummary {
	c.mu.RLock()
	defer c.mu.RUnlock()

	summary := &FleetSummary{
		CoordinatorID: c.hostID.String(),
		Nodes:         make([]*FleetNode, 0, len(c.nodes)),
	}

	for _, n := range c.nodes {
		cp := *n
		summary.Nodes = append(summary.Nodes, &cp)
		summary.TotalNodes++
		if n.Status == "online" {
			summary.OnlineNodes++
		}
		summary.TotalDocs += n.Stats.IndexedDocs
	}

	return summary
}

// GetNode returns a single fleet node by peer ID.
func (c *Coordinator) GetNode(peerID string) *FleetNode {
	c.mu.RLock()
	defer c.mu.RUnlock()
	n, ok := c.nodes[peerID]
	if !ok {
		return nil
	}
	cp := *n
	return &cp
}

// Secret returns the fleet secret (used by node to sign proxy requests).
func (c *Coordinator) Secret() []byte {
	return c.secret
}

// Start begins the staleness checking loop.
func (c *Coordinator) Start(ctx context.Context) {
	go c.stalenessLoop(ctx)
}

func (c *Coordinator) stalenessLoop(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.checkStaleness()
		case <-ctx.Done():
			return
		}
	}
}

func (c *Coordinator) checkStaleness() {
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, n := range c.nodes {
		elapsed := now.Sub(n.LastSeen)
		switch {
		case elapsed > c.nodeTimeout*3:
			if n.Status != "offline" {
				n.Status = "offline"
				slog.Warn("fleet: worker offline", "peer", n.PeerID[:12], "name", n.Name)
				c.store.PutNode(n)
			}
		case elapsed > c.nodeTimeout:
			if n.Status != "stale" {
				n.Status = "stale"
				slog.Warn("fleet: worker stale", "peer", n.PeerID[:12], "name", n.Name)
				c.store.PutNode(n)
			}
		}
	}
}

// heartbeatSignPayload builds the message bytes to sign for a heartbeat.
func heartbeatSignPayload(req *HeartbeatRequest) []byte {
	// Sign the JSON of the stats + identifying fields (not the signature itself).
	statsJSON, _ := json.Marshal(req.Stats)
	msg := fmt.Sprintf("heartbeat:%s:%s:%s:%d", req.PeerID, req.NodeName, string(statsJSON), req.Timestamp)
	return []byte(msg)
}

// SignHeartbeat fills in the Timestamp and Signature fields of a HeartbeatRequest.
func SignHeartbeat(secret []byte, req *HeartbeatRequest) {
	req.Timestamp = time.Now().Unix()
	msg := heartbeatSignPayload(req)
	req.Signature = HMACSign(secret, msg)
}
