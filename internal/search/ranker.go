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

	// --- Quality multiplier (range: 0.5 – 2.0) ---
	// Weighted sum of quality signals, each in [0,1]
	qualitySignal := 0.0
	qualitySignal += r.EEATScore * 0.25         // E-E-A-T
	qualitySignal += r.QualityScore * 0.25       // Content quality
	qualitySignal += r.ReadabilityScore * 0.10   // Readability
	qualitySignal += r.CitationScore * 0.10      // Citation/research quality
	qualitySignal += r.LinkScore * 0.10          // Link profile
	qualitySignal += r.SEOScore * 0.10           // On-page SEO
	qualitySignal += r.AuthorCredibility * 0.05  // Author credibility
	qualitySignal += r.RelevanceScore * 0.05     // Composite relevance from indexer

	// Map [0, 1] → [0.5, 2.0]: pages with 0 quality get halved, perfect quality get 2x
	qualityMultiplier := 0.5 + qualitySignal*1.5

	// --- Freshness decay ---
	freshDecay := freshnessDecay(r.CrawledAt, r.FreshnessScore, r.IsTimeSensitive, r.IsEvergreen)

	// --- Spam penalty ---
	// spamScore in [0, 1]; convert to penalty factor [1.0, 0.0]
	spamPenalty := r.SpamScore * 0.8 // max 80% reduction for high spam
	spamFactor := 1.0 - spamPenalty

	final := bm25 * qualityMultiplier * freshDecay * spamFactor

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
