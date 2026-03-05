package store

import (
	"testing"
)

func TestClusterStore_PutAndGet(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewClusterStore(bs)

	c := &Cluster{
		ID:       "c1",
		Label:    "Machine Learning",
		DocIDs:   []string{"doc1", "doc2", "doc3"},
		Keywords: []string{"ml", "neural", "training"},
	}
	if err := cs.PutCluster(c); err != nil {
		t.Fatalf("PutCluster: %v", err)
	}

	got, err := cs.GetCluster("c1")
	if err != nil {
		t.Fatalf("GetCluster: %v", err)
	}
	if got.Label != "Machine Learning" {
		t.Fatalf("unexpected label: %s", got.Label)
	}
	if len(got.DocIDs) != 3 {
		t.Fatalf("expected 3 doc IDs, got %d", len(got.DocIDs))
	}
}

func TestClusterStore_GetNotFound(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewClusterStore(bs)

	got, err := cs.GetCluster("nonexistent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Fatal("expected nil for nonexistent cluster")
	}
}

func TestClusterStore_RelatedTopics(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewClusterStore(bs)

	cs.PutCluster(&Cluster{ID: "c1", Label: "Machine Learning", DocIDs: []string{"doc1", "doc2"}})
	cs.PutCluster(&Cluster{ID: "c2", Label: "Web Development", DocIDs: []string{"doc3", "doc4"}})
	cs.PutCluster(&Cluster{ID: "c3", Label: "Data Science", DocIDs: []string{"doc1", "doc5"}})

	// doc1 appears in ML and Data Science
	labels := cs.RelatedTopics([]string{"doc1"}, 10)
	if len(labels) < 2 {
		t.Fatalf("expected >= 2 related topics for doc1, got %d: %v", len(labels), labels)
	}

	// doc3 appears only in Web Development
	labels = cs.RelatedTopics([]string{"doc3"}, 10)
	if len(labels) != 1 || labels[0] != "Web Development" {
		t.Fatalf("expected [Web Development] for doc3, got %v", labels)
	}

	// Unknown doc
	labels = cs.RelatedTopics([]string{"unknown"}, 10)
	if len(labels) != 0 {
		t.Fatalf("expected no topics for unknown doc, got %v", labels)
	}
}

func TestClusterStore_Update(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewClusterStore(bs)

	cs.PutCluster(&Cluster{ID: "c1", Label: "Old Label", DocIDs: []string{"doc1"}})
	cs.PutCluster(&Cluster{ID: "c1", Label: "New Label", DocIDs: []string{"doc1", "doc2"}})

	got, _ := cs.GetCluster("c1")
	if got.Label != "New Label" {
		t.Fatalf("expected updated label, got %s", got.Label)
	}
	if len(got.DocIDs) != 2 {
		t.Fatalf("expected 2 doc IDs after update, got %d", len(got.DocIDs))
	}
}
