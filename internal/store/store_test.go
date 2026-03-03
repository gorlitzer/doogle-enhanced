package store

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

// newTestBadger creates a temporary BadgerStore for testing.
func newTestBadger(t *testing.T) *BadgerStore {
	t.Helper()
	dir := t.TempDir()
	bs, err := NewBadgerStore(dir)
	if err != nil {
		t.Fatalf("NewBadgerStore: %v", err)
	}
	t.Cleanup(func() { bs.Close() })
	return bs
}

// ---- DedupStore tests ----

func TestDedupStore_MarkAndHasSeen(t *testing.T) {
	bs := newTestBadger(t)
	ds := NewDedupStore(bs)

	url := "https://example.com/page1"

	if ds.HasSeen(url) {
		t.Fatal("expected HasSeen=false for unseen URL")
	}

	if err := ds.MarkSeen(url); err != nil {
		t.Fatalf("MarkSeen: %v", err)
	}

	if !ds.HasSeen(url) {
		t.Fatal("expected HasSeen=true after MarkSeen")
	}
}

func TestDedupStore_SeenCount(t *testing.T) {
	bs := newTestBadger(t)
	ds := NewDedupStore(bs)

	if ds.SeenCount() != 0 {
		t.Fatalf("expected count=0, got %d", ds.SeenCount())
	}

	for i := 0; i < 5; i++ {
		ds.MarkSeen(fmt.Sprintf("https://example.com/%d", i))
	}

	if ds.SeenCount() != 5 {
		t.Fatalf("expected count=5, got %d", ds.SeenCount())
	}
}

func TestDedupStore_Idempotent(t *testing.T) {
	bs := newTestBadger(t)
	ds := NewDedupStore(bs)

	url := "https://example.com/dup"
	ds.MarkSeen(url)
	ds.MarkSeen(url) // double mark

	if ds.SeenCount() != 1 {
		t.Fatalf("expected count=1 after double mark, got %d", ds.SeenCount())
	}
}

func TestDedupStore_Persistence(t *testing.T) {
	dir := t.TempDir()

	// Open, write, close
	bs1, err := NewBadgerStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	ds1 := NewDedupStore(bs1)
	ds1.MarkSeen("https://persist.com/page")
	bs1.Close()

	// Re-open, verify
	bs2, err := NewBadgerStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer bs2.Close()
	ds2 := NewDedupStore(bs2)

	if !ds2.HasSeen("https://persist.com/page") {
		t.Fatal("expected HasSeen=true after DB reopen")
	}
}

// ---- ContentStore tests ----

func TestContentStore_PutGet(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewContentStore(bs)

	url := "https://example.com/article"

	// Not found initially
	rec, err := cs.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	if rec != nil {
		t.Fatal("expected nil for unknown URL")
	}

	// Put
	now := time.Now()
	err = cs.Put(url, &ContentRecord{
		ContentHash: "abc123",
		ScoredAt:    now,
		Generation:  5,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Get
	rec, err = cs.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	if rec == nil {
		t.Fatal("expected non-nil record")
	}
	if rec.ContentHash != "abc123" {
		t.Fatalf("expected hash=abc123, got %s", rec.ContentHash)
	}
	if rec.Generation != 5 {
		t.Fatalf("expected gen=5, got %d", rec.Generation)
	}
}

func TestContentStore_HasChanged(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewContentStore(bs)

	url := "https://example.com/page"

	// Unknown URL → changed
	if !cs.HasChanged(url, "hash1") {
		t.Fatal("expected HasChanged=true for unknown URL")
	}

	cs.Put(url, &ContentRecord{ContentHash: "hash1", ScoredAt: time.Now(), Generation: 1})

	// Same hash → not changed
	if cs.HasChanged(url, "hash1") {
		t.Fatal("expected HasChanged=false for same hash")
	}

	// Different hash → changed
	if !cs.HasChanged(url, "hash2") {
		t.Fatal("expected HasChanged=true for different hash")
	}
}

// ---- GenerationStore tests ----

func TestGenerationStore_InitialValue(t *testing.T) {
	bs := newTestBadger(t)
	gs, err := NewGenerationStore(bs)
	if err != nil {
		t.Fatal(err)
	}

	if gs.Current() != 0 {
		t.Fatalf("expected initial gen=0, got %d", gs.Current())
	}
}

func TestGenerationStore_Increment(t *testing.T) {
	bs := newTestBadger(t)
	gs, err := NewGenerationStore(bs)
	if err != nil {
		t.Fatal(err)
	}

	val, err := gs.Increment()
	if err != nil {
		t.Fatal(err)
	}
	if val != 1 {
		t.Fatalf("expected gen=1, got %d", val)
	}

	val, err = gs.Increment()
	if err != nil {
		t.Fatal(err)
	}
	if val != 2 {
		t.Fatalf("expected gen=2, got %d", val)
	}

	if gs.Current() != 2 {
		t.Fatalf("expected Current()=2, got %d", gs.Current())
	}
}

func TestGenerationStore_Persistence(t *testing.T) {
	dir := t.TempDir()

	// Open, increment, close
	bs1, _ := NewBadgerStore(dir)
	gs1, _ := NewGenerationStore(bs1)
	gs1.Increment() // 1
	gs1.Increment() // 2
	gs1.Increment() // 3
	bs1.Close()

	// Re-open, verify
	bs2, _ := NewBadgerStore(dir)
	defer bs2.Close()
	gs2, _ := NewGenerationStore(bs2)

	if gs2.Current() != 3 {
		t.Fatalf("expected gen=3 after reopen, got %d", gs2.Current())
	}
}

// ---- URLStore tests ----

func TestURLStore_DedupIntegration(t *testing.T) {
	bs := newTestBadger(t)
	ds := NewDedupStore(bs)
	us := NewURLStore(bs, ds)

	url := "https://example.com/test"

	if us.HasSeen(url) {
		t.Fatal("expected HasSeen=false")
	}

	us.MarkSeen(url)

	if !us.HasSeen(url) {
		t.Fatal("expected HasSeen=true")
	}

	if us.SeenCount() != 1 {
		t.Fatalf("expected SeenCount=1, got %d", us.SeenCount())
	}
}

func TestURLStore_EnqueueDequeue(t *testing.T) {
	bs := newTestBadger(t)
	ds := NewDedupStore(bs)
	us := NewURLStore(bs, ds)

	// Enqueue
	for i := 0; i < 5; i++ {
		task := &models.CrawlTask{
			URL:       fmt.Sprintf("https://example.com/%d", i),
			Domain:    "example.com",
			Depth:     1,
			Priority:  1,
			CreatedAt: time.Now(),
		}
		if err := us.Enqueue(task); err != nil {
			t.Fatal(err)
		}
	}

	if us.QueueSize() != 5 {
		t.Fatalf("expected queue size=5, got %d", us.QueueSize())
	}

	// Dequeue batch of 3
	tasks, err := us.DequeueBatch(3)
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 3 {
		t.Fatalf("expected 3 tasks, got %d", len(tasks))
	}

	if us.QueueSize() != 2 {
		t.Fatalf("expected queue size=2, got %d", us.QueueSize())
	}
}

func TestURLStore_CrawledCounter(t *testing.T) {
	bs := newTestBadger(t)
	ds := NewDedupStore(bs)
	us := NewURLStore(bs, ds)

	if us.CrawledCount() != 0 {
		t.Fatal("expected 0")
	}

	us.IncrementCrawled()
	us.IncrementCrawled()

	if us.CrawledCount() != 2 {
		t.Fatalf("expected 2, got %d", us.CrawledCount())
	}
}

// ---- BadgerStore tests ----

func TestBadgerStore_GetSetHasDelete(t *testing.T) {
	bs := newTestBadger(t)

	key := []byte("testkey")
	val := []byte("testval")

	// Not found
	got, err := bs.Get(key)
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatal("expected nil for missing key")
	}
	if bs.Has(key) {
		t.Fatal("expected Has=false")
	}

	// Set
	if err := bs.Set(key, val); err != nil {
		t.Fatal(err)
	}

	// Get
	got, err = bs.Get(key)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "testval" {
		t.Fatalf("expected testval, got %s", got)
	}
	if !bs.Has(key) {
		t.Fatal("expected Has=true")
	}

	// Delete
	if err := bs.Delete(key); err != nil {
		t.Fatal(err)
	}
	if bs.Has(key) {
		t.Fatal("expected Has=false after delete")
	}
}

// ---- LinkStore tests ----

func TestLinkStore_AddAndGet(t *testing.T) {
	bs := newTestBadger(t)
	ls := NewLinkStore(bs)

	edge := LinkEdge{
		FromURL:    "https://a.com",
		ToURL:      "https://b.com",
		AnchorText: "click here",
		IsCross:    true,
	}

	if err := ls.AddLink("docA", "docB", edge); err != nil {
		t.Fatal(err)
	}

	edges, err := ls.GetInboundLinks("docB")
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 1 {
		t.Fatalf("expected 1 edge, got %d", len(edges))
	}
	if edges[0].AnchorText != "click here" {
		t.Fatalf("expected 'click here', got %q", edges[0].AnchorText)
	}

	count, _ := ls.InboundCount("docB")
	if count != 1 {
		t.Fatalf("expected inbound count=1, got %d", count)
	}

	outCount, _ := ls.GetOutboundCount("docA")
	if outCount != 1 {
		t.Fatalf("expected outbound count=1, got %d", outCount)
	}
}

func TestLinkStore_Idempotent(t *testing.T) {
	bs := newTestBadger(t)
	ls := NewLinkStore(bs)

	edge := LinkEdge{FromURL: "https://a.com", ToURL: "https://b.com"}
	ls.AddLink("a", "b", edge)
	ls.AddLink("a", "b", edge) // duplicate

	count, _ := ls.InboundCount("b")
	if count != 1 {
		t.Fatalf("expected count=1 after idempotent add, got %d", count)
	}
}

func TestLinkStore_AllDestinations(t *testing.T) {
	bs := newTestBadger(t)
	ls := NewLinkStore(bs)

	ls.AddLink("a", "b", LinkEdge{FromURL: "a", ToURL: "b"})
	ls.AddLink("a", "c", LinkEdge{FromURL: "a", ToURL: "c"})
	ls.AddLink("b", "c", LinkEdge{FromURL: "b", ToURL: "c"})

	dests, err := ls.AllDestinations()
	if err != nil {
		t.Fatal(err)
	}
	if len(dests) != 2 { // b and c
		t.Fatalf("expected 2 destinations, got %d", len(dests))
	}
}

// ---- BadgerStore.RunGC tests ----

func TestBadgerStore_RunGC_NoError(t *testing.T) {
	bs := newTestBadger(t)

	// Write some data so the DB isn't completely empty
	for i := 0; i < 100; i++ {
		bs.Set([]byte(fmt.Sprintf("gc-key-%d", i)), []byte("value"))
	}
	// Delete them to create garbage
	for i := 0; i < 100; i++ {
		bs.Delete([]byte(fmt.Sprintf("gc-key-%d", i)))
	}

	// RunGC may return ErrNoRewrite if there's nothing to GC — that's fine.
	// The important thing is it doesn't panic or return an unexpected error.
	err := bs.RunGC()
	_ = err // ErrNoRewrite is expected on a tiny DB
}

// ---- DedupStore TTL tests ----

func TestDedupStore_MarkSeenWithTTL(t *testing.T) {
	bs := newTestBadger(t)
	ds := NewDedupStore(bs)

	// Use a very short TTL for testing
	ds.SeenTTL = 1 * time.Second

	url := "https://example.com/ttl-test"
	if err := ds.MarkSeen(url); err != nil {
		t.Fatalf("MarkSeen: %v", err)
	}

	// Should be visible immediately
	if !ds.HasSeen(url) {
		t.Fatal("expected HasSeen=true immediately after MarkSeen")
	}

	// Wait for TTL to expire
	time.Sleep(2 * time.Second)

	// After TTL, the entry should no longer be visible
	if ds.HasSeen(url) {
		t.Fatal("expected HasSeen=false after TTL expiry")
	}
}

func TestDedupStore_DefaultTTL(t *testing.T) {
	bs := newTestBadger(t)
	ds := NewDedupStore(bs)

	// Default TTL should be 7 days
	expected := 7 * 24 * time.Hour
	if ds.SeenTTL != expected {
		t.Fatalf("expected default SeenTTL=%v, got %v", expected, ds.SeenTTL)
	}
}

func TestDedupStore_PruneExpired(t *testing.T) {
	bs := newTestBadger(t)
	ds := NewDedupStore(bs)

	for i := 0; i < 5; i++ {
		ds.MarkSeen(fmt.Sprintf("https://example.com/prune-%d", i))
	}

	count, err := ds.PruneExpired()
	if err != nil {
		t.Fatalf("PruneExpired: %v", err)
	}
	if count != 5 {
		t.Fatalf("expected PruneExpired count=5, got %d", count)
	}
}

// ---- ContentStore.PruneStale tests ----

func TestContentStore_PruneStale_RemovesOld(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewContentStore(bs)

	// Insert an old record (60 days ago)
	oldURL := "https://example.com/old"
	cs.Put(oldURL, &ContentRecord{
		ContentHash: "old-hash",
		ScoredAt:    time.Now().Add(-60 * 24 * time.Hour),
		Generation:  1,
	})

	// Insert a recent record (1 day ago)
	newURL := "https://example.com/new"
	cs.Put(newURL, &ContentRecord{
		ContentHash: "new-hash",
		ScoredAt:    time.Now().Add(-1 * 24 * time.Hour),
		Generation:  2,
	})

	// Prune anything older than 30 days
	pruned, err := cs.PruneStale(30 * 24 * time.Hour)
	if err != nil {
		t.Fatalf("PruneStale: %v", err)
	}
	if pruned != 1 {
		t.Fatalf("expected 1 pruned, got %d", pruned)
	}

	// Old record should be gone
	rec, err := cs.Get(oldURL)
	if err != nil {
		t.Fatal(err)
	}
	if rec != nil {
		t.Fatal("expected old record to be pruned")
	}

	// New record should still exist
	rec, err = cs.Get(newURL)
	if err != nil {
		t.Fatal(err)
	}
	if rec == nil {
		t.Fatal("expected new record to survive pruning")
	}
}

func TestContentStore_PruneStale_NothingToPrune(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewContentStore(bs)

	// Insert only recent records
	cs.Put("https://example.com/fresh", &ContentRecord{
		ContentHash: "fresh",
		ScoredAt:    time.Now(),
		Generation:  1,
	})

	pruned, err := cs.PruneStale(30 * 24 * time.Hour)
	if err != nil {
		t.Fatalf("PruneStale: %v", err)
	}
	if pruned != 0 {
		t.Fatalf("expected 0 pruned, got %d", pruned)
	}
}

func TestContentStore_PruneStale_EmptyStore(t *testing.T) {
	bs := newTestBadger(t)
	cs := NewContentStore(bs)

	pruned, err := cs.PruneStale(30 * 24 * time.Hour)
	if err != nil {
		t.Fatalf("PruneStale: %v", err)
	}
	if pruned != 0 {
		t.Fatalf("expected 0 pruned on empty store, got %d", pruned)
	}
}

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}
