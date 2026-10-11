package crawler

import (
	"log"
	"sync/atomic"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
	"github.com/doogle/doogle-v2/pkg/urlutil"
)

// Scheduler manages the URL frontier — which URLs to crawl next.
type Scheduler struct {
	urlStore     *store.URLStore
	pending      chan *models.CrawlTask
	maxQueueSize atomic.Int64
}

// NewScheduler creates a scheduler with the given buffer size.
func NewScheduler(urlStore *store.URLStore, bufferSize int) *Scheduler {
	return &Scheduler{
		urlStore: urlStore,
		pending:  make(chan *models.CrawlTask, bufferSize),
	}
}

// SetMaxQueueSize sets the maximum queue size. 0 = unlimited.
func (s *Scheduler) SetMaxQueueSize(max int64) {
	s.maxQueueSize.Store(max)
}

// Schedule adds a URL to the crawl queue if not already seen.
func (s *Scheduler) Schedule(task *models.CrawlTask) bool {
	normalized := urlutil.Normalize(task.URL)
	if s.urlStore.HasSeen(normalized) {
		return false
	}

	// Reject if queue is at capacity
	if max := s.maxQueueSize.Load(); max > 0 && int64(s.Pending()) >= max {
		return false
	}

	// Enqueue first, then mark seen. Marking seen before a failed enqueue would
	// permanently drop the URL from the frontier: HasSeen would report it visited
	// even though it was never actually crawled.
	select {
	case s.pending <- task:
	default:
		// Channel full, enqueue to persistent store
		if err := s.urlStore.Enqueue(task); err != nil {
			log.Printf("scheduler: failed to enqueue %s: %v", task.URL, err)
			return false
		}
	}
	s.urlStore.MarkSeen(normalized)
	return true
}

// Next returns the next crawl task. Blocks until one is available.
func (s *Scheduler) Next() *models.CrawlTask {
	// Try in-memory channel first
	select {
	case task := <-s.pending:
		return task
	default:
	}

	// Try persistent queue
	tasks, err := s.urlStore.DequeueBatch(1)
	if err == nil && len(tasks) > 0 {
		return tasks[0]
	}

	// Block on channel
	return <-s.pending
}

// TryNext returns the next task without blocking. Returns nil if none available.
func (s *Scheduler) TryNext() *models.CrawlTask {
	select {
	case task := <-s.pending:
		return task
	default:
	}

	tasks, err := s.urlStore.DequeueBatch(1)
	if err == nil && len(tasks) > 0 {
		return tasks[0]
	}
	return nil
}

// Drain flushes all in-memory pending tasks to the BadgerDB overflow queue.
// Call during shutdown to avoid losing queued crawl tasks.
func (s *Scheduler) Drain() {
	drained := 0
	for {
		select {
		case task := <-s.pending:
			_ = s.urlStore.Enqueue(task)
			drained++
		default:
			if drained > 0 {
				log.Printf("scheduler: drained %d tasks to persistent queue", drained)
			}
			return
		}
	}
}

// ScheduleRecrawl adds a URL to the crawl queue, bypassing the seen-URL dedup check.
func (s *Scheduler) ScheduleRecrawl(task *models.CrawlTask) bool {
	// Reject if queue is at capacity
	if max := s.maxQueueSize.Load(); max > 0 && int64(s.Pending()) >= max {
		return false
	}

	// Try non-blocking send, fall back to persistent queue
	select {
	case s.pending <- task:
		return true
	default:
		if err := s.urlStore.Enqueue(task); err != nil {
			log.Printf("scheduler: failed to enqueue recrawl %s: %v", task.URL, err)
			return false
		}
		return true
	}
}

// Pending returns the approximate queue size.
func (s *Scheduler) Pending() int {
	return len(s.pending) + s.urlStore.QueueSize()
}
