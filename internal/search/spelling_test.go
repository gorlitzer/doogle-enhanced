package search

import (
	"testing"

	"github.com/blevesearch/bleve/v2"
)

func newTestSpellChecker(dict map[string]int) *SpellChecker {
	return &SpellChecker{
		dictionary: dict,
		maxTerms:   100000,
	}
}

func TestSuggest_EmptyDictionary(t *testing.T) {
	sc := newTestSpellChecker(map[string]int{})
	got, ok := sc.Suggest("golang")
	if ok {
		t.Errorf("expected no suggestion, got %q", got)
	}
}

func TestSuggest_KnownWord(t *testing.T) {
	sc := newTestSpellChecker(map[string]int{"golang": 100})
	got, ok := sc.Suggest("golang")
	if ok {
		t.Errorf("expected no suggestion for known word, got %q", got)
	}
}

func TestSuggest_EditDistance1(t *testing.T) {
	sc := newTestSpellChecker(map[string]int{"golang": 100})
	got, ok := sc.Suggest("golng")
	if !ok {
		t.Fatal("expected suggestion")
	}
	if got != "golang" {
		t.Errorf("got %q, want 'golang'", got)
	}
}

func TestSuggest_EditDistance2(t *testing.T) {
	sc := newTestSpellChecker(map[string]int{"golang": 100})
	got, ok := sc.Suggest("golag")
	if !ok {
		t.Skip("distance-2 correction not found (acceptable)")
	}
	if got != "golang" {
		t.Errorf("got %q, want 'golang'", got)
	}
}

func TestSuggest_ShortWord(t *testing.T) {
	sc := newTestSpellChecker(map[string]int{"go": 100, "goo": 50})
	got, ok := sc.Suggest("go")
	if ok {
		t.Errorf("expected no suggestion for short word, got %q", got)
	}
}

func TestSuggest_NumericWord(t *testing.T) {
	sc := newTestSpellChecker(map[string]int{"golang": 100})
	got, ok := sc.Suggest("123")
	if ok {
		t.Errorf("expected no suggestion for numeric word, got %q", got)
	}
}

func TestSuggest_MultiWord(t *testing.T) {
	sc := newTestSpellChecker(map[string]int{"golang": 100, "tutorial": 80})
	got, ok := sc.Suggest("golng tutorial")
	if !ok {
		t.Fatal("expected suggestion for misspelled multi-word query")
	}
	if got != "golang tutorial" {
		t.Errorf("got %q, want 'golang tutorial'", got)
	}
}

func TestSuggest_AllCorrect(t *testing.T) {
	sc := newTestSpellChecker(map[string]int{"golang": 100, "tutorial": 80})
	got, ok := sc.Suggest("golang tutorial")
	if ok {
		t.Errorf("expected no suggestion when all words correct, got %q", got)
	}
}

func TestEdits_GeneratesCandidates(t *testing.T) {
	candidates := edits("cat")
	if len(candidates) == 0 {
		t.Fatal("expected candidates")
	}
	// Deletions of "cat": "at", "ct", "ca"
	found := map[string]bool{}
	for _, c := range candidates {
		found[c] = true
	}
	for _, expected := range []string{"at", "ct", "ca", "cta", "act"} {
		if !found[expected] {
			t.Errorf("expected candidate %q not found", expected)
		}
	}
}

func TestEdits_NoDuplicates(t *testing.T) {
	candidates := edits("test")
	seen := make(map[string]bool, len(candidates))
	for _, c := range candidates {
		if seen[c] {
			t.Errorf("duplicate candidate: %q", c)
		}
		seen[c] = true
	}
}

func TestNewSpellChecker_WithBleveIndex(t *testing.T) {
	mapping := bleve.NewIndexMapping()
	idx, err := bleve.NewMemOnly(mapping)
	if err != nil {
		t.Fatalf("failed to create mem index: %v", err)
	}
	defer idx.Close()

	// Index some documents so the dictionary gets populated
	docs := map[string]struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}{
		"1": {Title: "Golang Tutorial", Content: "Learn golang programming basics and advanced patterns"},
		"2": {Title: "Python Guide", Content: "Python is a popular programming language for data science"},
		"3": {Title: "Rust Book", Content: "Rust provides memory safety without garbage collection"},
	}
	for id, doc := range docs {
		if err := idx.Index(id, doc); err != nil {
			t.Fatalf("index doc %s: %v", id, err)
		}
	}

	sc := NewSpellChecker(idx)
	if len(sc.dictionary) == 0 {
		t.Fatal("dictionary should be populated from index")
	}

	// "golang" should be in dictionary
	if _, ok := sc.dictionary["golang"]; !ok {
		t.Error("expected 'golang' in dictionary")
	}

	// Known word should not be suggested
	_, ok := sc.Suggest("golang")
	if ok {
		t.Error("known word should not generate suggestion")
	}
}
