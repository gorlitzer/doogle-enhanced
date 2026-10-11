package search

import (
	"context"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/blevesearch/bleve/v2"
)

// SpellChecker provides "did you mean" suggestions using the index dictionary.
type SpellChecker struct {
	mu         sync.RWMutex
	dictionary map[string]int // term → document frequency
	maxTerms   int
}

// NewSpellChecker creates a spell checker and builds the initial dictionary.
func NewSpellChecker(idx bleve.Index) *SpellChecker {
	sc := &SpellChecker{
		dictionary: make(map[string]int),
		maxTerms:   100000,
	}
	sc.rebuildDictionary(idx)
	return sc
}

// StartRefresh periodically rebuilds the dictionary in the background.
func (sc *SpellChecker) StartRefresh(ctx context.Context, idx bleve.Index, interval time.Duration) {
	if interval <= 0 {
		interval = 30 * time.Minute
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				sc.rebuildDictionary(idx)
			case <-ctx.Done():
				return
			}
		}
	}()
}

// Suggest returns a spelling correction if the query appears misspelled.
func (sc *SpellChecker) Suggest(query string) (string, bool) {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	if len(sc.dictionary) == 0 {
		return "", false
	}

	words := strings.Fields(strings.ToLower(query))
	corrected := false
	result := make([]string, len(words))

	for i, word := range words {
		// Skip short words, numbers, and known words
		if len(word) < 3 || isNumeric(word) {
			result[i] = word
			continue
		}
		if _, known := sc.dictionary[word]; known {
			result[i] = word
			continue
		}

		// Find best candidate
		best := sc.bestCandidate(word)
		if best != "" && best != word {
			result[i] = best
			corrected = true
		} else {
			result[i] = word
		}
	}

	if !corrected {
		return "", false
	}

	return strings.Join(result, " "), true
}

// bestCandidate finds the highest-frequency term within edit distance ≤ 2.
func (sc *SpellChecker) bestCandidate(word string) string {
	type candidate struct {
		term string
		freq int
		dist int
	}

	var candidates []candidate

	// Try edit distance 1 first
	edits1 := edits(word)
	for _, e := range edits1 {
		if freq, ok := sc.dictionary[e]; ok {
			candidates = append(candidates, candidate{e, freq, 1})
		}
	}

	// If no distance-1 matches, try distance 2
	if len(candidates) == 0 {
		for _, e1 := range edits1 {
			for _, e2 := range edits(e1) {
				if freq, ok := sc.dictionary[e2]; ok {
					candidates = append(candidates, candidate{e2, freq, 2})
				}
			}
		}
	}

	if len(candidates) == 0 {
		return ""
	}

	// Sort: prefer distance 1, then highest frequency
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].dist != candidates[j].dist {
			return candidates[i].dist < candidates[j].dist
		}
		return candidates[i].freq > candidates[j].freq
	})

	return candidates[0].term
}

// edits generates all strings within Damerau-Levenshtein distance 1.
func edits(word string) []string {
	runes := []rune(word)
	n := len(runes)
	seen := make(map[string]bool)
	var results []string

	add := func(s string) {
		if !seen[s] && len(s) >= 2 {
			seen[s] = true
			results = append(results, s)
		}
	}

	alphabet := "abcdefghijklmnopqrstuvwxyz"

	// Deletes
	for i := 0; i < n; i++ {
		add(string(runes[:i]) + string(runes[i+1:]))
	}

	// Transposes
	for i := 0; i < n-1; i++ {
		transposed := make([]rune, n)
		copy(transposed, runes)
		transposed[i], transposed[i+1] = transposed[i+1], transposed[i]
		add(string(transposed))
	}

	// Replaces
	for i := 0; i < n; i++ {
		for _, c := range alphabet {
			if c != runes[i] {
				add(string(runes[:i]) + string(c) + string(runes[i+1:]))
			}
		}
	}

	// Inserts
	for i := 0; i <= n; i++ {
		for _, c := range alphabet {
			add(string(runes[:i]) + string(c) + string(runes[i:]))
		}
	}

	return results
}

// rebuildDictionary extracts term frequencies from the Bleve index.
func (sc *SpellChecker) rebuildDictionary(idx bleve.Index) {
	start := time.Now()
	dict := make(map[string]int, sc.maxTerms)

	// Use the "content" field dictionary — it has the broadest term coverage
	for _, field := range []string{"content", "title"} {
		fieldDict, err := idx.FieldDict(field)
		if err != nil {
			log.Printf("spellcheck: field dict error for %s: %v", field, err)
			continue
		}
		for {
			entry, err := fieldDict.Next()
			if err != nil || entry == nil {
				break
			}
			term := entry.Term
			// Skip very short terms, numbers, and terms with special chars
			if len(term) < 3 || isNumeric(term) || !isAlpha(term) {
				continue
			}
			dict[term] += int(entry.Count)
			if len(dict) >= sc.maxTerms {
				break
			}
		}
		fieldDict.Close()
	}

	sc.mu.Lock()
	sc.dictionary = dict
	sc.mu.Unlock()

	log.Printf("spellcheck: rebuilt dictionary with %d terms in %dms", len(dict), time.Since(start).Milliseconds())
}

func isNumeric(s string) bool {
	for _, r := range s {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

func isAlpha(s string) bool {
	for _, r := range s {
		if !unicode.IsLetter(r) {
			return false
		}
	}
	return true
}
