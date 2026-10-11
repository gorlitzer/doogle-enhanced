package index

import (
	"log"
	"sync"

	"github.com/doogle/doogle-v2/internal/models"
)

// TextEmbedder is the interface for computing text embeddings.
type TextEmbedder interface {
	Embed(text string) ([]float32, error)
}

// HybridSearcher combines BM25 (Bleve) and vector similarity search,
// merging results via Reciprocal Rank Fusion (RRF).
type HybridSearcher struct {
	bleve      *BleveStore
	vectorDB   *BadgerVectorStore
	embedder   TextEmbedder
	bm25Weight float64
	vecWeight  float64
}

// NewHybridSearcher creates a hybrid searcher combining BM25 and vector search.
func NewHybridSearcher(bleve *BleveStore, vectorDB *BadgerVectorStore, embedder TextEmbedder, bm25Weight, vecWeight float64) *HybridSearcher {
	if bm25Weight <= 0 {
		bm25Weight = 0.7
	}
	if vecWeight <= 0 {
		vecWeight = 0.3
	}
	return &HybridSearcher{
		bleve:      bleve,
		vectorDB:   vectorDB,
		embedder:   embedder,
		bm25Weight: bm25Weight,
		vecWeight:  vecWeight,
	}
}

// HybridHit represents a merged search result.
type HybridHit struct {
	SearchHit
	VectorSimilarity float64
}

// Search performs hybrid BM25 + vector search with RRF fusion.
func (hs *HybridSearcher) Search(pq *models.ParsedQuery, offset, limit int) ([]SearchHit, int, error) {
	fetchSize := limit * 5
	if fetchSize < 100 {
		fetchSize = 100
	}

	var (
		bleveHits []SearchHit
		bleveTotal int
		vecHits   []VectorHit
		mu        sync.Mutex
		wg        sync.WaitGroup
	)

	// Run BM25 and vector search in parallel
	wg.Add(2)

	go func() {
		defer wg.Done()
		hits, total, err := hs.bleve.SearchAdvanced(pq, 0, fetchSize)
		if err != nil {
			log.Printf("hybrid: BM25 error: %v", err)
			return
		}
		mu.Lock()
		bleveHits = hits
		bleveTotal = total
		mu.Unlock()
	}()

	go func() {
		defer wg.Done()
		if hs.vectorDB == nil || hs.embedder == nil {
			return
		}
		queryText := pq.CleanedQuery
		if queryText == "" {
			queryText = pq.Raw
		}
		queryVec, err := hs.embedder.Embed(queryText)
		if err != nil {
			log.Printf("hybrid: embed error: %v", err)
			return
		}
		mu.Lock()
		vecHits = hs.vectorDB.Search(queryVec, fetchSize)
		mu.Unlock()
	}()

	wg.Wait()

	if len(bleveHits) == 0 && len(vecHits) == 0 {
		return nil, 0, nil
	}

	// RRF fusion: score(d) = Σ [weight / (k + rank(d))]
	// k=60 is standard for RRF
	const k = 60.0
	fusedScores := make(map[string]float64)
	fusedDocs := make(map[string]*IndexDocument)
	vectorSims := make(map[string]float64)

	// BM25 rankings
	for rank, hit := range bleveHits {
		fusedScores[hit.ID] += hs.bm25Weight / (k + float64(rank+1))
		fusedDocs[hit.ID] = hit.Doc
	}

	// Vector rankings
	for rank, hit := range vecHits {
		fusedScores[hit.DocID] += hs.vecWeight / (k + float64(rank+1))
		vectorSims[hit.DocID] = hit.Score
	}

	// Sort by fused score
	type fusedResult struct {
		id    string
		score float64
	}
	var sorted []fusedResult
	for id, score := range fusedScores {
		sorted = append(sorted, fusedResult{id, score})
	}
	for i := 0; i < len(sorted)-1; i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].score > sorted[i].score {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	// Build result hits, skipping offset
	var results []SearchHit
	for i, fr := range sorted {
		if i < offset {
			continue
		}
		if len(results) >= limit {
			break
		}

		doc := fusedDocs[fr.id]
		if doc == nil {
			// Doc came from vector search but not BM25 — try to load from Bleve
			loaded, err := hs.bleve.Get(fr.id)
			if err != nil {
				continue
			}
			doc = loaded
		}

		results = append(results, SearchHit{
			ID:    fr.id,
			Score: fr.score,
			Doc:   doc,
		})
	}

	total := bleveTotal
	if len(fusedScores) > total {
		total = len(fusedScores)
	}

	return results, total, nil
}

// Available reports whether the hybrid searcher can perform vector search.
func (hs *HybridSearcher) Available() bool {
	return hs.vectorDB != nil && hs.embedder != nil
}
