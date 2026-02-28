package indexer

import (
	"math"
	"strings"
	"time"
)

// FreshnessMetrics describes how time-sensitive content is.
type FreshnessMetrics struct {
	TimeSensitiveCount int     `json:"time_sensitive_count"`
	DateReferenceCount int     `json:"date_reference_count"`
	EvergreenCount     int     `json:"evergreen_count"`
	FreshnessScore     float64 `json:"freshness_score"` // 0=evergreen, 1=time-sensitive
	IsTimeSensitive    bool    `json:"is_time_sensitive"`
	IsEvergreen        bool    `json:"is_evergreen"`
}

// FreshnessAnalyzer detects time-sensitivity and computes content decay.
type FreshnessAnalyzer struct{}

// NewFreshnessAnalyzer creates a freshness analyzer.
func NewFreshnessAnalyzer() *FreshnessAnalyzer {
	return &FreshnessAnalyzer{}
}

// Analyze determines freshness characteristics of content.
func (fa *FreshnessAnalyzer) Analyze(title, content string) FreshnessMetrics {
	m := FreshnessMetrics{}
	lower := strings.ToLower(content)
	titleLower := strings.ToLower(title)

	// Time-sensitive keywords (news, updates, announcements)
	timeSensitive := []string{
		"breaking", "latest", "new", "update", "released", "announced",
		"today", "yesterday", "this week", "this month", "just in",
		"developing", "exclusive", "report", "confirms", "launches",
	}
	for _, kw := range timeSensitive {
		if strings.Contains(lower, kw) {
			m.TimeSensitiveCount++
		}
		if strings.Contains(titleLower, kw) {
			m.TimeSensitiveCount += 2 // title occurrences weigh more
		}
	}

	// Evergreen keywords (guides, tutorials, reference material)
	evergreen := []string{
		"guide", "tutorial", "how to", "introduction", "basics",
		"overview", "getting started", "reference", "handbook",
		"fundamentals", "complete guide", "step by step", "best practices",
		"definition", "what is", "beginner",
	}
	for _, kw := range evergreen {
		if strings.Contains(lower, kw) || strings.Contains(titleLower, kw) {
			m.EvergreenCount++
		}
	}

	// Date references
	months := []string{
		"january", "february", "march", "april", "may", "june",
		"july", "august", "september", "october", "november", "december",
	}
	days := []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
	years := []string{"2020", "2021", "2022", "2023", "2024", "2025", "2026"}

	for _, mo := range months {
		if strings.Contains(lower, mo) {
			m.DateReferenceCount++
		}
	}
	for _, d := range days {
		if strings.Contains(lower, d) {
			m.DateReferenceCount++
		}
	}
	for _, y := range years {
		if strings.Contains(lower, y) {
			m.DateReferenceCount++
		}
	}
	if m.DateReferenceCount > 10 {
		m.DateReferenceCount = 10
	}

	// Compute freshness score
	score := 0.5 // neutral baseline
	score += math.Min(float64(m.TimeSensitiveCount)*0.03, 0.30)
	score += math.Min(float64(m.DateReferenceCount)*0.02, 0.20)
	score -= math.Min(float64(m.EvergreenCount)*0.05, 0.15)
	m.FreshnessScore = clamp(score)

	m.IsTimeSensitive = m.FreshnessScore > 0.7
	m.IsEvergreen = m.FreshnessScore < 0.3

	return m
}

// DecayScore computes an exponential decay multiplier based on content age and type.
// Returns 0-1 where 1.0 = fully fresh, 0.0 = fully decayed.
func (fa *FreshnessAnalyzer) DecayScore(crawledAt time.Time, freshness FreshnessMetrics) float64 {
	age := time.Since(crawledAt)
	days := age.Hours() / 24

	// Half-life in days depends on content type
	var halfLife float64
	switch {
	case freshness.IsTimeSensitive:
		halfLife = 30 // news decays fast
	case freshness.IsEvergreen:
		halfLife = 365 // evergreen lasts a year
	default:
		halfLife = 90 // standard content
	}

	// Exponential decay: score = e^(-λt) where λ = ln(2)/halfLife
	lambda := math.Ln2 / halfLife
	return math.Exp(-lambda * days)
}
