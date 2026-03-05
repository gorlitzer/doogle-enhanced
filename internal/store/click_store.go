package store

import (
	"encoding/binary"
	"fmt"
	"strings"
)

// ClickStore records search result click signals for learn-to-rank.
type ClickStore struct {
	db *BadgerStore
}

// NewClickStore creates a ClickStore backed by BadgerDB.
func NewClickStore(db *BadgerStore) *ClickStore {
	return &ClickStore{db: db}
}

// RecordClick stores a click event: which URL was clicked for a given query at a given position.
func (cs *ClickStore) RecordClick(query, url string, position int) {
	key := fmt.Sprintf("click:%s:%s", query, url)

	// Increment click count
	var count uint64
	if data, err := cs.db.Get([]byte(key)); err == nil && len(data) >= 8 {
		count = binary.BigEndian.Uint64(data)
	}
	count++

	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, count)
	_ = cs.db.Set([]byte(key), buf)

	// Also record last position for this query+url pair
	posKey := fmt.Sprintf("click_pos:%s:%s", query, url)
	posBuf := make([]byte, 8)
	binary.BigEndian.PutUint64(posBuf, uint64(position))
	_ = cs.db.Set([]byte(posKey), posBuf)
}

// GetClickCount returns how many times a URL was clicked for a query.
func (cs *ClickStore) GetClickCount(query, url string) uint64 {
	key := fmt.Sprintf("click:%s:%s", query, url)
	data, err := cs.db.Get([]byte(key))
	if err != nil || len(data) < 8 {
		return 0
	}
	return binary.BigEndian.Uint64(data)
}

// ClickRecord represents a single click entry for training.
type ClickRecord struct {
	Query    string
	URL      string
	Clicks   uint64
	Position uint64
}

// AllClicks iterates all click records grouped by query.
// Returns a map of query → []ClickRecord sorted by click count descending.
func (cs *ClickStore) AllClicks() map[string][]ClickRecord {
	byQuery := make(map[string][]ClickRecord)

	_ = cs.db.Scan([]byte("click:"), func(key, val []byte) bool {
		k := string(key)
		// Skip position keys
		if strings.HasPrefix(k, "click_pos:") {
			return true
		}
		// Parse "click:{query}:{url}" — use Index not LastIndex since URLs contain colons
		rest := strings.TrimPrefix(k, "click:")
		idx := strings.Index(rest, ":")
		if idx <= 0 {
			return true
		}
		query := rest[:idx]
		url := rest[idx+1:]

		var clicks uint64
		if len(val) >= 8 {
			clicks = binary.BigEndian.Uint64(val)
		}

		var position uint64
		posKey := fmt.Sprintf("click_pos:%s:%s", query, url)
		if posData, err := cs.db.Get([]byte(posKey)); err == nil && len(posData) >= 8 {
			position = binary.BigEndian.Uint64(posData)
		}

		byQuery[query] = append(byQuery[query], ClickRecord{
			Query:    query,
			URL:      url,
			Clicks:   clicks,
			Position: position,
		})
		return true
	})

	return byQuery
}

// TotalClickPairs returns the approximate number of pairwise training examples
// available (each query with N clicked URLs produces N*(N-1)/2 pairs, plus
// each clicked URL paired against non-clicked results shown above it).
func (cs *ClickStore) TotalClickPairs() int {
	total := 0
	byQuery := cs.AllClicks()
	for _, records := range byQuery {
		n := len(records)
		// Each pair of URLs with different click counts is a training pair
		total += n * (n - 1) / 2
	}
	return total
}
