package consistent

import (
	"fmt"
	"testing"
)

func TestRing_AddAndGet(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")

	got := r.Get("anykey")
	if got != "node1" {
		t.Fatalf("expected node1, got %s", got)
	}
}

func TestRing_EmptyRing(t *testing.T) {
	r := NewRing(64)
	got := r.Get("anykey")
	if got != "" {
		t.Fatalf("expected empty string for empty ring, got %s", got)
	}
}

func TestRing_Deterministic(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")
	r.Add("node2")
	r.Add("node3")

	key := "example.com"
	owner1 := r.Get(key)
	owner2 := r.Get(key)
	if owner1 != owner2 {
		t.Fatalf("expected deterministic result, got %s and %s", owner1, owner2)
	}
}

func TestRing_Distribution(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")
	r.Add("node2")
	r.Add("node3")

	// Check that different keys map to different nodes (at least some)
	counts := make(map[string]int)
	for i := 0; i < 100; i++ {
		key := fmt.Sprintf("domain%d.com", i)
		node := r.Get(key)
		counts[node]++
	}

	// Each node should get at least some keys
	for _, node := range []string{"node1", "node2", "node3"} {
		if counts[node] == 0 {
			t.Fatalf("node %s got 0 keys, distribution is bad", node)
		}
	}
}

func TestRing_GetN(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")
	r.Add("node2")
	r.Add("node3")

	nodes := r.GetN("test.com", 2)
	if len(nodes) != 2 {
		t.Fatalf("expected 2 nodes, got %d", len(nodes))
	}
	if nodes[0] == nodes[1] {
		t.Fatal("expected distinct nodes")
	}
}

func TestRing_GetN_MoreThanAvailable(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")
	r.Add("node2")

	nodes := r.GetN("test.com", 5)
	if len(nodes) != 2 {
		t.Fatalf("expected 2 nodes (max available), got %d", len(nodes))
	}
}

func TestRing_GetN_SingleNode(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")

	nodes := r.GetN("test.com", 3)
	if len(nodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(nodes))
	}
}

func TestRing_Remove(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")
	r.Add("node2")
	r.Add("node3")

	r.Remove("node2")

	if r.Size() != 2 {
		t.Fatalf("expected size=2, got %d", r.Size())
	}

	// All keys should map to node1 or node3
	for i := 0; i < 50; i++ {
		key := fmt.Sprintf("key%d", i)
		node := r.Get(key)
		if node != "node1" && node != "node3" {
			t.Fatalf("expected node1 or node3, got %s", node)
		}
	}
}

func TestRing_RemoveNonExistent(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")
	r.Remove("nonexistent") // should be a no-op
	if r.Size() != 1 {
		t.Fatalf("expected size=1, got %d", r.Size())
	}
}

func TestRing_AddIdempotent(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")
	r.Add("node1") // duplicate
	if r.Size() != 1 {
		t.Fatalf("expected size=1, got %d", r.Size())
	}
}

func TestRing_Members(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")
	r.Add("node2")
	r.Add("node3")

	members := r.Members()
	if len(members) != 3 {
		t.Fatalf("expected 3 members, got %d", len(members))
	}

	memberSet := make(map[string]bool)
	for _, m := range members {
		memberSet[m] = true
	}
	for _, expected := range []string{"node1", "node2", "node3"} {
		if !memberSet[expected] {
			t.Fatalf("missing member: %s", expected)
		}
	}
}

func TestRing_ConsistentAfterAddRemove(t *testing.T) {
	r := NewRing(64)
	r.Add("node1")
	r.Add("node2")

	key := "stable-domain.com"
	before := r.Get(key)

	// Add a third node
	r.Add("node3")

	// The key might move to node3 or stay, but should still be deterministic
	after := r.Get(key)
	afterAgain := r.Get(key)
	if after != afterAgain {
		t.Fatal("not deterministic after ring change")
	}

	_ = before // we accept that adding nodes might rehash
}

func TestRing_DefaultReplicas(t *testing.T) {
	r := NewRing(0) // should default to 64
	if r.replicas != 64 {
		t.Fatalf("expected default replicas=64, got %d", r.replicas)
	}
}

// TestRing_OrderIndependentOwnership verifies that ownership is identical
// regardless of the order nodes were added (M3): the deterministic tie-break in
// rebuildLocked means two nodes with the same membership always agree on owners,
// even if map iteration / a hash collision would otherwise reorder vnodes.
func TestRing_OrderIndependentOwnership(t *testing.T) {
	nodes := []string{"node-alpha-01", "node-bravo-02", "node-charlie-3", "node-delta-04", "node-echo-0005"}

	a := NewRing(64)
	for _, n := range nodes {
		a.Add(n)
	}
	// Same set, reverse insertion order.
	b := NewRing(64)
	for i := len(nodes) - 1; i >= 0; i-- {
		b.Add(nodes[i])
	}

	for i := 0; i < 2000; i++ {
		key := fmt.Sprintf("doc-%d", i)
		if a.Get(key) != b.Get(key) {
			t.Fatalf("ownership disagreement for %q: %s vs %s", key, a.Get(key), b.Get(key))
		}
		// Replica sets must match too.
		ra, rb := a.GetN(key, 3), b.GetN(key, 3)
		if len(ra) != len(rb) {
			t.Fatalf("replica count mismatch for %q", key)
		}
		for j := range ra {
			if ra[j] != rb[j] {
				t.Fatalf("replica[%d] disagreement for %q: %s vs %s", j, key, ra[j], rb[j])
			}
		}
	}
}
