package store

import (
	"testing"
)

func TestClickStore_RecordAndGet(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewClickStore(bs)

	// No clicks initially
	if count := cs.GetClickCount("golang tutorial", "https://go.dev"); count != 0 {
		t.Fatalf("expected 0 clicks, got %d", count)
	}

	// Record clicks
	cs.RecordClick("golang tutorial", "https://go.dev", 1)
	cs.RecordClick("golang tutorial", "https://go.dev", 1)
	cs.RecordClick("golang tutorial", "https://go.dev", 2)

	count := cs.GetClickCount("golang tutorial", "https://go.dev")
	if count != 3 {
		t.Fatalf("expected 3 clicks, got %d", count)
	}

	// Different URL
	cs.RecordClick("golang tutorial", "https://tour.golang.org", 3)
	if c := cs.GetClickCount("golang tutorial", "https://tour.golang.org"); c != 1 {
		t.Fatalf("expected 1 click for second URL, got %d", c)
	}
}

func TestClickStore_AllClicks(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewClickStore(bs)

	cs.RecordClick("query1", "https://a.com", 1)
	cs.RecordClick("query1", "https://a.com", 1)
	cs.RecordClick("query1", "https://b.com", 2)
	cs.RecordClick("query2", "https://c.com", 1)

	all := cs.AllClicks()
	if len(all) < 2 {
		t.Fatalf("expected >= 2 queries, got %d", len(all))
	}

	q1Records := all["query1"]
	if len(q1Records) != 2 {
		t.Fatalf("expected 2 records for query1, got %d", len(q1Records))
	}

	// Verify click count for a.com
	found := false
	for _, r := range q1Records {
		if r.URL == "https://a.com" {
			if r.Clicks != 2 {
				t.Fatalf("expected 2 clicks for a.com, got %d", r.Clicks)
			}
			found = true
		}
	}
	if !found {
		t.Fatal("expected a.com in query1 records")
	}
}

func TestClickStore_TotalClickPairs(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewClickStore(bs)

	// No data
	if pairs := cs.TotalClickPairs(); pairs != 0 {
		t.Fatalf("expected 0 pairs, got %d", pairs)
	}

	// 2 URLs for same query → 1 pair
	cs.RecordClick("q1", "https://a.com", 1)
	cs.RecordClick("q1", "https://b.com", 2)
	pairs := cs.TotalClickPairs()
	if pairs != 1 {
		t.Fatalf("expected 1 pair for 2 URLs, got %d", pairs)
	}

	// 3 URLs for same query → 3 pairs
	cs.RecordClick("q1", "https://c.com", 3)
	pairs = cs.TotalClickPairs()
	if pairs != 3 {
		t.Fatalf("expected 3 pairs for 3 URLs, got %d", pairs)
	}
}
