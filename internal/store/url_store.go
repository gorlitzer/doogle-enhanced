package store

import (
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dgraph-io/badger/v4"

	"github.com/doogle/doogle-v2/internal/models"
)

// URLStore manages the URL frontier and tracks seen URLs.
type URLStore struct {
	db      *badger.DB
	seen    map[string]bool
	mu      sync.RWMutex
	counter atomic.Int64
}

// NewURLStore creates a URL store backed by BadgerDB.
func NewURLStore(bs *BadgerStore) *URLStore {
	return &URLStore{
		db:   bs.db,
		seen: make(map[string]bool),
	}
}

// HasSeen returns true if the URL has already been queued.
func (u *URLStore) HasSeen(url string) bool {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.seen[url]
}

// MarkSeen marks a URL as seen.
func (u *URLStore) MarkSeen(url string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.seen[url] = true
}

// CrawledCount returns total crawled URLs.
func (u *URLStore) CrawledCount() int64 {
	return u.counter.Load()
}

// IncrementCrawled increments the crawl counter.
func (u *URLStore) IncrementCrawled() {
	u.counter.Add(1)
}

const queuePrefix = "queue:"

// Enqueue adds a crawl task to the persistent queue.
func (u *URLStore) Enqueue(task *models.CrawlTask) error {
	key := fmt.Sprintf("%s%d:%s", queuePrefix, time.Now().UnixNano(), task.URL)
	data, err := json.Marshal(task)
	if err != nil {
		return err
	}
	return u.db.Update(func(txn *badger.Txn) error {
		return txn.Set([]byte(key), data)
	})
}

// DequeueBatch retrieves and removes up to n tasks from the queue.
func (u *URLStore) DequeueBatch(n int) ([]*models.CrawlTask, error) {
	var tasks []*models.CrawlTask

	err := u.db.Update(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = []byte(queuePrefix)
		it := txn.NewIterator(opts)
		defer it.Close()

		var keysToDelete [][]byte
		count := 0

		for it.Seek([]byte(queuePrefix)); it.Valid() && count < n; it.Next() {
			item := it.Item()
			key := item.KeyCopy(nil)
			val, err := item.ValueCopy(nil)
			if err != nil {
				continue
			}

			var task models.CrawlTask
			if err := json.Unmarshal(val, &task); err != nil {
				continue
			}

			tasks = append(tasks, &task)
			keysToDelete = append(keysToDelete, key)
			count++
		}

		for _, key := range keysToDelete {
			if err := txn.Delete(key); err != nil {
				return err
			}
		}

		return nil
	})

	return tasks, err
}

// QueueSize returns the approximate number of items in the queue.
func (u *URLStore) QueueSize() int {
	count := 0
	u.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchValues = false
		opts.Prefix = []byte(queuePrefix)
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek([]byte(queuePrefix)); it.Valid(); it.Next() {
			count++
		}
		return nil
	})
	return count
}

// SeenCount returns number of seen URLs.
func (u *URLStore) SeenCount() int {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return len(u.seen)
}
