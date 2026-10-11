package indexer

import (
	"context"
	"log"
	"math"
	"strings"
	"sync"
	"time"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

const (
	dampingFactor     = 0.85
	convergenceEps    = 1e-6
	maxIterations     = 20
	crossDomainWeight = 1.5
	minDocsForRank    = 10
	initialDelay      = 30 * time.Second
	maxAnchorLen      = 500
)

// genericAnchors are link texts that carry no meaningful signal.
var genericAnchors = map[string]bool{
	"click here": true, "here": true, "link": true,
	"read more": true, "more": true, "this": true,
	"source": true, "learn more": true, "details": true,
}

// PageRankComputer runs iterative PageRank on the link graph and writes
// scores + aggregated anchor text back into the Bleve index.
type PageRankComputer struct {
	linkStore *store.LinkStore
	index     index.Store
	interval  time.Duration

	mu     sync.RWMutex
	scores map[string]float64 // docID → normalized [0,1] score
}

// NewPageRankComputer creates a new PageRank computer.
func NewPageRankComputer(ls *store.LinkStore, idx index.Store, interval time.Duration) *PageRankComputer {
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	return &PageRankComputer{
		linkStore: ls,
		index:     idx,
		interval:  interval,
		scores:    make(map[string]float64),
	}
}

// Start runs the PageRank loop in the background.
func (pr *PageRankComputer) Start(ctx context.Context) {
	go func() {
		select {
		case <-time.After(initialDelay):
		case <-ctx.Done():
			return
		}

		pr.compute()

		ticker := time.NewTicker(pr.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				pr.compute()
			case <-ctx.Done():
				return
			}
		}
	}()
}

// GetScore returns the cached PageRank score for a document.
func (pr *PageRankComputer) GetScore(docID string) float64 {
	pr.mu.RLock()
	defer pr.mu.RUnlock()
	return pr.scores[docID]
}

// compute runs one full PageRank iteration cycle.
func (pr *PageRankComputer) compute() {
	start := time.Now()

	destIDs, err := pr.linkStore.AllDestinations()
	if err != nil {
		log.Printf("pagerank: failed to get destinations: %v", err)
		return
	}
	if len(destIDs) < minDocsForRank {
		log.Printf("pagerank: only %d linked docs, skipping (need %d)", len(destIDs), minDocsForRank)
		return
	}

	type inEdge struct {
		srcID     string
		weight    float64
		outDegree int
	}

	n := len(destIDs)
	inbound := make(map[string][]inEdge, n)
	allNodes := make(map[string]bool, n*2)

	for _, destID := range destIDs {
		allNodes[destID] = true

		edges, err := pr.linkStore.GetInboundLinks(destID)
		if err != nil {
			continue
		}
		for _, edge := range edges {
			srcID := models.DocumentID(edge.FromURL)
			allNodes[srcID] = true

			outCount, _ := pr.linkStore.GetOutboundCount(srcID)
			if outCount == 0 {
				outCount = 1
			}

			w := 1.0
			if edge.IsCross {
				w = crossDomainWeight
			}

			inbound[destID] = append(inbound[destID], inEdge{
				srcID:     srcID,
				weight:    w,
				outDegree: outCount,
			})
		}
	}

	totalNodes := float64(len(allNodes))

	// Initialize ranks
	rank := make(map[string]float64, len(allNodes))
	initRank := 1.0 / totalNodes
	for id := range allNodes {
		rank[id] = initRank
	}

	// Iterate
	for iter := 0; iter < maxIterations; iter++ {
		newRank := make(map[string]float64, len(allNodes))
		base := (1.0 - dampingFactor) / totalNodes

		for id := range allNodes {
			newRank[id] = base
		}

		for destID, edges := range inbound {
			sum := 0.0
			for _, e := range edges {
				sum += (rank[e.srcID] * e.weight) / float64(e.outDegree)
			}
			newRank[destID] += dampingFactor * sum
		}

		totalDelta := 0.0
		for id := range allNodes {
			totalDelta += math.Abs(newRank[id] - rank[id])
		}
		rank = newRank

		if totalDelta < convergenceEps {
			log.Printf("pagerank: converged after %d iterations (delta=%.2e)", iter+1, totalDelta)
			break
		}
	}

	// Normalize to [0,1]
	maxRank := 0.0
	for _, r := range rank {
		if r > maxRank {
			maxRank = r
		}
	}
	if maxRank > 0 {
		for id := range rank {
			rank[id] /= maxRank
		}
	}

	// Update cached scores
	pr.mu.Lock()
	pr.scores = rank
	pr.mu.Unlock()

	// Write back to Bleve + aggregate anchor text
	updated := 0
	for _, destID := range destIDs {
		doc, err := pr.index.Get(destID)
		if err != nil {
			continue
		}

		doc.PageRankScore = rank[destID]

		edges, err := pr.linkStore.GetInboundLinks(destID)
		if err == nil {
			doc.AnchorText = aggregateAnchorText(edges)
		}

		if err := pr.index.Index(doc); err != nil {
			log.Printf("pagerank: failed to update doc %s: %v", destID, err)
			continue
		}
		updated++
	}

	log.Printf("pagerank: computed for %d nodes, updated %d docs in %dms",
		len(allNodes), updated, time.Since(start).Milliseconds())
}

// aggregateAnchorText deduplicates and concatenates anchor texts, filtering generic ones.
func aggregateAnchorText(edges []store.LinkEdge) string {
	seen := make(map[string]bool)
	var parts []string
	totalLen := 0

	for _, e := range edges {
		text := strings.TrimSpace(e.AnchorText)
		lower := strings.ToLower(text)
		if text == "" || genericAnchors[lower] || seen[lower] {
			continue
		}
		seen[lower] = true

		if totalLen+len(text) > maxAnchorLen {
			break
		}
		parts = append(parts, text)
		totalLen += len(text) + 1
	}

	return strings.Join(parts, " ")
}
