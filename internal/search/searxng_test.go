package search

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSearXNGQuery_ParsesResults(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("format") != "json" {
			t.Error("expected format=json query param")
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"url": "https://example.com/page1", "title": "Page One", "content": "Description one", "engine": "google", "score": 1.0},
				{"url": "https://example.org/page2", "title": "Page Two", "content": "Description two", "engine": "bing", "score": 0.8},
			},
		})
	}))
	defer srv.Close()

	client := NewSearXNGClient(srv.URL, 5*time.Second, 10, "general", 0.7)
	results, err := client.Query(context.Background(), "test query")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	r := results[0]
	if r.URL != "https://example.com/page1" {
		t.Errorf("URL = %q, want %q", r.URL, "https://example.com/page1")
	}
	if r.Title != "Page One" {
		t.Errorf("Title = %q, want %q", r.Title, "Page One")
	}
	if r.Description != "Description one" {
		t.Errorf("Description = %q, want %q", r.Description, "Description one")
	}
	if r.Source != "searxng" {
		t.Errorf("Source = %q, want %q", r.Source, "searxng")
	}
	if r.PeerID != "searxng" {
		t.Errorf("PeerID = %q, want %q", r.PeerID, "searxng")
	}
	if r.PeerName != "SearXNG" {
		t.Errorf("PeerName = %q, want %q", r.PeerName, "SearXNG")
	}
	if r.OriginPeerID != "searxng" {
		t.Errorf("OriginPeerID = %q, want %q", r.OriginPeerID, "searxng")
	}
	if r.OriginPeerName != "SearXNG" {
		t.Errorf("OriginPeerName = %q, want %q", r.OriginPeerName, "SearXNG")
	}
	if r.Domain != "example.com" {
		t.Errorf("Domain = %q, want %q", r.Domain, "example.com")
	}

	// Score should be multiplied by penalty (1.0 * 0.7 = 0.7)
	if r.Score != 0.7 {
		t.Errorf("Score = %f, want %f", r.Score, 0.7)
	}

	// Second result score: 0.8 * 0.7 = 0.56
	expectedScore := 0.8 * 0.7
	if results[1].Score < expectedScore-0.01 || results[1].Score > expectedScore+0.01 {
		t.Errorf("Score[1] = %f, want ~%f", results[1].Score, expectedScore)
	}
}

func TestSearXNGQuery_MaxResults(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		results := make([]map[string]interface{}, 20)
		for i := range results {
			results[i] = map[string]interface{}{
				"url": "https://example.com/page", "title": "Page", "content": "Desc", "score": 1.0,
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"results": results})
	}))
	defer srv.Close()

	client := NewSearXNGClient(srv.URL, 5*time.Second, 5, "general", 0.7)
	results, _ := client.Query(context.Background(), "test")

	if len(results) != 5 {
		t.Errorf("expected 5 results (maxResults=5), got %d", len(results))
	}
}

func TestSearXNGQuery_Timeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		json.NewEncoder(w).Encode(map[string]interface{}{"results": []interface{}{}})
	}))
	defer srv.Close()

	client := NewSearXNGClient(srv.URL, 50*time.Millisecond, 10, "general", 0.7)
	results, err := client.Query(context.Background(), "test")

	// Should return nil/empty on timeout, not error
	if err != nil {
		t.Errorf("expected nil error on timeout, got %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results on timeout, got %d", len(results))
	}
}

func TestSearXNGQuery_RateLimit429(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	client := NewSearXNGClient(srv.URL, 5*time.Second, 10, "general", 0.7)
	results, err := client.Query(context.Background(), "test")

	if err != nil {
		t.Errorf("expected nil error on 429, got %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results on 429, got %d", len(results))
	}
}

func TestSearXNGQuery_EmptyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{"results": []interface{}{}})
	}))
	defer srv.Close()

	client := NewSearXNGClient(srv.URL, 5*time.Second, 10, "general", 0.7)
	results, err := client.Query(context.Background(), "test")

	if err != nil {
		t.Errorf("expected nil error, got %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}
}

func TestSearXNGQuery_MalformedJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("{invalid json"))
	}))
	defer srv.Close()

	client := NewSearXNGClient(srv.URL, 5*time.Second, 10, "general", 0.7)
	results, err := client.Query(context.Background(), "test")

	if err != nil {
		t.Errorf("expected nil error on malformed JSON, got %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results on malformed JSON, got %d", len(results))
	}
}

func TestSearXNGQuery_SkipsEmptyURLs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"url": "", "title": "Empty URL", "content": "Desc", "score": 1.0},
				{"url": "https://example.com", "title": "Valid", "content": "Desc", "score": 1.0},
			},
		})
	}))
	defer srv.Close()

	client := NewSearXNGClient(srv.URL, 5*time.Second, 10, "general", 0.7)
	results, _ := client.Query(context.Background(), "test")

	if len(results) != 1 {
		t.Errorf("expected 1 result (skip empty URL), got %d", len(results))
	}
}

func TestSearXNGQuery_DomainExtraction(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"url": "https://www.example.com/path?q=1", "title": "Test", "content": "Desc", "score": 1.0},
			},
		})
	}))
	defer srv.Close()

	client := NewSearXNGClient(srv.URL, 5*time.Second, 10, "general", 0.7)
	results, _ := client.Query(context.Background(), "test")

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Domain != "example.com" {
		t.Errorf("Domain = %q, want %q (www. should be stripped)", results[0].Domain, "example.com")
	}
}

func TestSearXNGRotation_FailoverToNextInstance(t *testing.T) {
	callCount := 0
	srv1 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv1.Close()

	srv2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": []map[string]interface{}{
				{"url": "https://example.com", "title": "OK", "content": "Desc", "score": 1.0},
			},
		})
	}))
	defer srv2.Close()

	client := newSearXNGClient([]string{srv1.URL, srv2.URL}, 5*time.Second, 10, "general", 0.7)

	// First call hits srv1 (500) — should rotate
	results1, err := client.Query(context.Background(), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results1) != 0 {
		t.Errorf("expected 0 results from 500 server, got %d", len(results1))
	}

	// After rotation, CurrentURL should be srv2
	if client.CurrentURL() != srv2.URL {
		t.Errorf("expected CurrentURL = %q after rotation, got %q", srv2.URL, client.CurrentURL())
	}

	// Second call hits srv2 — should succeed
	results2, err := client.Query(context.Background(), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results2) != 1 {
		t.Errorf("expected 1 result from second server, got %d", len(results2))
	}
}

func TestSearXNGRotation_429TriggersRotation(t *testing.T) {
	srv1 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv1.Close()

	srv2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{"results": []interface{}{}})
	}))
	defer srv2.Close()

	client := newSearXNGClient([]string{srv1.URL, srv2.URL}, 5*time.Second, 10, "general", 0.7)

	// Hit srv1 (429), should rotate
	client.Query(context.Background(), "test")

	if client.CurrentURL() != srv2.URL {
		t.Errorf("expected rotation to srv2 after 429, got %q", client.CurrentURL())
	}
}

func TestSearXNGClientAuto_UsesPublicList(t *testing.T) {
	client := NewSearXNGClientAuto(3*time.Second, 10, "general", 0.7)

	// CurrentURL should be the first public instance
	url := client.CurrentURL()
	if url == "" {
		t.Fatal("expected non-empty CurrentURL from auto client")
	}
	if url != PublicSearXNGInstances[0] {
		t.Errorf("CurrentURL() = %q, want %q", url, PublicSearXNGInstances[0])
	}
}

func TestSearXNGCurrentURL_SingleInstance(t *testing.T) {
	client := NewSearXNGClient("https://example.com", 3*time.Second, 10, "general", 0.7)

	if client.CurrentURL() != "https://example.com" {
		t.Errorf("CurrentURL() = %q, want %q", client.CurrentURL(), "https://example.com")
	}
}

func TestSearXNGCurrentURL_TrailingSlashTrimmed(t *testing.T) {
	client := NewSearXNGClient("https://example.com/", 3*time.Second, 10, "general", 0.7)

	if client.CurrentURL() != "https://example.com" {
		t.Errorf("CurrentURL() = %q, want %q", client.CurrentURL(), "https://example.com")
	}
}

func TestSearXNGNoRotation_SingleInstance(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	client := NewSearXNGClient(srv.URL, 5*time.Second, 10, "general", 0.7)
	urlBefore := client.CurrentURL()

	client.Query(context.Background(), "test")

	// With a single instance, rotation should be a no-op
	if client.CurrentURL() != urlBefore {
		t.Errorf("single instance should not rotate: before=%q, after=%q", urlBefore, client.CurrentURL())
	}
}

func TestExtractDomain(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"https://www.example.com/path", "example.com"},
		{"https://example.com", "example.com"},
		{"http://sub.domain.org/page?q=1", "sub.domain.org"},
		{"invalid-url", ""},
	}
	for _, tt := range tests {
		got := extractDomain(tt.input)
		if got != tt.want {
			t.Errorf("extractDomain(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
