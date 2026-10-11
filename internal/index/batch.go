package index

import (
	"context"
	"log"
	"sync"
	"time"
)

// BatchIndexer buffers documents and flushes them to the index in batches
// for dramatically higher write throughput.
type BatchIndexer struct {
	store     Store
	buf       []*IndexDocument
	mu        sync.Mutex
	maxBatch  int
	flushTick time.Duration
	done      chan struct{}
}

// NewBatchIndexer creates a new batch indexer.
// maxBatch: flush when buffer reaches this size (default 100).
// flushInterval: flush on this interval even if buffer isn't full (default 5s).
func NewBatchIndexer(store Store, maxBatch int, flushInterval time.Duration) *BatchIndexer {
	if maxBatch <= 0 {
		maxBatch = 100
	}
	if flushInterval <= 0 {
		flushInterval = 5 * time.Second
	}
	return &BatchIndexer{
		store:     store,
		buf:       make([]*IndexDocument, 0, maxBatch),
		maxBatch:  maxBatch,
		flushTick: flushInterval,
		done:      make(chan struct{}),
	}
}

// Add appends a document to the buffer. Auto-flushes if the buffer is full.
func (bi *BatchIndexer) Add(doc *IndexDocument) {
	bi.mu.Lock()
	bi.buf = append(bi.buf, doc)
	shouldFlush := len(bi.buf) >= bi.maxBatch
	bi.mu.Unlock()

	if shouldFlush {
		if err := bi.Flush(); err != nil {
			log.Printf("batch indexer: auto-flush error: %v", err)
		}
	}
}

// Flush writes the current buffer to the index and clears it.
func (bi *BatchIndexer) Flush() error {
	bi.mu.Lock()
	if len(bi.buf) == 0 {
		bi.mu.Unlock()
		return nil
	}
	batch := bi.buf
	bi.buf = make([]*IndexDocument, 0, bi.maxBatch)
	bi.mu.Unlock()

	if err := bi.store.IndexBatch(batch); err != nil {
		log.Printf("batch indexer: flush error (%d docs): %v", len(batch), err)
		return err
	}
	log.Printf("batch indexer: flushed %d docs", len(batch))
	return nil
}

// Start begins the background flush ticker.
func (bi *BatchIndexer) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(bi.flushTick)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				if err := bi.Flush(); err != nil {
					log.Printf("batch indexer: tick flush error: %v", err)
				}
			case <-ctx.Done():
				// Final flush on shutdown
				if err := bi.Flush(); err != nil {
					log.Printf("batch indexer: final flush error: %v", err)
				}
				close(bi.done)
				return
			}
		}
	}()
}

// Stop waits for the background flusher to finish.
func (bi *BatchIndexer) Stop() {
	<-bi.done
}
