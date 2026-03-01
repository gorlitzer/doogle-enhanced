package search

import (
	"math"
	"sort"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

// RerankResults re-ranks search results using a multi-factor scoring model.
// Combines BM25 text relevance with quality signals, freshness decay, and spam penalty.
func RerankResults(results []models.SearchResult) {
	for i := range results {
		results[i].Score = computeFinalScore(&results[i])
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})
}

// computeFinalScore blends BM25 with quality signals.
//
// Formula:
//
//	final = BM25 * qualityMultiplier * freshnessDecay * (1 - spamPenalty)
//
// where qualityMultiplier incorporates E-E-A-T, content quality, readability,
// citations, link profile, SEO, and author credibility.
func computeFinalScore(r *models.SearchResult) float64 {
	bm25 := r.Score

	// --- Quality multiplier ---
	// Use pre-computed StaticScore when available (set at index time).
	// This avoids recomputing the quality*spam factor on every search.
	var qualityMultiplier float64
	if r.StaticScore > 0 {
		qualityMultiplier = r.StaticScore
	} else {
		// Fallback for documents indexed before StaticScore was introduced
		qualitySignal := 0.0
		qualitySignal += r.EEATScore * 0.20
		qualitySignal += r.QualityScore * 0.20
		qualitySignal += r.PageRankScore * 0.20
		qualitySignal += r.ReadabilityScore * 0.08
		qualitySignal += r.CitationScore * 0.08
		qualitySignal += r.LinkScore * 0.05
		qualitySignal += r.SEOScore * 0.08
		qualitySignal += r.AuthorCredibility * 0.05
		qualitySignal += r.RelevanceScore * 0.06

		qualityMultiplier = (0.5 + qualitySignal*2.0) * (1.0 - r.SpamScore*0.8)
	}

	// --- Freshness decay ---
	freshDecay := freshnessDecay(r.CrawledAt, r.FreshnessScore, r.IsTimeSensitive, r.IsEvergreen)

	final := bm25 * qualityMultiplier * freshDecay

	return math.Max(0, final)
}

// freshnessDecay computes an exponential decay factor based on content age.
// Returns [0.0, 1.0] where 1.0 = fully fresh.
func freshnessDecay(crawledAt time.Time, freshnessScore float64, isTimeSensitive, isEvergreen bool) float64 {
	if crawledAt.IsZero() {
		return 0.8 // unknown age gets a small penalty
	}

	age := time.Since(crawledAt)
	days := age.Hours() / 24

	// Half-life in days depends on content type
	var halfLife float64
	switch {
	case isTimeSensitive:
		halfLife = 30 // news decays fast
	case isEvergreen:
		halfLife = 365 // evergreen lasts a year
	case freshnessScore > 0.6:
		halfLife = 60 // moderately time-sensitive
	default:
		halfLife = 120 // standard content
	}

	// Exponential decay: score = e^(-λt) where λ = ln(2)/halfLife
	lambda := math.Ln2 / halfLife
	decay := math.Exp(-lambda * days)

	// Floor at 0.2 — even very old content keeps some value
	return math.Max(0.2, decay)
}
