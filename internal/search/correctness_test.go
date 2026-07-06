package search

import (
	"testing"

	"github.com/doogle/doogle-v2/internal/models"
)

// TestRerank_Idempotent is the regression test for the compounding-score bug:
// re-ranking the same results repeatedly must not change the scores, because
// scorers read the immutable BM25 field rather than the mutated Score.
func TestRerank_Idempotent(t *testing.T) {
	mk := func() []models.SearchResult {
		return []models.SearchResult{
			{URL: "https://a.com", Score: 3.0, BM25: 3.0, StaticScore: 1.2},
			{URL: "https://b.com", Score: 2.0, BM25: 2.0, StaticScore: 0.9},
			{URL: "https://c.com", Score: 1.0, BM25: 1.0, StaticScore: 1.1},
		}
	}

	once := mk()
	RerankResults(once)

	twice := mk()
	RerankResults(twice)
	RerankResults(twice)
	RerankResults(twice) // three passes, mimicking the old local/distributed re-rank stack

	for i := range once {
		if once[i].URL != twice[i].URL {
			t.Fatalf("ordering changed after repeated rerank at %d: %s vs %s", i, once[i].URL, twice[i].URL)
		}
		if once[i].Score != twice[i].Score {
			t.Fatalf("score compounded for %s: single=%v triple=%v", once[i].URL, once[i].Score, twice[i].Score)
		}
	}
}

// TestIntent_WordBoundary is the regression test for substring intent matching:
// transactional single-word triggers must match whole words only.
func TestIntent_WordBoundary(t *testing.T) {
	transactional := func(q string) bool {
		pq := ParseQuery(q)
		return ClassifyIntent(pq).Type == IntentTransactional
	}

	// These contain a transactional word as a SUBSTRING but should NOT classify
	// as transactional.
	for _, q := range []string{"facebook login", "restore iphone backup", "different opinions"} {
		if transactional(q) {
			t.Errorf("%q should not be transactional (substring false positive)", q)
		}
	}
	// A genuine transactional query still classifies correctly.
	if !transactional("buy running shoes") {
		t.Error(`"buy running shoes" should be transactional`)
	}
}

// TestDedupeResults covers near-duplicate collapsing: exact URL, canonicalized
// URL variants (trailing slash / http vs https), and identical content hashes
// under different URLs all collapse to the first (best-ranked) occurrence.
func TestDedupeResults(t *testing.T) {
	in := []models.SearchResult{
		{URL: "https://a.com/page", ContentHash: "h1"},
		{URL: "https://a.com/page/", ContentHash: "h1"},   // trailing-slash variant → same canonical URL
		{URL: "http://a.com/page", ContentHash: "h1"},      // scheme variant → same canonical URL
		{URL: "https://mirror.com/copy", ContentHash: "h1"}, // different URL, same content → near-dup
		{URL: "https://b.com/other", ContentHash: "h2"},     // distinct
		{URL: "https://c.com/nohash", ContentHash: ""},      // no hash → dedup by URL only
	}
	out := DedupeResults(in)
	if len(out) != 3 {
		urls := make([]string, len(out))
		for i, r := range out {
			urls[i] = r.URL
		}
		t.Fatalf("expected 3 deduped results, got %d: %v", len(out), urls)
	}
	if out[0].URL != "https://a.com/page" {
		t.Errorf("expected best-ranked original to survive, got %s", out[0].URL)
	}
}

func TestParseRerankScores(t *testing.T) {
	// Well-formed JSON.
	s := parseRerankScores(`{"0": 8, "1": 3, "2": 10}`, 3)
	if s == nil || s[0] != 8 || s[1] != 3 || s[2] != 10 {
		t.Fatalf("clean parse failed: %v", s)
	}
	// Noisy output with surrounding prose still parses.
	s = parseRerankScores("Here are the scores: {\"0\": 5, \"1\": 9}", 2)
	if s == nil || s[1] != 9 {
		t.Fatalf("noisy parse failed: %v", s)
	}
	// Out-of-range indices ignored; unparseable → nil (fail-open).
	if parseRerankScores("no scores here", 3) != nil {
		t.Fatal("expected nil for unparseable output")
	}
}

// TestMaybeRerank_NoRerankerIsPassthrough verifies the pipeline hook is a no-op
// when no reranker is configured (the default).
func TestMaybeRerank_NoRerankerIsPassthrough(t *testing.T) {
	ActiveReranker = nil
	in := []models.SearchResult{{URL: "a"}, {URL: "b"}, {URL: "c"}}
	out := MaybeRerank("q", in)
	if len(out) != 3 || out[0].URL != "a" {
		t.Fatalf("expected passthrough, got %v", out)
	}
}

// TestFindHighlights_RuneOffsets verifies highlight offsets are rune (code-point)
// positions, not byte positions, so multibyte text aligns for JS consumers.
func TestFindHighlights_RuneOffsets(t *testing.T) {
	// "café " is 5 runes but 6 bytes (é = 2 bytes); "menu" starts at rune 5.
	text := "café menu"
	hs := findHighlights(text, []string{"menu"})
	if len(hs) != 1 {
		t.Fatalf("expected 1 highlight, got %d", len(hs))
	}
	if hs[0].Start != 5 || hs[0].End != 9 {
		t.Fatalf("expected rune offsets [5,9], got [%d,%d] (byte offsets would be [6,10])", hs[0].Start, hs[0].End)
	}
}
