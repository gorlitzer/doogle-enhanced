package indexer

import (
	"github.com/doogle/doogle-v2/internal/models"
)

// ComputePerfScore computes a 0-1 performance score from document metrics.
func ComputePerfScore(doc *models.Document) float64 {
	score := 0.50

	// TTFB
	if doc.TTFB > 0 {
		switch {
		case doc.TTFB < 200:
			score += 0.15
		case doc.TTFB < 500:
			score += 0.10
		case doc.TTFB < 1000:
			score += 0.05
		case doc.TTFB > 2000:
			score -= 0.10
		}
	}

	// Page size
	if doc.PageSizeBytes > 0 {
		switch {
		case doc.PageSizeBytes < 500*1024:
			score += 0.10
		case doc.PageSizeBytes < 1024*1024:
			score += 0.05
		case doc.PageSizeBytes > 5*1024*1024:
			score -= 0.10
		}
	}

	// Resource count
	if doc.ResourceCount > 0 {
		switch {
		case doc.ResourceCount < 30:
			score += 0.10
		case doc.ResourceCount < 60:
			score += 0.05
		case doc.ResourceCount > 100:
			score -= 0.10
		}
	}

	// Lazy images
	if doc.HasLazyImages {
		score += 0.05
	}

	// Async scripts
	if doc.HasAsyncScripts {
		score += 0.05
	}

	// Script bloat penalty
	if doc.ScriptCount > 20 {
		score -= 0.10
	}

	return clamp(score)
}
