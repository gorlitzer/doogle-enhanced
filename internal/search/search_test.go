package search

import (
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

// ---- Ranker tests ----

func TestComputeFinalScore_WithStaticScore(t *testing.T) {
	r := &models.SearchResult{
		Score:       1.0, // BM25
		StaticScore: 2.0,
		CrawledAt:   time.Now(),
	}

	score := computeFinalScore(r)
	if score <= 0 {
		t.Fatalf("expected positive score, got %f", score)
	}

	// With StaticScore=2.0, freshness~1.0 (just crawled), score ≈ 1.0 * 2.0 * 1.0 = 2.0
	if score < 1.5 || score > 2.5 {
		t.Fatalf("expected score ~2.0 with StaticScore=2.0, got %f", score)
	}
}

func TestComputeFinalScore_FallbackWithoutStaticScore(t *testing.T) {
	r := &models.SearchResult{
		Score:        1.0,
		StaticScore:  0, // no pre-computed score
		QualityScore: 0.5,
		EEATScore:    0.5,
		PageRankScore: 0.3,
		SpamScore:    0.1,
		CrawledAt:    time.Now(),
	}

	score := computeFinalScore(r)
	if score <= 0 {
		t.Fatalf("expected positive score, got %f", score)
	}
}

func TestComputeFinalScore_SpamPenaltyInStaticScore(t *testing.T) {
	// High spam should produce low StaticScore
	highSpam := &models.SearchResult{
		Score:       1.0,
		StaticScore: 0.2, // low because spam was high at index time
		CrawledAt:   time.Now(),
	}

	lowSpam := &models.SearchResult{
		Score:       1.0,
		StaticScore: 2.0, // high because clean
		CrawledAt:   time.Now(),
	}

	spamScore := computeFinalScore(highSpam)
	cleanScore := computeFinalScore(lowSpam)

	if spamScore >= cleanScore {
		t.Fatalf("expected spam score (%f) < clean score (%f)", spamScore, cleanScore)
	}
}

func TestComputeFinalScore_FreshnessDecay(t *testing.T) {
	recent := &models.SearchResult{
		Score:       1.0,
		StaticScore: 1.5,
		CrawledAt:   time.Now(),
	}

	old := &models.SearchResult{
		Score:       1.0,
		StaticScore: 1.5,
		CrawledAt:   time.Now().Add(-365 * 24 * time.Hour), // 1 year ago
	}

	recentScore := computeFinalScore(recent)
	oldScore := computeFinalScore(old)

	if oldScore >= recentScore {
		t.Fatalf("expected old score (%f) < recent score (%f)", oldScore, recentScore)
	}
}

func TestFreshnessDecay_TimeSensitive(t *testing.T) {
	// Time-sensitive content decays faster
	decay := freshnessDecay(time.Now().Add(-60*24*time.Hour), 0.5, true, false)
	if decay >= 0.5 {
		t.Fatalf("expected time-sensitive decay < 0.5 after 60 days, got %f", decay)
	}
}

func TestFreshnessDecay_Evergreen(t *testing.T) {
	// Evergreen content decays slower
	decay := freshnessDecay(time.Now().Add(-180*24*time.Hour), 0.5, false, true)
	if decay < 0.4 {
		t.Fatalf("expected evergreen decay > 0.4 after 180 days, got %f", decay)
	}
}

func TestFreshnessDecay_ZeroCrawledAt(t *testing.T) {
	decay := freshnessDecay(time.Time{}, 0.5, false, false)
	if decay != 0.8 {
		t.Fatalf("expected 0.8 for zero time, got %f", decay)
	}
}

func TestRerankResults_Sorting(t *testing.T) {
	results := []models.SearchResult{
		{URL: "https://low.com", Score: 0.1, StaticScore: 0.5, CrawledAt: time.Now()},
		{URL: "https://high.com", Score: 1.0, StaticScore: 2.0, CrawledAt: time.Now()},
		{URL: "https://mid.com", Score: 0.5, StaticScore: 1.0, CrawledAt: time.Now()},
	}

	RerankResults(results)

	// Should be sorted descending by score
	for i := 0; i < len(results)-1; i++ {
		if results[i].Score < results[i+1].Score {
			t.Fatalf("results not sorted: [%d]=%f < [%d]=%f", i, results[i].Score, i+1, results[i+1].Score)
		}
	}
}

// ---- ParseQuery tests ----

func TestParseQuery_Basic(t *testing.T) {
	pq := ParseQuery("golang tutorial")
	if len(pq.Terms) != 2 {
		t.Fatalf("expected 2 terms, got %d: %v", len(pq.Terms), pq.Terms)
	}
	if pq.Terms[0] != "golang" || pq.Terms[1] != "tutorial" {
		t.Fatalf("unexpected terms: %v", pq.Terms)
	}
}

func TestParseQuery_SiteFilter(t *testing.T) {
	pq := ParseQuery("python site:docs.python.org")
	if pq.SiteDomain != "docs.python.org" {
		t.Fatalf("expected site=docs.python.org, got %q", pq.SiteDomain)
	}
	if len(pq.Terms) != 1 || pq.Terms[0] != "python" {
		t.Fatalf("unexpected terms: %v", pq.Terms)
	}
}

func TestParseQuery_Phrases(t *testing.T) {
	pq := ParseQuery(`"machine learning" basics`)
	if len(pq.Phrases) != 1 || pq.Phrases[0] != "machine learning" {
		t.Fatalf("expected phrase 'machine learning', got %v", pq.Phrases)
	}
}

func TestParseQuery_StopWords(t *testing.T) {
	pq := ParseQuery("the quick brown fox is a test")
	// "the", "is", "a" are stop words
	for _, term := range pq.Terms {
		if term == "the" || term == "is" || term == "a" {
			t.Fatalf("stop word %q not removed", term)
		}
	}
}

func TestParseQuery_Synonyms(t *testing.T) {
	pq := ParseQuery("golang")
	syns, ok := pq.Synonyms["golang"]
	if !ok {
		t.Fatal("expected synonyms for 'golang'")
	}
	found := false
	for _, s := range syns {
		if s == "go" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected 'go' in synonyms for 'golang'")
	}
}

func TestParseQuery_Fuzzy(t *testing.T) {
	short := ParseQuery("go web")
	if !short.UseFuzzy {
		t.Fatal("expected UseFuzzy=true for short query")
	}

	long := ParseQuery("golang web development framework comparison review")
	if long.UseFuzzy {
		t.Fatal("expected UseFuzzy=false for long query")
	}
}

func TestParseQuery_Empty(t *testing.T) {
	pq := ParseQuery("")
	if pq.CleanedQuery != "" {
		t.Fatalf("expected empty cleaned query, got %q", pq.CleanedQuery)
	}
}

func TestParseQuery_LanguageFilter(t *testing.T) {
	pq := ParseQuery("documentation lang:en")
	if pq.Language != "en" {
		t.Fatalf("expected lang=en, got %q", pq.Language)
	}
}
