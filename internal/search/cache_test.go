package search

import (
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

func dummyResponse(query string) *models.SearchResponse {
	return &models.SearchResponse{Query: query, Total: 1}
}

func TestCache_PutGet(t *testing.T) {
	c := NewSearchCache(10, 5*time.Minute)
	key := CacheKey("test", 0, 10)
	resp := dummyResponse("test")

	c.Put(key, resp)
	got := c.Get(key)
	if got == nil {
		t.Fatal("expected cache hit")
	}
	if got.Query != "test" {
		t.Fatalf("expected query='test', got %q", got.Query)
	}
}

func TestCache_Miss(t *testing.T) {
	c := NewSearchCache(10, 5*time.Minute)
	got := c.Get("nonexistent")
	if got != nil {
		t.Fatal("expected cache miss")
	}
}

func TestCache_TTLExpiry(t *testing.T) {
	c := NewSearchCache(10, 50*time.Millisecond)
	key := CacheKey("expire", 0, 10)
	c.Put(key, dummyResponse("expire"))

	time.Sleep(100 * time.Millisecond)

	got := c.Get(key)
	if got != nil {
		t.Fatal("expected expired entry to be a miss")
	}
}

func TestCache_LRUEviction(t *testing.T) {
	c := NewSearchCache(2, 5*time.Minute)

	k1 := CacheKey("first", 0, 10)
	k2 := CacheKey("second", 0, 10)
	k3 := CacheKey("third", 0, 10)

	c.Put(k1, dummyResponse("first"))
	c.Put(k2, dummyResponse("second"))
	c.Put(k3, dummyResponse("third")) // should evict k1

	if c.Get(k1) != nil {
		t.Fatal("expected k1 to be evicted")
	}
	if c.Get(k2) == nil {
		t.Fatal("expected k2 to still be present")
	}
	if c.Get(k3) == nil {
		t.Fatal("expected k3 to still be present")
	}
}

func TestCache_AccessRefresh(t *testing.T) {
	c := NewSearchCache(2, 5*time.Minute)

	k1 := CacheKey("first", 0, 10)
	k2 := CacheKey("second", 0, 10)
	k3 := CacheKey("third", 0, 10)

	c.Put(k1, dummyResponse("first"))
	c.Put(k2, dummyResponse("second"))

	// Access k1 to refresh it (move to front)
	c.Get(k1)

	// Now adding k3 should evict k2 (LRU), not k1
	c.Put(k3, dummyResponse("third"))

	if c.Get(k1) == nil {
		t.Fatal("expected k1 to survive after access refresh")
	}
	if c.Get(k2) != nil {
		t.Fatal("expected k2 to be evicted")
	}
}

func TestCacheKey_Deterministic(t *testing.T) {
	a := CacheKey("test query", 1, 10)
	b := CacheKey("test query", 1, 10)
	if a != b {
		t.Fatalf("expected deterministic keys, got %q and %q", a, b)
	}
}

func TestCacheKey_DiffersOnPage(t *testing.T) {
	a := CacheKey("test", 0, 10)
	b := CacheKey("test", 1, 10)
	if a == b {
		t.Fatal("expected different keys for different pages")
	}
}
