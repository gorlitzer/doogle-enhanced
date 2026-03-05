package store

import (
	"testing"
)

func TestEntityStore_PutAndFind(t *testing.T) {
	bs := newTestBadger(t)
	es := NewEntityStore(bs)

	e := &Entity{
		Name:        "Go",
		Type:        "technology",
		Description: "A programming language",
		Properties:  map[string]string{"creator": "Google"},
	}
	if err := es.PutEntity(e); err != nil {
		t.Fatalf("PutEntity: %v", err)
	}

	// FindEntity (any type)
	found := es.FindEntity("Go")
	if found == nil {
		t.Fatal("expected entity to be found")
	}
	if found.Description != "A programming language" {
		t.Fatalf("unexpected description: %s", found.Description)
	}

	// FindEntityByType
	found = es.FindEntityByType("technology", "Go")
	if found == nil {
		t.Fatal("expected entity found by type")
	}

	// Wrong type
	found = es.FindEntityByType("person", "Go")
	if found != nil {
		t.Fatal("expected nil for wrong type")
	}

	// Not found
	found = es.FindEntity("Nonexistent")
	if found != nil {
		t.Fatal("expected nil for nonexistent entity")
	}
}

func TestEntityStore_AddDocumentEntities(t *testing.T) {
	bs := newTestBadger(t)
	es := NewEntityStore(bs)

	entities := []TypedEntity{
		{Name: "Kubernetes", Type: "technology", Confidence: 0.9},
		{Name: "Docker", Type: "technology", Confidence: 0.8},
		{Name: "Google", Type: "organization", Confidence: 0.7},
	}

	if err := es.AddDocumentEntities("doc1", entities); err != nil {
		t.Fatalf("AddDocumentEntities: %v", err)
	}

	// Verify entities stored
	k8s := es.FindEntityByType("technology", "Kubernetes")
	if k8s == nil {
		t.Fatal("expected Kubernetes entity")
	}
	if len(k8s.DocumentIDs) != 1 || k8s.DocumentIDs[0] != "doc1" {
		t.Fatalf("unexpected doc IDs: %v", k8s.DocumentIDs)
	}

	// Add same doc again — should not duplicate
	if err := es.AddDocumentEntities("doc1", entities); err != nil {
		t.Fatalf("AddDocumentEntities duplicate: %v", err)
	}
	k8s = es.FindEntityByType("technology", "Kubernetes")
	if len(k8s.DocumentIDs) != 1 {
		t.Fatalf("expected 1 doc ID after duplicate, got %d", len(k8s.DocumentIDs))
	}

	// Add different doc
	if err := es.AddDocumentEntities("doc2", entities); err != nil {
		t.Fatalf("AddDocumentEntities doc2: %v", err)
	}
	k8s = es.FindEntityByType("technology", "Kubernetes")
	if len(k8s.DocumentIDs) != 2 {
		t.Fatalf("expected 2 doc IDs, got %d", len(k8s.DocumentIDs))
	}

	// Related names should be populated via co-occurrence
	if len(k8s.RelatedNames) == 0 {
		t.Fatal("expected related names from co-occurrence")
	}
}

func TestEntityStore_LowConfidenceFiltered(t *testing.T) {
	bs := newTestBadger(t)
	es := NewEntityStore(bs)

	entities := []TypedEntity{
		{Name: "LowConf", Type: "topic", Confidence: 0.1},
	}
	if err := es.AddDocumentEntities("doc1", entities); err != nil {
		t.Fatalf("AddDocumentEntities: %v", err)
	}

	found := es.FindEntity("LowConf")
	if found != nil {
		t.Fatal("expected low-confidence entity to be filtered")
	}
}

func TestEntityStore_Search(t *testing.T) {
	bs := newTestBadger(t)
	es := NewEntityStore(bs)

	for _, name := range []string{"Python", "PyTorch", "Pandas"} {
		es.PutEntity(&Entity{Name: name, Type: "technology"})
	}

	results := es.SearchEntities("py", 10)
	if len(results) < 2 {
		t.Fatalf("expected >= 2 results for 'py', got %d", len(results))
	}

	results = es.SearchEntities("nonexistent", 10)
	if len(results) != 0 {
		t.Fatalf("expected 0 results for nonexistent, got %d", len(results))
	}
}

func TestEntityStore_GetRelated(t *testing.T) {
	bs := newTestBadger(t)
	es := NewEntityStore(bs)

	// Create co-occurring entities
	entities := []TypedEntity{
		{Name: "React", Type: "technology", Confidence: 0.9},
		{Name: "JavaScript", Type: "technology", Confidence: 0.9},
	}
	es.AddDocumentEntities("doc1", entities)

	related := es.GetRelatedEntities("React", 5)
	if len(related) == 0 {
		t.Fatal("expected related entities for React")
	}

	// No relations for unknown entity
	related = es.GetRelatedEntities("Unknown", 5)
	if len(related) != 0 {
		t.Fatalf("expected no related entities for unknown, got %d", len(related))
	}
}
