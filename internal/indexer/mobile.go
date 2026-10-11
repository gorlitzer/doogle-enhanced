package indexer

import (
	"strings"

	"github.com/doogle/doogle-v2/internal/models"
)

// ComputeMobileScore computes a 0-1 mobile-friendliness score from document metrics.
func ComputeMobileScore(doc *models.Document) float64 {
	score := 0.30

	// Viewport meta tag (critical for mobile)
	if doc.HasViewportMeta {
		score += 0.30
		// width=device-width bonus
		if strings.Contains(strings.ToLower(doc.ViewportContent), "width=device-width") {
			score += 0.10
		}
	}

	// Responsive CSS signals
	if doc.HasMediaQueries {
		score += 0.10
	}
	if doc.HasFlexboxGrid {
		score += 0.05
	}

	// Touch icons
	if doc.HasTouchIcons {
		score += 0.05
	}

	// Penalties
	if doc.SmallFontCount > 5 {
		score -= 0.10
	}
	if doc.SmallTapTargets > 10 {
		score -= 0.10
	}

	return clamp(score)
}
