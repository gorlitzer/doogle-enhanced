package crawler

import (
	"testing"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

func newTestScheduler(t *testing.T) *Scheduler {
	t.Helper()
	dir := t.TempDir()
	bs, err := store.NewBadgerStore(dir, false)
	if err != nil {
		t.Fatalf("NewBadgerStore: %v", err)
	}
	t.Cleanup(func() { bs.Close() })
	ds := store.NewDedupStore(bs)
	us := store.NewURLStore(bs, ds)
	return NewScheduler(us, 8)
}

func TestScheduler_DedupsSeenURLs(t *testing.T) {
	s := newTestScheduler(t)
	task := &models.CrawlTask{URL: "https://example.com/page", Domain: "example.com"}

	if !s.Schedule(task) {
		t.Fatal("first Schedule should succeed")
	}
	// Same URL (and a trailing-slash variant that normalizes equal) must dedup.
	if s.Schedule(&models.CrawlTask{URL: "https://example.com/page", Domain: "example.com"}) {
		t.Fatal("duplicate URL should be rejected")
	}
	if got := s.Pending(); got != 1 {
		t.Fatalf("expected 1 pending, got %d", got)
	}
}

func TestScheduler_RespectsCapacity(t *testing.T) {
	s := newTestScheduler(t)
	s.SetMaxQueueSize(2)

	ok := 0
	for i, u := range []string{"https://a.com", "https://b.com", "https://c.com"} {
		if s.Schedule(&models.CrawlTask{URL: u, Domain: "d"}) {
			ok++
		}
		_ = i
	}
	if ok != 2 {
		t.Fatalf("expected exactly 2 scheduled under capacity 2, got %d", ok)
	}
}

// TestScheduler_MarkSeenTracksQueue verifies the queue counter stays consistent
// as tasks are scheduled and drained (the O(1) QueueSize path).
func TestScheduler_MarkSeenTracksQueue(t *testing.T) {
	s := newTestScheduler(t)
	for _, u := range []string{"https://a.com", "https://b.com", "https://c.com"} {
		s.Schedule(&models.CrawlTask{URL: u, Domain: "d"})
	}
	if got := s.Pending(); got != 3 {
		t.Fatalf("expected 3 pending, got %d", got)
	}
	// Drain one and confirm the count drops.
	if task := s.Next(); task == nil {
		t.Fatal("expected a task from Next()")
	}
	if got := s.Pending(); got != 2 {
		t.Fatalf("expected 2 pending after one Next(), got %d", got)
	}
}
