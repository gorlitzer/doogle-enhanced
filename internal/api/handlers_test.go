package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

func TestCrawlerFeedHandler_ReturnsEvents(t *testing.T) {
	events := []models.CrawlEvent{
		{Seq: 2, URL: "https://b.com", Status: "ok", Timestamp: time.Now()},
		{Seq: 1, URL: "https://a.com", Status: "failed", Error: "timeout", Timestamp: time.Now()},
	}

	deps := &Deps{
		CrawlerFeed: func(afterSeq uint64) []models.CrawlEvent {
			var out []models.CrawlEvent
			for _, e := range events {
				if e.Seq > afterSeq {
					out = append(out, e)
				}
			}
			return out
		},
	}

	handler := CrawlerFeedHandler(deps)

	// Request all events
	req := httptest.NewRequest("GET", "/api/admin/crawler/feed?after=0", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body struct {
		Events []models.CrawlEvent `json:"events"`
	}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(body.Events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(body.Events))
	}
}

func TestCrawlerFeedHandler_AfterSeqFilters(t *testing.T) {
	events := []models.CrawlEvent{
		{Seq: 3, URL: "https://c.com", Status: "ok", Timestamp: time.Now()},
		{Seq: 2, URL: "https://b.com", Status: "ok", Timestamp: time.Now()},
		{Seq: 1, URL: "https://a.com", Status: "ok", Timestamp: time.Now()},
	}

	deps := &Deps{
		CrawlerFeed: func(afterSeq uint64) []models.CrawlEvent {
			var out []models.CrawlEvent
			for _, e := range events {
				if e.Seq > afterSeq {
					out = append(out, e)
				}
			}
			return out
		},
	}

	handler := CrawlerFeedHandler(deps)

	req := httptest.NewRequest("GET", "/api/admin/crawler/feed?after=2", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	var body struct {
		Events []models.CrawlEvent `json:"events"`
	}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(body.Events) != 1 {
		t.Fatalf("expected 1 event after seq 2, got %d", len(body.Events))
	}
	if body.Events[0].URL != "https://c.com" {
		t.Errorf("expected c.com, got %s", body.Events[0].URL)
	}
}

func TestCrawlerFeedHandler_NilDep(t *testing.T) {
	deps := &Deps{CrawlerFeed: nil}
	handler := CrawlerFeedHandler(deps)

	req := httptest.NewRequest("GET", "/api/admin/crawler/feed", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body struct {
		Events []interface{} `json:"events"`
	}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(body.Events) != 0 {
		t.Errorf("expected empty events, got %d", len(body.Events))
	}
}

func TestCrawlerFeedHandler_MissingAfterParam(t *testing.T) {
	deps := &Deps{
		CrawlerFeed: func(afterSeq uint64) []models.CrawlEvent {
			if afterSeq != 0 {
				return nil
			}
			return []models.CrawlEvent{{Seq: 1, URL: "https://a.com", Status: "ok"}}
		},
	}

	handler := CrawlerFeedHandler(deps)

	// No ?after= param — should default to 0
	req := httptest.NewRequest("GET", "/api/admin/crawler/feed", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	var body struct {
		Events []models.CrawlEvent `json:"events"`
	}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(body.Events) != 1 {
		t.Errorf("expected 1 event when after defaults to 0, got %d", len(body.Events))
	}
}

func TestCrawlerFeedHandler_ContentType(t *testing.T) {
	deps := &Deps{
		CrawlerFeed: func(afterSeq uint64) []models.CrawlEvent { return nil },
	}

	handler := CrawlerFeedHandler(deps)
	req := httptest.NewRequest("GET", "/api/admin/crawler/feed", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected application/json, got %s", ct)
	}
}
