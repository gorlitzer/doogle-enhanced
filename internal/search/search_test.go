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

	score := computeFinalScore(r, nil)
	if score <= 0 {
		t.Fatalf("expected positive score, got %f", score)
	}

	// With StaticScore=2.0, freshness blended in, score should be substantial
	if score < 1.0 || score > 3.0 {
		t.Fatalf("expected score in range [1.0, 3.0] with StaticScore=2.0, got %f", score)
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

	score := computeFinalScore(r, nil)
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

	spamScore := computeFinalScore(highSpam, nil)
	cleanScore := computeFinalScore(lowSpam, nil)

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

	recentScore := computeFinalScore(recent, nil)
	oldScore := computeFinalScore(old, nil)

	if oldScore >= recentScore {
		t.Fatalf("expected old score (%f) < recent score (%f)", oldScore, recentScore)
	}
}

func TestGraduatedFreshness_TimeSensitive(t *testing.T) {
	// Time-sensitive content decays faster
	score := graduatedFreshnessScore(time.Now().Add(-60*24*time.Hour), true, false)
	if score >= 0.7 {
		t.Fatalf("expected time-sensitive freshness < 0.7 after 60 days, got %f", score)
	}
}

func TestGraduatedFreshness_Evergreen(t *testing.T) {
	// Evergreen content decays slower
	score := graduatedFreshnessScore(time.Now().Add(-180*24*time.Hour), false, true)
	if score < 0.4 {
		t.Fatalf("expected evergreen freshness > 0.4 after 180 days, got %f", score)
	}
}

func TestGraduatedFreshness_ZeroCrawledAt(t *testing.T) {
	score := graduatedFreshnessScore(time.Time{}, false, false)
	if score != 0.5 {
		t.Fatalf("expected 0.5 for zero time, got %f", score)
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

// ---- Boolean operator tests ----

func TestParseQuery_Exclude(t *testing.T) {
	pq := ParseQuery("golang -tutorial")
	if len(pq.Terms) != 1 || pq.Terms[0] != "golang" {
		t.Fatalf("expected terms=[golang], got %v", pq.Terms)
	}
	if len(pq.ExcludeTerms) != 1 || pq.ExcludeTerms[0] != "tutorial" {
		t.Fatalf("expected excludes=[tutorial], got %v", pq.ExcludeTerms)
	}
}

func TestParseQuery_ExcludeWithPhrase(t *testing.T) {
	pq := ParseQuery(`"machine learning" -beginner`)
	if len(pq.Phrases) != 1 || pq.Phrases[0] != "machine learning" {
		t.Fatalf("expected phrase 'machine learning', got %v", pq.Phrases)
	}
	if len(pq.ExcludeTerms) != 1 || pq.ExcludeTerms[0] != "beginner" {
		t.Fatalf("expected excludes=[beginner], got %v", pq.ExcludeTerms)
	}
}

func TestParseQuery_ORBasic(t *testing.T) {
	pq := ParseQuery("python OR ruby")
	if len(pq.OrGroups) != 1 {
		t.Fatalf("expected 1 OR group, got %d", len(pq.OrGroups))
	}
	group := pq.OrGroups[0]
	if len(group) != 2 || group[0] != "python" || group[1] != "ruby" {
		t.Fatalf("expected OR group [python ruby], got %v", group)
	}
	if len(pq.Terms) != 0 {
		t.Fatalf("expected no AND terms, got %v", pq.Terms)
	}
}

func TestParseQuery_ORWithAND(t *testing.T) {
	pq := ParseQuery("tutorial python OR ruby")
	if len(pq.Terms) != 1 || pq.Terms[0] != "tutorial" {
		t.Fatalf("expected terms=[tutorial], got %v", pq.Terms)
	}
	if len(pq.OrGroups) != 1 {
		t.Fatalf("expected 1 OR group, got %d", len(pq.OrGroups))
	}
	group := pq.OrGroups[0]
	if len(group) != 2 || group[0] != "python" || group[1] != "ruby" {
		t.Fatalf("expected OR group [python ruby], got %v", group)
	}
}

func TestParseQuery_LowercaseOrIsStopWord(t *testing.T) {
	pq := ParseQuery("this or that")
	// lowercase "or" is a stop word, should be removed
	if len(pq.OrGroups) != 0 {
		t.Fatalf("expected no OR groups for lowercase 'or', got %v", pq.OrGroups)
	}
}

func TestParseQuery_MultipleExcludes(t *testing.T) {
	pq := ParseQuery("golang -tutorial -beginner -basics")
	if len(pq.Terms) != 1 || pq.Terms[0] != "golang" {
		t.Fatalf("expected terms=[golang], got %v", pq.Terms)
	}
	if len(pq.ExcludeTerms) != 3 {
		t.Fatalf("expected 3 excludes, got %d: %v", len(pq.ExcludeTerms), pq.ExcludeTerms)
	}
}

// ---- Search dork tests ----

func TestParseQuery_InTitle(t *testing.T) {
	pq := ParseQuery("golang intitle:tutorial")
	if pq.InTitle != "tutorial" {
		t.Fatalf("expected InTitle=tutorial, got %q", pq.InTitle)
	}
	if len(pq.Terms) != 1 || pq.Terms[0] != "golang" {
		t.Fatalf("expected terms=[golang], got %v", pq.Terms)
	}
}

func TestParseQuery_InURL(t *testing.T) {
	pq := ParseQuery("golang inurl:docs")
	if pq.InURL != "docs" {
		t.Fatalf("expected InURL=docs, got %q", pq.InURL)
	}
	if len(pq.Terms) != 1 || pq.Terms[0] != "golang" {
		t.Fatalf("expected terms=[golang], got %v", pq.Terms)
	}
}

func TestParseQuery_InText_And_InBody(t *testing.T) {
	pq := ParseQuery("intext:kubernetes")
	if pq.InText != "kubernetes" {
		t.Fatalf("expected InText=kubernetes, got %q", pq.InText)
	}

	pq2 := ParseQuery("inbody:docker")
	if pq2.InText != "docker" {
		t.Fatalf("expected InText=docker from inbody:, got %q", pq2.InText)
	}
}

func TestParseQuery_FileType(t *testing.T) {
	// Single filetype
	pq := ParseQuery("golang filetype:pdf")
	if len(pq.FileTypes) != 1 || pq.FileTypes[0] != "pdf" {
		t.Fatalf("expected FileTypes=[pdf], got %v", pq.FileTypes)
	}

	// Multiple filetypes
	pq2 := ParseQuery("report ext:pdf filetype:doc")
	if len(pq2.FileTypes) != 2 {
		t.Fatalf("expected 2 filetypes, got %d: %v", len(pq2.FileTypes), pq2.FileTypes)
	}
}

func TestParseQuery_BeforeAfter(t *testing.T) {
	pq := ParseQuery("golang after:2025-01-01 before:2025-06-01")
	if pq.After != "2025-01-01" {
		t.Fatalf("expected After=2025-01-01, got %q", pq.After)
	}
	if pq.Before != "2025-06-01" {
		t.Fatalf("expected Before=2025-06-01, got %q", pq.Before)
	}
	if len(pq.Terms) != 1 || pq.Terms[0] != "golang" {
		t.Fatalf("expected terms=[golang], got %v", pq.Terms)
	}
}

func TestParseQuery_HasHTTPS(t *testing.T) {
	pq := ParseQuery("golang has:https")
	if !pq.HasHTTPS {
		t.Fatal("expected HasHTTPS=true")
	}
	if len(pq.Terms) != 1 || pq.Terms[0] != "golang" {
		t.Fatalf("expected terms=[golang], got %v", pq.Terms)
	}
}

func TestParseQuery_CombinedDorks(t *testing.T) {
	pq := ParseQuery("golang intitle:tutorial -beginner site:go.dev")
	if pq.InTitle != "tutorial" {
		t.Fatalf("expected InTitle=tutorial, got %q", pq.InTitle)
	}
	if pq.SiteDomain != "go.dev" {
		t.Fatalf("expected SiteDomain=go.dev, got %q", pq.SiteDomain)
	}
	if len(pq.ExcludeTerms) != 1 || pq.ExcludeTerms[0] != "beginner" {
		t.Fatalf("expected excludes=[beginner], got %v", pq.ExcludeTerms)
	}
	if len(pq.Terms) != 1 || pq.Terms[0] != "golang" {
		t.Fatalf("expected terms=[golang], got %v", pq.Terms)
	}
}
