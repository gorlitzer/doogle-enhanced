package node

import (
	"testing"

	"github.com/doogle/doogle-v2/internal/p2p"
)

func TestComputeMerkleRootDeterminism(t *testing.T) {
	ids1 := []string{"doc_c", "doc_a", "doc_b"}
	ids2 := []string{"doc_a", "doc_b", "doc_c"}
	ids3 := []string{"doc_b", "doc_c", "doc_a"}

	root1 := p2p.ComputeMerkleRoot(ids1)
	root2 := p2p.ComputeMerkleRoot(ids2)
	root3 := p2p.ComputeMerkleRoot(ids3)

	if root1 != root2 {
		t.Fatalf("expected same root regardless of order, got %s vs %s", root1, root2)
	}
	if root1 != root3 {
		t.Fatalf("expected same root regardless of order, got %s vs %s", root1, root3)
	}

	// Different set should produce different root
	root4 := p2p.ComputeMerkleRoot([]string{"doc_a", "doc_b", "doc_d"})
	if root1 == root4 {
		t.Fatal("expected different roots for different ID sets")
	}
}

func TestComputeMerkleRootEmpty(t *testing.T) {
	root := p2p.ComputeMerkleRoot(nil)
	if root != "" {
		t.Fatalf("expected empty root for nil IDs, got %s", root)
	}
	root = p2p.ComputeMerkleRoot([]string{})
	if root != "" {
		t.Fatalf("expected empty root for empty IDs, got %s", root)
	}
}

func TestAntiEntropyMissingDetection(t *testing.T) {
	localIDs := []string{"id_a", "id_b", "id_c"}
	remoteIDs := []string{"id_a", "id_b", "id_c", "id_d"}

	// Simulate what handleAntiEntropyRequest does: find IDs in remote that local doesn't have
	localSet := make(map[string]struct{}, len(localIDs))
	for _, id := range localIDs {
		localSet[id] = struct{}{}
	}

	var missingIDs []string
	for _, id := range remoteIDs {
		if _, exists := localSet[id]; !exists {
			missingIDs = append(missingIDs, id)
		}
	}

	if len(missingIDs) != 1 {
		t.Fatalf("expected 1 missing ID, got %d", len(missingIDs))
	}
	if missingIDs[0] != "id_d" {
		t.Fatalf("expected missing ID 'id_d', got %s", missingIDs[0])
	}
}

func TestAntiEntropyInSync(t *testing.T) {
	ids := []string{"id_a", "id_b", "id_c"}

	localRoot := p2p.ComputeMerkleRoot(ids)
	remoteRoot := p2p.ComputeMerkleRoot(ids)

	if localRoot != remoteRoot {
		t.Fatalf("expected matching roots for identical ID sets, got %s vs %s", localRoot, remoteRoot)
	}

	// Same IDs → status should be "ok"
	status := "diverged"
	if localRoot == remoteRoot {
		status = "ok"
	}
	if status != "ok" {
		t.Fatalf("expected status 'ok', got %s", status)
	}
}

func TestAntiEntropyDiverged(t *testing.T) {
	localIDs := []string{"id_a", "id_b"}
	remoteIDs := []string{"id_a", "id_b", "id_c"}

	localRoot := p2p.ComputeMerkleRoot(localIDs)
	remoteRoot := p2p.ComputeMerkleRoot(remoteIDs)

	if localRoot == remoteRoot {
		t.Fatal("expected different roots for different ID sets")
	}

	// Simulate detection
	localSet := make(map[string]struct{}, len(localIDs))
	for _, id := range localIDs {
		localSet[id] = struct{}{}
	}
	var missing []string
	for _, id := range remoteIDs {
		if _, exists := localSet[id]; !exists {
			missing = append(missing, id)
		}
	}

	if len(missing) != 1 || missing[0] != "id_c" {
		t.Fatalf("expected [id_c] missing, got %v", missing)
	}
}
