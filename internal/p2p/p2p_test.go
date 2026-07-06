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

func TestShardCatalog_CountryField(t *testing.T) {
	catalog := ShardCatalog{
		PeerID:   "QmTestPeer",
		NodeName: "TestNode",
		Country:  "DE",
		DocCount: 42,
	}

	data, err := json.Marshal(catalog)
	if err != nil {
		t.Fatal(err)
	}

	var decoded ShardCatalog
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}

	if decoded.Country != "DE" {
		t.Fatalf("expected country DE, got %q", decoded.Country)
	}
}

func TestShardCatalog_CountryOmitEmpty(t *testing.T) {
	catalog := ShardCatalog{
		PeerID:   "QmTestPeer",
		DocCount: 10,
	}

	data, err := json.Marshal(catalog)
	if err != nil {
		t.Fatal(err)
	}

	// Country should be omitted when empty
	raw := string(data)
	if contains(raw, `"country"`) {
		t.Fatalf("expected country to be omitted, got: %s", raw)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && searchString(s, sub)
}

func searchString(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
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

// TestFingerprint_DetectsContentDivergence is the M1 regression test: two
// replicas with the same doc IDs but different content must produce different
// Merkle roots (previously the ID-only root reported them "in sync" forever).
func TestFingerprint_DetectsContentDivergence(t *testing.T) {
	ids := []string{"doc-1", "doc-2", "doc-3"}
	hashesA := map[string]string{"doc-1": "h1", "doc-2": "h2", "doc-3": "h3"}
	hashesB := map[string]string{"doc-1": "h1", "doc-2": "h2-CHANGED", "doc-3": "h3"}

	fp := func(m map[string]string) []string {
		out := make([]string, 0, len(ids))
		for _, id := range ids {
			out = append(out, Fingerprint(id, m[id]))
		}
		return out
	}

	rootA := ComputeMerkleRoot(fp(hashesA))
	rootB := ComputeMerkleRoot(fp(hashesB))
	if rootA == rootB {
		t.Fatal("expected different Merkle roots when content diverges")
	}

	// Same content → same root (order independent).
	if ComputeMerkleRoot(fp(hashesA)) != ComputeMerkleRoot(fp(hashesA)) {
		t.Fatal("expected identical roots for identical content")
	}

	// FingerprintID round-trips the doc ID.
	if got := FingerprintID(Fingerprint("doc-9", "abc")); got != "doc-9" {
		t.Fatalf("FingerprintID = %q, want doc-9", got)
	}
}
