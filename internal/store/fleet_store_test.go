package store

import (
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/fleet"
)

func TestFleetStore_PutGetNode(t *testing.T) {
	bs := newTestBadger(t)
	fs := NewFleetStore(bs)

	node := &fleet.FleetNode{
		PeerID:    "12D3KooWTestPeer123",
		Name:      "worker-1",
		Status:    "online",
		FirstSeen: time.Now(),
		LastSeen:  time.Now(),
		Stats: fleet.WorkerStats{
			IndexedDocs:    100,
			CrawledURLs:    500,
			URLsInQueue:    25,
			ConnectedPeers: 3,
			Uptime:         "1h",
		},
	}

	if err := fs.PutNode(node); err != nil {
		t.Fatalf("PutNode: %v", err)
	}

	got, err := fs.GetNode("12D3KooWTestPeer123")
	if err != nil {
		t.Fatalf("GetNode: %v", err)
	}
	if got == nil {
		t.Fatal("expected node, got nil")
	}
	if got.Name != "worker-1" {
		t.Fatalf("expected name worker-1, got %s", got.Name)
	}
	if got.Stats.IndexedDocs != 100 {
		t.Fatalf("expected 100 docs, got %d", got.Stats.IndexedDocs)
	}
}

func TestFleetStore_GetNode_NotFound(t *testing.T) {
	bs := newTestBadger(t)
	fs := NewFleetStore(bs)

	got, err := fs.GetNode("nonexistent")
	if err != nil {
		t.Fatalf("GetNode: %v", err)
	}
	if got != nil {
		t.Fatal("expected nil for unknown node")
	}
}

func TestFleetStore_AllNodes(t *testing.T) {
	bs := newTestBadger(t)
	fs := NewFleetStore(bs)

	for i := 0; i < 3; i++ {
		fs.PutNode(&fleet.FleetNode{
			PeerID:    "peer-" + string(rune('a'+i)),
			Name:      "worker-" + string(rune('a'+i)),
			Status:    "online",
			FirstSeen: time.Now(),
			LastSeen:  time.Now(),
		})
	}

	nodes, err := fs.AllNodes()
	if err != nil {
		t.Fatalf("AllNodes: %v", err)
	}
	if len(nodes) != 3 {
		t.Fatalf("expected 3 nodes, got %d", len(nodes))
	}
}

func TestFleetStore_DeleteNode(t *testing.T) {
	bs := newTestBadger(t)
	fs := NewFleetStore(bs)

	fs.PutNode(&fleet.FleetNode{
		PeerID: "peer-to-delete",
		Name:   "doomed",
		Status: "offline",
	})

	if err := fs.DeleteNode("peer-to-delete"); err != nil {
		t.Fatalf("DeleteNode: %v", err)
	}

	got, _ := fs.GetNode("peer-to-delete")
	if got != nil {
		t.Fatal("expected nil after delete")
	}
}

func TestFleetStore_UpdateNode(t *testing.T) {
	bs := newTestBadger(t)
	fs := NewFleetStore(bs)

	node := &fleet.FleetNode{
		PeerID: "updatable-peer",
		Name:   "original",
		Status: "online",
		Stats:  fleet.WorkerStats{IndexedDocs: 10},
	}
	fs.PutNode(node)

	// Update.
	node.Name = "updated"
	node.Stats.IndexedDocs = 200
	node.Status = "stale"
	fs.PutNode(node)

	got, _ := fs.GetNode("updatable-peer")
	if got.Name != "updated" {
		t.Fatalf("expected updated name, got %s", got.Name)
	}
	if got.Stats.IndexedDocs != 200 {
		t.Fatalf("expected 200 docs, got %d", got.Stats.IndexedDocs)
	}
	if got.Status != "stale" {
		t.Fatalf("expected stale, got %s", got.Status)
	}
}

func TestFleetStore_Persistence(t *testing.T) {
	dir := t.TempDir()

	// Write.
	bs1, _ := NewBadgerStore(dir)
	fs1 := NewFleetStore(bs1)
	fs1.PutNode(&fleet.FleetNode{PeerID: "persistent-peer", Name: "survivor", Status: "online"})
	bs1.Close()

	// Re-open.
	bs2, _ := NewBadgerStore(dir)
	defer bs2.Close()
	fs2 := NewFleetStore(bs2)

	got, _ := fs2.GetNode("persistent-peer")
	if got == nil {
		t.Fatal("expected node after reopen")
	}
	if got.Name != "survivor" {
		t.Fatalf("expected survivor, got %s", got.Name)
	}
}
