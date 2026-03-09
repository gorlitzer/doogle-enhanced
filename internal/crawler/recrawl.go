package crawler

import (
	"context"
	"log"
	"sort"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

// RecrawlScheduler periodically identifies stale URLs and schedules them for re-crawl.
type RecrawlScheduler struct {
	contentStore  *store.ContentStore
	mainScheduler *Scheduler
	interval      time.Duration
	batchSize     int
	maxAge        time.Duration
}

// NewRecrawlScheduler creates a new re-crawl scheduler.
func NewRecrawlScheduler(cs *store.ContentStore, sched *Scheduler) *RecrawlScheduler {
	return &RecrawlScheduler{
		contentStore:  cs,
		mainScheduler: sched,
		interval:      5 * time.Minute,
		batchSize:     50,
		maxAge:        24 * time.Hour,
	}
}

// Run starts the periodic re-crawl scheduling loop. Blocks until ctx is done.
func (rs *RecrawlScheduler) Run(ctx context.Context) {
	log.Println("recrawl: scheduler started")
	ticker := time.NewTicker(rs.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("recrawl: scheduler stopped")
			return
		case <-ticker.C:
			rs.scheduleBatch()
		}
	}
}

func (rs *RecrawlScheduler) scheduleBatch() {
	candidates := rs.contentStore.ListStale(rs.maxAge, rs.batchSize*5)
	if len(candidates) == 0 {
		return
	}

	// Score and sort by priority
	type scored struct {
		candidate store.ContentCandidate
		priority  float64
	}

	var items []scored
	for _, c := range candidates {
		staleDays := time.Since(c.LastCrawledAt).Hours() / 24
		changeFreq := 0.0
		if c.CrawlCount > 0 {
			changeFreq = float64(c.ChangeCount) / float64(c.CrawlCount)
		}

		// importance approximation (we don't have pagerank here, so use change frequency)
		importance := 0.3 + min64(changeFreq, 1.0)*0.7
		priority := staleDays * (0.5 + importance*2.0)

		items = append(items, scored{candidate: c, priority: priority})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].priority > items[j].priority
	})

	if len(items) > rs.batchSize {
		items = items[:rs.batchSize]
	}

	scheduled := 0
	for _, item := range items {
		task := &models.CrawlTask{
			URL:       item.candidate.URL,
			Depth:     0,
			Priority:  1,
			CreatedAt: time.Now(),
		}
		if rs.mainScheduler.ScheduleRecrawl(task) {
			scheduled++
		}
	}

	if scheduled > 0 {
		log.Printf("recrawl: scheduling %d stale URLs for re-crawl", scheduled)
	}
}

func min64(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
