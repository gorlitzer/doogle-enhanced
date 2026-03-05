package store

import (
	"encoding/binary"
	"fmt"
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
