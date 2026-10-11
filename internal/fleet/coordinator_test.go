package fleet

import (
	"testing"
	"time"

	"github.com/libp2p/go-libp2p/core/peer"
)

// mockFleetStore is a simple in-memory FleetStore for testing.
type mockFleetStore struct {
	nodes map[string]*FleetNode
}

func newMockFleetStore() *mockFleetStore {
	return &mockFleetStore{nodes: make(map[string]*FleetNode)}
}

func (m *mockFleetStore) PutNode(node *FleetNode) error {
	m.nodes[node.PeerID] = node
	return nil
}

func (m *mockFleetStore) GetNode(peerID string) (*FleetNode, error) {
	n, ok := m.nodes[peerID]
	if !ok {
		return nil, nil
	}
	return n, nil
}

func (m *mockFleetStore) AllNodes() ([]*FleetNode, error) {
	nodes := make([]*FleetNode, 0, len(m.nodes))
	for _, n := range m.nodes {
		nodes = append(nodes, n)
	}
	return nodes, nil
}

func (m *mockFleetStore) DeleteNode(peerID string) error {
	delete(m.nodes, peerID)
	return nil
}

func TestCoordinator_HandleHeartbeat_Valid(t *testing.T) {
	secret := []byte("test-secret-key-32-bytes-padded!")
	coordID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")
	store := newMockFleetStore()
	coord := NewCoordinator(coordID, secret, store, nil, 60*time.Second)

	workerID, _ := peer.Decode("12D3KooWRby3dHGRs5F4TL2vHKLUcyPmhQviG2QJqaBkYAFnmQRu")

	req := &HeartbeatRequest{
		PeerID:   workerID.String(),
		NodeName: "worker-1",
		Stats: WorkerStats{
			IndexedDocs:    100,
			CrawledURLs:    500,
			URLsInQueue:    50,
			ConnectedPeers: 3,
			Uptime:         "1h30m",
		},
	}
	SignHeartbeat(secret, req)

	resp := coord.HandleHeartbeat(workerID, req)
	if resp.Status != "ok" {
		t.Fatalf("expected ok, got %s: %s", resp.Status, resp.Reason)
	}

	// Node should be registered.
	summary := coord.Summary()
	if summary.TotalNodes != 1 {
		t.Fatalf("expected 1 node, got %d", summary.TotalNodes)
	}
	if summary.OnlineNodes != 1 {
		t.Fatalf("expected 1 online, got %d", summary.OnlineNodes)
	}
	if summary.TotalDocs != 100 {
		t.Fatalf("expected 100 docs, got %d", summary.TotalDocs)
	}
}

func TestCoordinator_HandleHeartbeat_PeerIDMismatch(t *testing.T) {
	secret := []byte("test-secret-key-32-bytes-padded!")
	coordID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")
	store := newMockFleetStore()
	coord := NewCoordinator(coordID, secret, store, nil, 60*time.Second)

	workerID, _ := peer.Decode("12D3KooWRby3dHGRs5F4TL2vHKLUcyPmhQviG2QJqaBkYAFnmQRu")
	fakeID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")

	req := &HeartbeatRequest{
		PeerID:   fakeID.String(), // claims to be someone else
		NodeName: "liar",
	}
	SignHeartbeat(secret, req)

	resp := coord.HandleHeartbeat(workerID, req)
	if resp.Status != "rejected" {
		t.Fatal("expected rejection for peer ID mismatch")
	}
	if resp.Reason != "peer ID mismatch" {
		t.Fatalf("unexpected reason: %s", resp.Reason)
	}
}

func TestCoordinator_HandleHeartbeat_InvalidSignature(t *testing.T) {
	secret := []byte("test-secret-key-32-bytes-padded!")
	coordID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")
	store := newMockFleetStore()
	coord := NewCoordinator(coordID, secret, store, nil, 60*time.Second)

	workerID, _ := peer.Decode("12D3KooWRby3dHGRs5F4TL2vHKLUcyPmhQviG2QJqaBkYAFnmQRu")

	wrongSecret := []byte("wrong-secret-key-32-bytes-pad!!!")
	req := &HeartbeatRequest{
		PeerID:   workerID.String(),
		NodeName: "worker-1",
	}
	SignHeartbeat(wrongSecret, req)

	resp := coord.HandleHeartbeat(workerID, req)
	if resp.Status != "rejected" {
		t.Fatal("expected rejection for invalid signature")
	}
	if resp.Reason != "invalid signature" {
		t.Fatalf("unexpected reason: %s", resp.Reason)
	}
}

func TestCoordinator_HandleHeartbeat_ExpiredTimestamp(t *testing.T) {
	secret := []byte("test-secret-key-32-bytes-padded!")
	coordID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")
	store := newMockFleetStore()
	coord := NewCoordinator(coordID, secret, store, nil, 60*time.Second)

	workerID, _ := peer.Decode("12D3KooWRby3dHGRs5F4TL2vHKLUcyPmhQviG2QJqaBkYAFnmQRu")

	req := &HeartbeatRequest{
		PeerID:    workerID.String(),
		NodeName:  "worker-1",
		Timestamp: time.Now().Add(-2 * time.Minute).Unix(), // 2 minutes in the past
	}
	// Sign with the old timestamp.
	msg := heartbeatSignPayload(req)
	req.Signature = HMACSign(secret, msg)

	resp := coord.HandleHeartbeat(workerID, req)
	if resp.Status != "rejected" {
		t.Fatal("expected rejection for expired timestamp")
	}
	if resp.Reason != "timestamp expired" {
		t.Fatalf("unexpected reason: %s", resp.Reason)
	}
}

func TestCoordinator_HandleHeartbeat_Allowlist(t *testing.T) {
	secret := []byte("test-secret-key-32-bytes-padded!")
	coordID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")
	store := newMockFleetStore()

	allowedID, _ := peer.Decode("12D3KooWRby3dHGRs5F4TL2vHKLUcyPmhQviG2QJqaBkYAFnmQRu")
	blockedID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")

	coord := NewCoordinator(coordID, secret, store, []string{allowedID.String()}, 60*time.Second)

	// Blocked peer.
	req := &HeartbeatRequest{
		PeerID:   blockedID.String(),
		NodeName: "blocked",
	}
	SignHeartbeat(secret, req)
	resp := coord.HandleHeartbeat(blockedID, req)
	if resp.Status != "rejected" || resp.Reason != "not in allowlist" {
		t.Fatalf("expected allowlist rejection, got %s: %s", resp.Status, resp.Reason)
	}

	// Allowed peer.
	req2 := &HeartbeatRequest{
		PeerID:   allowedID.String(),
		NodeName: "allowed",
	}
	SignHeartbeat(secret, req2)
	resp2 := coord.HandleHeartbeat(allowedID, req2)
	if resp2.Status != "ok" {
		t.Fatalf("expected ok for allowed peer, got %s: %s", resp2.Status, resp2.Reason)
	}
}

func TestCoordinator_GetNode(t *testing.T) {
	secret := []byte("test-secret-key-32-bytes-padded!")
	coordID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")
	store := newMockFleetStore()
	coord := NewCoordinator(coordID, secret, store, nil, 60*time.Second)

	workerID, _ := peer.Decode("12D3KooWRby3dHGRs5F4TL2vHKLUcyPmhQviG2QJqaBkYAFnmQRu")

	// Not found.
	if n := coord.GetNode(workerID.String()); n != nil {
		t.Fatal("expected nil for unknown node")
	}

	// Register via heartbeat.
	req := &HeartbeatRequest{
		PeerID:   workerID.String(),
		NodeName: "w1",
		Stats:    WorkerStats{IndexedDocs: 42},
	}
	SignHeartbeat(secret, req)
	coord.HandleHeartbeat(workerID, req)

	// Found.
	n := coord.GetNode(workerID.String())
	if n == nil {
		t.Fatal("expected node after heartbeat")
	}
	if n.Name != "w1" {
		t.Fatalf("expected name w1, got %s", n.Name)
	}
	if n.Stats.IndexedDocs != 42 {
		t.Fatalf("expected 42 docs, got %d", n.Stats.IndexedDocs)
	}
}

func TestCoordinator_Summary_Empty(t *testing.T) {
	coordID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")
	store := newMockFleetStore()
	coord := NewCoordinator(coordID, []byte("secret-key-is-32-bytes-padding!!"), store, nil, 60*time.Second)

	summary := coord.Summary()
	if summary.TotalNodes != 0 {
		t.Fatalf("expected 0 nodes, got %d", summary.TotalNodes)
	}
	if summary.CoordinatorID != coordID.String() {
		t.Fatalf("expected coordinator ID %s, got %s", coordID.String(), summary.CoordinatorID)
	}
}

func TestCoordinator_Staleness(t *testing.T) {
	secret := []byte("test-secret-key-32-bytes-padded!")
	coordID, _ := peer.Decode("12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN")
	store := newMockFleetStore()
	coord := NewCoordinator(coordID, secret, store, nil, 1*time.Second) // 1s timeout for fast test

	workerID, _ := peer.Decode("12D3KooWRby3dHGRs5F4TL2vHKLUcyPmhQviG2QJqaBkYAFnmQRu")
	req := &HeartbeatRequest{PeerID: workerID.String(), NodeName: "w1"}
	SignHeartbeat(secret, req)
	coord.HandleHeartbeat(workerID, req)

	// Immediately: should be online.
	n := coord.GetNode(workerID.String())
	if n.Status != "online" {
		t.Fatalf("expected online, got %s", n.Status)
	}

	// Wait > timeout, then check staleness.
	time.Sleep(1500 * time.Millisecond)
	coord.checkStaleness()

	n = coord.GetNode(workerID.String())
	if n.Status != "stale" {
		t.Fatalf("expected stale after timeout, got %s", n.Status)
	}

	// Wait > 3x timeout for offline.
	time.Sleep(2500 * time.Millisecond)
	coord.checkStaleness()

	n = coord.GetNode(workerID.String())
	if n.Status != "offline" {
		t.Fatalf("expected offline after 3x timeout, got %s", n.Status)
	}
}
