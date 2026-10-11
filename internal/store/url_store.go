package store

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	"github.com/dgraph-io/badger/v4"

	"github.com/doogle/doogle-v2/internal/models"
)

// URLStore manages the URL frontier and tracks seen URLs.
type URLStore struct {
	db           *badger.DB
	dedup        *DedupStore
	counter      atomic.Int64
	queueCounter atomic.Int64
}

// NewURLStore creates a URL store backed by BadgerDB with persistent dedup.
func NewURLStore(bs *BadgerStore, dedup *DedupStore) *URLStore {
	u := &URLStore{
		db:    bs.db,
		dedup: dedup,
	}
	u.loadCrawledCount()
	// Seed the in-memory queue counter with one scan at startup so QueueSize()
	// is O(1) thereafter instead of scanning the whole queue keyspace on every
	// call (it sits on the crawl hot path).
	u.queueCounter.Store(int64(u.scanQueueSize()))
	return u
}

// HasSeen returns true if the URL has already been queued.
func (u *URLStore) HasSeen(url string) bool {
	return u.dedup.HasSeen(url)
}

// MarkSeen marks a URL as seen (persisted to disk).
func (u *URLStore) MarkSeen(url string) {
	u.dedup.MarkSeen(url)
}

// CrawledCount returns total crawled URLs.
func (u *URLStore) CrawledCount() int64 {
	return u.counter.Load()
}

// IncrementCrawled increments the crawl counter and periodically persists it.
func (u *URLStore) IncrementCrawled() {
	val := u.counter.Add(1)
	if val%100 == 0 {
		u.writeInt64Key("meta:crawled_count", val)
	}
}

// FlushCrawledCount unconditionally persists the crawled counter to BadgerDB.
func (u *URLStore) FlushCrawledCount() error {
	return u.writeInt64Key("meta:crawled_count", u.counter.Load())
}

func (u *URLStore) loadCrawledCount() {
	val := u.readInt64Key("meta:crawled_count")
	if val > 0 {
		u.counter.Store(val)
		log.Printf("url_store: restored crawled count: %d", val)
	}
}

// GetCrawlerStats reads persisted crawler stats from BadgerDB.
func (u *URLStore) GetCrawlerStats() (crawled, failed, jsRendered int64) {
	crawled = u.readInt64Key("meta:crawler:crawled")
	failed = u.readInt64Key("meta:crawler:failed")
	jsRendered = u.readInt64Key("meta:crawler:jsrendered")
	return
}

// SetCrawlerStats persists crawler stats to BadgerDB.
func (u *URLStore) SetCrawlerStats(crawled, failed, jsRendered int64) error {
	if err := u.writeInt64Key("meta:crawler:crawled", crawled); err != nil {
		return err
	}
	if err := u.writeInt64Key("meta:crawler:failed", failed); err != nil {
		return err
	}
	return u.writeInt64Key("meta:crawler:jsrendered", jsRendered)
}

func (u *URLStore) readInt64Key(key string) int64 {
	var val int64
	_ = u.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(key))
		if err != nil {
			return err
		}
		return item.Value(func(b []byte) error {
			if len(b) >= 8 {
				val = int64(binary.BigEndian.Uint64(b))
			}
			return nil
		})
	})
	return val
}

func (u *URLStore) writeInt64Key(key string, val int64) error {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(val))
	return u.db.Update(func(txn *badger.Txn) error {
		return txn.Set([]byte(key), buf)
	})
}

const queuePrefix = "queue:"

// Enqueue adds a crawl task to the persistent queue.
func (u *URLStore) Enqueue(task *models.CrawlTask) error {
	key := fmt.Sprintf("%s%d:%s", queuePrefix, time.Now().UnixNano(), task.URL)
	data, err := json.Marshal(task)
	if err != nil {
		return err
	}
	if err := u.db.Update(func(txn *badger.Txn) error {
		return txn.Set([]byte(key), data)
	}); err != nil {
		return err
	}
	u.queueCounter.Add(1)
	return nil
}

// DequeueBatch retrieves and removes up to n tasks from the queue.
func (u *URLStore) DequeueBatch(n int) ([]*models.CrawlTask, error) {
	var tasks []*models.CrawlTask
	deleted := 0

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
		deleted = len(keysToDelete)

		return nil
	})

	if err == nil && deleted > 0 {
		u.queueCounter.Add(-int64(deleted))
	}
	return tasks, err
}

// QueueSize returns the approximate number of items in the queue. O(1): backed
// by an in-memory counter maintained on Enqueue/Dequeue.
func (u *URLStore) QueueSize() int {
	n := u.queueCounter.Load()
	if n < 0 {
		return 0
	}
	return int(n)
}

// scanQueueSize counts queue entries by scanning BadgerDB. Used once at startup
// to seed the counter; not for hot-path calls.
func (u *URLStore) scanQueueSize() int {
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
	return u.dedup.SeenCount()
}
