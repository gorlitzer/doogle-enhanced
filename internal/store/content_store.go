package store

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/dgraph-io/badger/v4"
)

const contentPrefix = "content:"

// ContentRecord tracks content hash and scoring metadata for a URL.
type ContentRecord struct {
	ContentHash string    `json:"h"`
	ScoredAt    time.Time `json:"s"`
	Generation  uint64    `json:"g"`
}

// ContentStore persists content hashes per URL for incremental reindexing.
type ContentStore struct {
	db *badger.DB
}

// NewContentStore creates a ContentStore sharing the given BadgerStore's DB.
func NewContentStore(bs *BadgerStore) *ContentStore {
	return &ContentStore{db: bs.db}
}

// Get retrieves the content record for a URL. Returns nil if not found.
func (cs *ContentStore) Get(url string) (*ContentRecord, error) {
	key := cs.contentKey(url)
	var rec ContentRecord

	err := cs.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get(key)
		if err != nil {
			return err
		}
		return item.Value(func(val []byte) error {
			return json.Unmarshal(val, &rec)
		})
	})
	if err == badger.ErrKeyNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

// Put stores a content record for a URL.
func (cs *ContentStore) Put(url string, rec *ContentRecord) error {
	key := cs.contentKey(url)
	data, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return cs.db.Update(func(txn *badger.Txn) error {
		return txn.Set(key, data)
	})
}

// HasChanged returns true if the URL is not tracked or the content hash differs.
func (cs *ContentStore) HasChanged(url, newHash string) bool {
	rec, err := cs.Get(url)
	if err != nil || rec == nil {
		return true
	}
	return rec.ContentHash != newHash
}

func (cs *ContentStore) contentKey(url string) []byte {
	h := sha256.Sum256([]byte(url))
	return []byte(contentPrefix + hex.EncodeToString(h[:]))
}
