package crawler

import (
	"sync"
	"testing"

	"github.com/doogle/doogle-v2/internal/models"
)

func newTestCrawler() *Crawler {
	return &Crawler{}
}

func TestRecordEvent_BasicInsert(t *testing.T) {
	c := newTestCrawler()

	c.recordEvent(models.CrawlEvent{URL: "https://a.com", Status: "ok"})
	c.recordEvent(models.CrawlEvent{URL: "https://b.com", Status: "failed"})

	events := c.RecentEvents(0)
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	// Newest first
	if events[0].URL != "https://b.com" {
		t.Errorf("expected newest first, got %s", events[0].URL)
	}
	if events[1].URL != "https://a.com" {
		t.Errorf("expected oldest second, got %s", events[1].URL)
	}
}

func TestRecordEvent_SequenceMonotonic(t *testing.T) {
	c := newTestCrawler()

	c.recordEvent(models.CrawlEvent{URL: "https://1.com"})
	c.recordEvent(models.CrawlEvent{URL: "https://2.com"})
	c.recordEvent(models.CrawlEvent{URL: "https://3.com"})

	events := c.RecentEvents(0)
	if events[0].Seq <= events[1].Seq || events[1].Seq <= events[2].Seq {
		t.Errorf("seqs not monotonically decreasing: %d, %d, %d", events[0].Seq, events[1].Seq, events[2].Seq)
	}
}

func TestRecentEvents_AfterSeqFiltering(t *testing.T) {
	c := newTestCrawler()

	c.recordEvent(models.CrawlEvent{URL: "https://old.com"})
	c.recordEvent(models.CrawlEvent{URL: "https://mid.com"})

	// Get the seq of the second event
	all := c.RecentEvents(0)
	midSeq := all[1].Seq // oldest event seq

	c.recordEvent(models.CrawlEvent{URL: "https://new.com"})

	// Only events after midSeq
	filtered := c.RecentEvents(midSeq)
	if len(filtered) != 2 {
		t.Fatalf("expected 2 events after seq %d, got %d", midSeq, len(filtered))
	}
	if filtered[0].URL != "https://new.com" {
		t.Errorf("expected newest, got %s", filtered[0].URL)
	}
}

func TestRecentEvents_EmptyBuffer(t *testing.T) {
	c := newTestCrawler()
	events := c.RecentEvents(0)
	if len(events) != 0 {
		t.Fatalf("expected 0 events, got %d", len(events))
	}
}

func TestRingBuffer_WrapAround(t *testing.T) {
	c := newTestCrawler()

	// Fill more than the buffer size (50)
	for i := 0; i < 70; i++ {
		c.recordEvent(models.CrawlEvent{URL: "https://example.com", Status: "ok"})
	}

	events := c.RecentEvents(0)
	if len(events) != 50 {
		t.Fatalf("expected 50 events (buffer cap), got %d", len(events))
	}

	// Oldest surviving event should have seq 21 (events 1-20 were overwritten)
	oldest := events[len(events)-1]
	if oldest.Seq != 21 {
		t.Errorf("expected oldest seq 21, got %d", oldest.Seq)
	}
	// Newest should be seq 70
	if events[0].Seq != 70 {
		t.Errorf("expected newest seq 70, got %d", events[0].Seq)
	}
}

func TestRingBuffer_AfterSeqWithWrap(t *testing.T) {
	c := newTestCrawler()

	for i := 0; i < 60; i++ {
		c.recordEvent(models.CrawlEvent{URL: "https://example.com"})
	}

	// Ask for events after seq 55 — should get 5 events (56,57,58,59,60)
	events := c.RecentEvents(55)
	if len(events) != 5 {
		t.Fatalf("expected 5 events after seq 55, got %d", len(events))
	}
}

func TestRecordEvent_SetsTimestamp(t *testing.T) {
	c := newTestCrawler()
	c.recordEvent(models.CrawlEvent{URL: "https://example.com"})
	events := c.RecentEvents(0)
	if events[0].Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}
}

func TestRecordEvent_PreservesFields(t *testing.T) {
	c := newTestCrawler()
	c.recordEvent(models.CrawlEvent{
		URL:         "https://example.com/page",
		Domain:      "example.com",
		Title:       "Example Page",
		Status:      "ok",
		StatusCode:  200,
		ContentSize: 5000,
		Depth:       2,
	})

	events := c.RecentEvents(0)
	ev := events[0]
	if ev.URL != "https://example.com/page" {
		t.Errorf("URL: got %s", ev.URL)
	}
	if ev.Domain != "example.com" {
		t.Errorf("Domain: got %s", ev.Domain)
	}
	if ev.Title != "Example Page" {
		t.Errorf("Title: got %s", ev.Title)
	}
	if ev.StatusCode != 200 {
		t.Errorf("StatusCode: got %d", ev.StatusCode)
	}
	if ev.ContentSize != 5000 {
		t.Errorf("ContentSize: got %d", ev.ContentSize)
	}
	if ev.Depth != 2 {
		t.Errorf("Depth: got %d", ev.Depth)
	}
}

func TestRecordEvent_ConcurrentSafety(t *testing.T) {
	c := newTestCrawler()
	var wg sync.WaitGroup

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c.recordEvent(models.CrawlEvent{URL: "https://concurrent.com", Status: "ok"})
		}()
	}

	// Also read concurrently
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = c.RecentEvents(0)
		}()
	}

	wg.Wait()

	events := c.RecentEvents(0)
	if len(events) != 50 {
		t.Fatalf("expected 50 events (100 written, cap 50), got %d", len(events))
	}
}
