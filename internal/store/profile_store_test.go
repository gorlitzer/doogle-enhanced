package store

import (
	"sync"
	"testing"
)

func TestProfileStore_GetEmpty(t *testing.T) {
	bs := newTestBadger(t)
	ps := NewProfileStore(bs)

	p, err := ps.Get()
	if err != nil {
		t.Fatal(err)
	}
	if p == nil {
		t.Fatal("expected non-nil profile")
	}
	if len(p.Interests) != 0 {
		t.Fatalf("expected empty interests, got %d", len(p.Interests))
	}
	if p.ReportsMade != 0 {
		t.Fatalf("expected 0 reports, got %d", p.ReportsMade)
	}
	if p.CreatedAt.IsZero() {
		t.Fatal("expected non-zero CreatedAt")
	}
}

func TestProfileStore_SaveAndGet(t *testing.T) {
	bs := newTestBadger(t)
	ps := NewProfileStore(bs)

	p, _ := ps.Get()
	p.Interests["tech"] = 1.0
	p.ReportsMade = 5

	if err := ps.Save(p); err != nil {
		t.Fatal(err)
	}

	loaded, err := ps.Get()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Interests["tech"] != 1.0 {
		t.Fatalf("expected tech=1.0, got %f", loaded.Interests["tech"])
	}
	if loaded.ReportsMade != 5 {
		t.Fatalf("expected 5 reports, got %d", loaded.ReportsMade)
	}
}

func TestProfileStore_RecordInterests(t *testing.T) {
	bs := newTestBadger(t)
	ps := NewProfileStore(bs)

	if err := ps.RecordInterests([]string{"gaming", "music", "tech"}); err != nil {
		t.Fatal(err)
	}

	p, err := ps.Get()
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Interests) != 3 {
		t.Fatalf("expected 3 interests, got %d", len(p.Interests))
	}
	for _, id := range []string{"gaming", "music", "tech"} {
		if p.Interests[id] != 1.0 {
			t.Fatalf("expected %s=1.0, got %f", id, p.Interests[id])
		}
	}
}

func TestProfileStore_RecordSearchTopic(t *testing.T) {
	bs := newTestBadger(t)
	ps := NewProfileStore(bs)

	for i := 0; i < 5; i++ {
		if err := ps.RecordSearchTopic("science"); err != nil {
			t.Fatal(err)
		}
	}
	if err := ps.RecordSearchTopic("gaming"); err != nil {
		t.Fatal(err)
	}

	p, err := ps.Get()
	if err != nil {
		t.Fatal(err)
	}
	if p.SearchTopics["science"] != 5 {
		t.Fatalf("expected science=5, got %d", p.SearchTopics["science"])
	}
	if p.SearchTopics["gaming"] != 1 {
		t.Fatalf("expected gaming=1, got %d", p.SearchTopics["gaming"])
	}
}

func TestProfileStore_RecordReport(t *testing.T) {
	bs := newTestBadger(t)
	ps := NewProfileStore(bs)

	for i := 0; i < 3; i++ {
		if err := ps.RecordReport(); err != nil {
			t.Fatal(err)
		}
	}

	p, err := ps.Get()
	if err != nil {
		t.Fatal(err)
	}
	if p.ReportsMade != 3 {
		t.Fatalf("expected 3 reports, got %d", p.ReportsMade)
	}
}

func TestProfileStore_ConcurrentWrites(t *testing.T) {
	bs := newTestBadger(t)
	ps := NewProfileStore(bs)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = ps.RecordReport()
		}()
	}
	wg.Wait()

	p, err := ps.Get()
	if err != nil {
		t.Fatal(err)
	}
	if p.ReportsMade != 10 {
		t.Fatalf("expected 10 reports after concurrent writes, got %d", p.ReportsMade)
	}
}
