package search

import (
	"math"
	"sort"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

// PeerTrustFn resolves a peer ID to its trust score (0.0–1.0).
// When nil, all peers are treated equally (trust=0.5).
var PeerTrustFn func(peerID string) float64

// RerankResults re-ranks search results using a multi-factor scoring model.
// Combines BM25 text relevance with quality signals, freshness decay, and spam penalty.
func RerankResults(results []models.SearchResult) {
	RerankWithIntent(results, nil)
}

// RerankWithIntent re-ranks results with optional intent-based weight adjustments.
// Applies reputation-weighted scoring: results from high-trust peers are boosted.
func RerankWithIntent(results []models.SearchResult, intent *QueryIntent) {
	for i := range results {
		results[i].Score = computeFinalScore(&results[i], intent)
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})
}

// computeFinalScore blends BM25 with quality signals.
//
// Updated weight model:
//
//	EEAT: 0.15, Quality: 0.10, PageRank: 0.15, DomainAuthority: 0.10,
//	URLQuality: 0.05, Readability: 0.08, Citation: 0.08, Link: 0.05,
//	SEO: 0.05, AuthorCredibility: 0.05, Relevance: 0.06, Freshness: 0.08
func computeFinalScore(r *models.SearchResult, intent *QueryIntent) float64 {
	bm25 := r.Score

	// --- Quality multiplier ---
	var qualityMultiplier float64
	if r.StaticScore > 0 {
		qualityMultiplier = r.StaticScore
	} else {
		qualitySignal := 0.0
		qualitySignal += r.EEATScore * 0.15
		qualitySignal += r.QualityScore * 0.10
		qualitySignal += r.PageRankScore * 0.15
		qualitySignal += r.DomainAuthorityScore * 0.10
		qualitySignal += r.URLQualityScore * 0.05
		qualitySignal += r.ReadabilityScore * 0.08
		qualitySignal += r.CitationScore * 0.08
		qualitySignal += r.LinkScore * 0.05
		qualitySignal += r.SEOScore * 0.05
		qualitySignal += r.AuthorCredibility * 0.05
		qualitySignal += r.RelevanceScore * 0.06

		qualityMultiplier = (0.5 + qualitySignal*2.0) * (1.0 - r.SpamScore*0.8)
	}

	// --- Freshness as a separate signal instead of just a multiplier ---
	freshScore := graduatedFreshnessScore(r.CrawledAt, r.IsTimeSensitive, r.IsEvergreen)
	// Blend: 92% quality multiplier + 8% freshness signal
	qualityMultiplier = qualityMultiplier*0.92 + freshScore*0.08*2.0

	// --- Intent-based adjustments ---
	if intent != nil && intent.Confidence > 0.5 {
		qualityMultiplier *= intentMultiplier(r, intent)
	}

	// --- Reputation-weighted scoring ---
	// Results from high-trust peers get boosted, low-trust peers penalized.
	// Trust=0.5 is neutral (multiplier=1.0). Trust=1.0 → 1.15, Trust=0.0 → 0.85.
	if PeerTrustFn != nil && r.OriginPeerID != "" {
		trust := PeerTrustFn(r.OriginPeerID)
		// Map trust [0,1] → multiplier [0.85, 1.15] — centered at 0.5→1.0
		trustMultiplier := 0.85 + trust*0.30
		qualityMultiplier *= trustMultiplier
	}

	final := bm25 * qualityMultiplier

	return math.Max(0, final)
}

// intentMultiplier adjusts the score based on query intent.
func intentMultiplier(r *models.SearchResult, intent *QueryIntent) float64 {
	switch intent.Type {
	case IntentNavigational:
		// Boost exact domain matches heavily
		mult := 1.0
		if r.DomainAuthorityScore > 0.7 {
			mult += 0.5 // well-known domains get a boost
		}
		if r.URLQualityScore > 0.8 {
			mult += 0.3 // clean, shallow URLs (likely homepages)
		}
		return mult

	case IntentInformational:
		// Boost content quality, readability
		mult := 1.0
		if r.ReadabilityScore > 0.6 {
			mult += 0.2
		}
		if r.QualityScore > 0.6 {
			mult += 0.15
		}
		if r.EEATScore > 0.5 {
			mult += 0.15
		}
		return mult

	case IntentTransactional:
		// Boost commercial/structured pages
		mult := 1.0
		if r.SEOScore > 0.6 {
			mult += 0.2
		}
		return mult

	case IntentLocal:
		// Minimal adjustment for now (no geo data available)
		return 1.0
	}

	return 1.0
}

// graduatedFreshnessScore computes a graduated freshness score.
// Time-sensitive: sharp decay (half-life 7 days)
// Evergreen: slow decay (half-life 365 days)
// No date: neutral (0.5)
func graduatedFreshnessScore(crawledAt time.Time, isTimeSensitive, isEvergreen bool) float64 {
	if crawledAt.IsZero() {
		return 0.5
	}

	age := time.Since(crawledAt)
	days := age.Hours() / 24

	var halfLife float64
	switch {
	case isTimeSensitive:
		halfLife = 7
	case isEvergreen:
		halfLife = 365
	default:
		halfLife = 90
	}

	lambda := math.Ln2 / halfLife
	score := 0.5 + 0.5*math.Exp(-lambda*days)

	return math.Max(0.1, math.Min(1.0, score))
}
