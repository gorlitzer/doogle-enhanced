package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/pkg/urlutil"
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

// ---- pprof endpoint tests ----
//
// pprof dumps process memory and must be reachable only from loopback. These
// tests assert both halves of that contract: allowed from 127.0.0.1, forbidden
// from any other source address.

// loopbackReq builds a request that passes the loopback + Host-allowlist gates.
func loopbackReq(method, target string) *http.Request {
	req := httptest.NewRequest(method, target, nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Host = "127.0.0.1"
	return req
}

func TestPprofEndpoint_Index(t *testing.T) {
	srv := NewServer("127.0.0.1", 0, &Deps{})

	w := httptest.NewRecorder()
	srv.router.ServeHTTP(w, loopbackReq("GET", "/debug/pprof/"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for loopback /debug/pprof/, got %d", w.Code)
	}
}

func TestPprofEndpoint_Cmdline(t *testing.T) {
	srv := NewServer("127.0.0.1", 0, &Deps{})

	w := httptest.NewRecorder()
	srv.router.ServeHTTP(w, loopbackReq("GET", "/debug/pprof/cmdline"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for loopback /debug/pprof/cmdline, got %d", w.Code)
	}
}

func TestPprofEndpoint_Symbol(t *testing.T) {
	srv := NewServer("127.0.0.1", 0, &Deps{})

	w := httptest.NewRecorder()
	srv.router.ServeHTTP(w, loopbackReq("GET", "/debug/pprof/symbol"))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for loopback /debug/pprof/symbol, got %d", w.Code)
	}
}

// TestPprofEndpoint_ForbiddenFromNetwork is the security regression test: a
// non-loopback caller must never reach pprof.
func TestPprofEndpoint_ForbiddenFromNetwork(t *testing.T) {
	srv := NewServer("127.0.0.1", 0, &Deps{})

	for _, path := range []string{"/debug/pprof/", "/debug/pprof/cmdline", "/debug/pprof/heap"} {
		req := httptest.NewRequest("GET", path, nil)
		req.RemoteAddr = "203.0.113.7:40000" // public source address
		req.Host = "127.0.0.1"
		w := httptest.NewRecorder()
		srv.router.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for remote %s, got %d", path, w.Code)
		}
	}
}

// TestHostAllowlist_RejectsRebinding verifies a rebinding Host header is denied
// even from a loopback source address.
func TestHostAllowlist_RejectsRebinding(t *testing.T) {
	srv := NewServer("127.0.0.1", 0, &Deps{})

	req := httptest.NewRequest("GET", "/api/status", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Host = "evil.attacker.com" // DNS-rebound to 127.0.0.1
	w := httptest.NewRecorder()
	srv.router.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for rebinding host, got %d", w.Code)
	}
}

func TestIsSafeURL(t *testing.T) {
	tests := []struct {
		url  string
		safe bool
	}{
		{"https://example.com", true},
		{"http://google.com/search", true},
		{"http://localhost:6379", false},
		{"http://127.0.0.1:8080", false},
		{"http://192.168.1.1", false},
		{"http://10.0.0.1/admin", false},
		{"http://169.254.169.254/latest/meta-data", false},
		{"http://0.0.0.0", false},
		{"http://[::1]/test", false},
		{"http://myhost.local/test", false},
		{"not-a-url", false},
		{"", false},
	}

	for _, tt := range tests {
		got := urlutil.IsSafeURL(tt.url)
		if got != tt.safe {
			t.Errorf("IsSafeURL(%q) = %v, want %v", tt.url, got, tt.safe)
		}
	}
}
