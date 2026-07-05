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
