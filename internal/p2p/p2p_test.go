package p2p

import (
	"encoding/json"
	"sort"
	"testing"
)

// ---- ComputeMerkleRoot tests ----

func TestComputeMerkleRoot_Deterministic(t *testing.T) {
	ids := []string{"doc1", "doc2", "doc3"}

	root1 := ComputeMerkleRoot(ids)
	root2 := ComputeMerkleRoot(ids)

	if root1 != root2 {
		t.Fatalf("expected deterministic root, got %s vs %s", root1, root2)
	}
}

func TestComputeMerkleRoot_OrderIndependent(t *testing.T) {
	ids1 := []string{"doc3", "doc1", "doc2"}
	ids2 := []string{"doc1", "doc2", "doc3"}

	root1 := ComputeMerkleRoot(ids1)
	root2 := ComputeMerkleRoot(ids2)

	if root1 != root2 {
		t.Fatalf("expected same root regardless of input order, got %s vs %s", root1, root2)
	}
}

func TestComputeMerkleRoot_Empty(t *testing.T) {
	root := ComputeMerkleRoot(nil)
	if root != "" {
		t.Fatalf("expected empty root for nil input, got %s", root)
	}

	root = ComputeMerkleRoot([]string{})
	if root != "" {
		t.Fatalf("expected empty root for empty input, got %s", root)
	}
}

func TestComputeMerkleRoot_DifferentSets(t *testing.T) {
	root1 := ComputeMerkleRoot([]string{"doc1", "doc2"})
	root2 := ComputeMerkleRoot([]string{"doc1", "doc3"})

	if root1 == root2 {
		t.Fatal("expected different roots for different sets")
	}
}

// ---- ShardCatalog serialization tests ----

func TestShardCatalog_JSON(t *testing.T) {
	catalog := ShardCatalog{
		PeerID:     "QmTest1234567890",
		Domains:    []string{"example.com", "test.org"},
		DocCount:   1000,
		Generation: 5,
	}

	data, err := json.Marshal(catalog)
	if err != nil {
		t.Fatal(err)
	}

	var decoded ShardCatalog
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}

	if decoded.PeerID != catalog.PeerID {
		t.Fatalf("PeerID mismatch: %s vs %s", decoded.PeerID, catalog.PeerID)
	}
	if decoded.DocCount != 1000 {
		t.Fatalf("DocCount mismatch: %d", decoded.DocCount)
	}
	if decoded.Generation != 5 {
		t.Fatalf("Generation mismatch: %d", decoded.Generation)
	}
	if len(decoded.Domains) != 2 {
		t.Fatalf("expected 2 domains, got %d", len(decoded.Domains))
	}
}

// ---- ReplicateRequest serialization tests ----

func TestReplicateRequest_JSON(t *testing.T) {
	req := ReplicateRequest{
		Generation: 10,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}

	var decoded ReplicateRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}

	if decoded.Generation != 10 {
		t.Fatalf("expected generation=10, got %d", decoded.Generation)
	}
}

// ---- Protocol constants tests ----

func TestProtocolConstants(t *testing.T) {
	protocols := []string{
		string(CrawlProtocol),
		string(IndexProtocol),
		string(SearchProtocol),
		string(ShardProtocol),
		string(ReplicateProtocol),
	}

	// All protocols should be unique
	sort.Strings(protocols)
	for i := 1; i < len(protocols); i++ {
		if protocols[i] == protocols[i-1] {
			t.Fatalf("duplicate protocol: %s", protocols[i])
		}
	}

	// Topics should be unique
	if URLFrontierTopic == ShardCatalogTopic {
		t.Fatal("topics should be different")
	}
}
