package store

import (
	"testing"
)

func TestTrendStore_IncrementAndVolume(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrendStore(bs)

	// Increment crawl
	ts.IncrementCrawl("example.com")
	ts.IncrementCrawl("example.com")
	ts.IncrementCrawl("other.com")

	vol := ts.GetVolume("crawl", "example.com", 24)
	if vol != 2 {
		t.Fatalf("expected volume=2, got %d", vol)
	}
	vol = ts.GetVolume("crawl", "other.com", 24)
	if vol != 1 {
		t.Fatalf("expected volume=1, got %d", vol)
	}
}

func TestTrendStore_IncrementQuery(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrendStore(bs)

	ts.IncrementQuery([]string{"golang", "tutorial"})
	ts.IncrementQuery([]string{"golang", "concurrency"})

	vol := ts.GetVolume("query", "golang", 24)
	if vol != 2 {
		t.Fatalf("expected volume=2 for 'golang', got %d", vol)
	}
	vol = ts.GetVolume("query", "tutorial", 24)
	if vol != 1 {
		t.Fatalf("expected volume=1 for 'tutorial', got %d", vol)
	}
}

func TestTrendStore_ShortTermsFiltered(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrendStore(bs)

	// Short terms (<=2 chars) should be filtered
	ts.IncrementQuery([]string{"go", "is", "ok"})
	vol := ts.GetVolume("query", "go", 24)
	if vol != 0 {
		t.Fatalf("expected short term filtered, got volume=%d", vol)
	}
}

func TestTrendStore_TrendingDomains(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrendStore(bs)

	for i := 0; i < 5; i++ {
		ts.IncrementCrawl("hot.com")
	}
	ts.IncrementCrawl("cold.com")

	trending := ts.TrendingDomains(10)
	if len(trending) == 0 {
		t.Fatal("expected some trending domains")
	}
	if trending[0].Name != "hot.com" {
		t.Fatalf("expected hot.com first, got %s", trending[0].Name)
	}
}

func TestTrendStore_TrendingQueries(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrendStore(bs)

	for i := 0; i < 10; i++ {
		ts.IncrementQuery([]string{"trending"})
	}
	ts.IncrementQuery([]string{"boring"})

	trending := ts.TrendingQueries(10)
	if len(trending) == 0 {
		t.Fatal("expected some trending queries")
	}
}

func TestTrendStore_DetectSpikes(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrendStore(bs)

	// Without averages, everything has high velocity
	for i := 0; i < 20; i++ {
		ts.IncrementQuery([]string{"spike"})
	}

	spikes := ts.DetectSpikes(2.0)
	// Should find spike since no average computed yet (default 0.1)
	if len(spikes) == 0 {
		t.Fatal("expected spike detection for high volume with no average")
	}
}

func TestTrendStore_GetTrends(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrendStore(bs)

	ts.IncrementQuery([]string{"test"})
	ts.IncrementCrawl("test.com")

	trends := ts.GetTrends()
	if trends == nil {
		t.Fatal("expected non-nil trends response")
	}
	if trends.ComputedAt.IsZero() {
		t.Fatal("expected non-zero ComputedAt")
	}
}
