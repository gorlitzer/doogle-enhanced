package store

import (
	"crypto/sha256"
	"encoding/hex"

	"github.com/dgraph-io/badger/v4"
)

const seenPrefix = "seen:"

// DedupStore provides persistent URL deduplication backed by BadgerDB.
// Replaces the in-memory seen map that was lost on restart.
type DedupStore struct {
	db *badger.DB
}

// NewDedupStore creates a DedupStore sharing the given BadgerStore's DB.
func NewDedupStore(bs *BadgerStore) *DedupStore {
	return &DedupStore{db: bs.db}
}

// HasSeen returns true if the URL has already been marked as seen.
func (ds *DedupStore) HasSeen(url string) bool {
	key := ds.seenKey(url)
	err := ds.db.View(func(txn *badger.Txn) error {
		_, err := txn.Get(key)
		return err
	})
	return err == nil
}

// MarkSeen persists a URL as seen.
func (ds *DedupStore) MarkSeen(url string) error {
	key := ds.seenKey(url)
	return ds.db.Update(func(txn *badger.Txn) error {
		return txn.Set(key, []byte{1})
	})
}

// SeenCount returns the number of seen URLs by iterating the prefix.
func (ds *DedupStore) SeenCount() int {
	count := 0
	ds.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchValues = false
		opts.Prefix = []byte(seenPrefix)
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek([]byte(seenPrefix)); it.Valid(); it.Next() {
			count++
		}
		return nil
	})
	return count
}

func (ds *DedupStore) seenKey(url string) []byte {
	h := sha256.Sum256([]byte(url))
	return []byte(seenPrefix + hex.EncodeToString(h[:]))
}
