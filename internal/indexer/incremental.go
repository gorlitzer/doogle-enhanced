package indexer

import (
	"context"
	"log"
	"time"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/store"
)

// IncrementalIndexer selectively re-processes documents whose content has
// changed or whose scores are stale (freshness decay, PageRank updates).
type IncrementalIndexer struct {
	index        index.Store
	contentStore *store.ContentStore
	genStore     *store.GenerationStore
	scorer       *Scorer
	readability  *ReadabilityAnalyzer
	freshness    *FreshnessAnalyzer
	batch        *index.BatchIndexer
	interval     time.Duration
}

// NewIncrementalIndexer creates an incremental indexer.
func NewIncrementalIndexer(
	idx index.Store,
	cs *store.ContentStore,
	gs *store.GenerationStore,
	batch *index.BatchIndexer,
	interval time.Duration,
) *IncrementalIndexer {
	if interval <= 0 {
		interval = 10 * time.Minute
	}
	return &IncrementalIndexer{
		index:        idx,
		contentStore: cs,
		genStore:     gs,
		scorer:       NewScorer(),
		readability:  NewReadabilityAnalyzer(),
		freshness:    NewFreshnessAnalyzer(),
		batch:        batch,
		interval:     interval,
	}
}

// Start runs the incremental re-scoring loop in the background.
func (inc *IncrementalIndexer) Start(ctx context.Context) {
	go func() {
		// Wait before first run to let the system settle
		select {
		case <-time.After(2 * time.Minute):
		case <-ctx.Done():
			return
		}

		inc.run()

		ticker := time.NewTicker(inc.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				inc.run()
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (inc *IncrementalIndexer) run() {
	start := time.Now()

	newGen, err := inc.genStore.Increment()
	if err != nil {
		log.Printf("incremental: failed to increment generation: %v", err)
		return
	}

	updated := 0
	skipped := 0

	err = inc.index.ListAll(func(doc *index.IndexDocument) bool {
		// Skip documents that were recently scored (within the last generation)
		if doc.Generation >= newGen-1 {
			skipped++
			return true
		}

		// Re-compute static score (freshness decay changes over time)
		qualitySignal := 0.0
		qualitySignal += doc.EEATScore * 0.20
		qualitySignal += doc.QualityScore * 0.20
		qualitySignal += doc.PageRankScore * 0.20
		qualitySignal += doc.ReadabilityScore * 0.08
		qualitySignal += doc.CitationScore * 0.08
		qualitySignal += doc.LinkScore * 0.05
		qualitySignal += doc.SEOScore * 0.08
		qualitySignal += doc.AuthorCredibility * 0.05
		qualitySignal += doc.RelevanceScore * 0.06

		doc.StaticScore = (0.5 + qualitySignal*2.0) * (1.0 - doc.SpamScore*0.8)
		doc.Generation = newGen

		// Update content store record
		if inc.contentStore != nil {
			inc.contentStore.Put(doc.URL, &store.ContentRecord{
				ContentHash: doc.ContentHash,
				ScoredAt:    time.Now(),
				Generation:  newGen,
			})
		}

		if inc.batch != nil {
			inc.batch.Add(doc)
		} else {
			if err := inc.index.Index(doc); err != nil {
				log.Printf("incremental: failed to update doc %s: %v", doc.ID, err)
				return true
			}
		}
		updated++
		return true
	})

	if err != nil {
		log.Printf("incremental: iteration error: %v", err)
		return
	}

	// Flush batch
	if inc.batch != nil {
		if err := inc.batch.Flush(); err != nil {
			log.Printf("incremental: final flush error: %v", err)
		}
	}

	log.Printf("incremental: generation %d — updated %d docs, skipped %d in %dms",
		newGen, updated, skipped, time.Since(start).Milliseconds())
}

// Rescore forces a re-score of a single document by URL.
func (inc *IncrementalIndexer) Rescore(doc *index.IndexDocument) error {
	qualitySignal := 0.0
	qualitySignal += doc.EEATScore * 0.20
	qualitySignal += doc.QualityScore * 0.20
	qualitySignal += doc.PageRankScore * 0.20
	qualitySignal += doc.ReadabilityScore * 0.08
	qualitySignal += doc.CitationScore * 0.08
	qualitySignal += doc.LinkScore * 0.05
	qualitySignal += doc.SEOScore * 0.08
	qualitySignal += doc.AuthorCredibility * 0.05
	qualitySignal += doc.RelevanceScore * 0.06

	doc.StaticScore = (0.5 + qualitySignal*2.0) * (1.0 - doc.SpamScore*0.8)
	doc.Generation = inc.genStore.Current()

	return inc.index.Index(doc)
}
