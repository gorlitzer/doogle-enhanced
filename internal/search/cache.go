package search

import (
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

type cacheEntry struct {
	key       string
	response  *models.SearchResponse
	expiresAt time.Time
}

// SearchCache is an LRU cache with TTL for search results.
type SearchCache struct {
	mu       sync.Mutex
	maxSize  int
	ttl      time.Duration
	items    map[string]*list.Element
	eviction *list.List // front = most recent
}

// NewSearchCache creates a new LRU+TTL search cache.
func NewSearchCache(maxSize int, ttl time.Duration) *SearchCache {
	return &SearchCache{
		maxSize:  maxSize,
		ttl:      ttl,
		items:    make(map[string]*list.Element, maxSize),
		eviction: list.New(),
	}
}

// CacheKey produces a deterministic key from query parameters.
func CacheKey(query string, page, pageSize int) string {
	raw := fmt.Sprintf("%s|%d|%d", query, page, pageSize)
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:8]) // 16 hex chars
}

// Get retrieves a cached response. Returns nil on miss or expiry.
func (c *SearchCache) Get(key string) *models.SearchResponse {
	c.mu.Lock()
	defer c.mu.Unlock()

	elem, ok := c.items[key]
	if !ok {
		return nil
	}

	entry := elem.Value.(*cacheEntry)
	if time.Now().After(entry.expiresAt) {
		// Expired — evict
		c.eviction.Remove(elem)
		delete(c.items, key)
		return nil
	}

	// Move to front (most recently used)
	c.eviction.MoveToFront(elem)
	return entry.response
}

// Put stores a response in the cache, evicting the LRU entry if full.
func (c *SearchCache) Put(key string, resp *models.SearchResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Update existing
	if elem, ok := c.items[key]; ok {
		entry := elem.Value.(*cacheEntry)
		entry.response = resp
		entry.expiresAt = time.Now().Add(c.ttl)
		c.eviction.MoveToFront(elem)
		return
	}

	// Evict LRU if at capacity
	if c.eviction.Len() >= c.maxSize {
		back := c.eviction.Back()
		if back != nil {
			evicted := c.eviction.Remove(back).(*cacheEntry)
			delete(c.items, evicted.key)
		}
	}

	entry := &cacheEntry{
		key:       key,
		response:  resp,
		expiresAt: time.Now().Add(c.ttl),
	}
	elem := c.eviction.PushFront(entry)
	c.items[key] = elem
}
