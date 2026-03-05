package indexer

import (
	"strings"
	"unicode"
)

// Summarizer provides extractive summarization using a TextRank-inspired algorithm.
// It ranks sentences by their similarity to other sentences in the text,
// producing a concise summary of the most important content.
type Summarizer struct {
	maxSentences int
}

// NewSummarizer creates a summarizer with default settings.
func NewSummarizer() *Summarizer {
	return &Summarizer{maxSentences: 3}
}

// Summarize extracts the most important sentences from text.
func (s *Summarizer) Summarize(text string, maxSentences int) string {
	if maxSentences <= 0 {
		maxSentences = s.maxSentences
	}
	sentences := splitSentences(text)
	if len(sentences) <= maxSentences {
		return text
	}
	return s.rankAndExtract(sentences, "", maxSentences)
}

// SummarizeWithTitle extracts sentences, boosting those related to the title.
func (s *Summarizer) SummarizeWithTitle(text, title string, maxSentences int) string {
	if maxSentences <= 0 {
		maxSentences = s.maxSentences
	}
	sentences := splitSentences(text)
	if len(sentences) <= maxSentences {
		return text
	}
	return s.rankAndExtract(sentences, title, maxSentences)
}

// rankAndExtract implements a simplified TextRank for sentence extraction.
// Each sentence is scored by its word overlap with all other sentences,
// plus an optional title relevance boost.
func (s *Summarizer) rankAndExtract(sentences []string, title string, maxSentences int) string {
	n := len(sentences)
	if n == 0 {
		return ""
	}

	// Tokenize each sentence into word sets
	wordSets := make([]map[string]bool, n)
	for i, sent := range sentences {
		wordSets[i] = tokenizeToSet(sent)
	}

	// Title words for boosting
	titleWords := tokenizeToSet(title)

	// Score each sentence: sum of similarity to all other sentences + title boost + position bonus
	scores := make([]float64, n)
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			if i == j {
				continue
			}
			scores[i] += wordOverlap(wordSets[i], wordSets[j])
		}

		// Title relevance boost
		if len(titleWords) > 0 {
			scores[i] += wordOverlap(wordSets[i], titleWords) * 2.0
		}

		// Position bonus: earlier sentences tend to be more important
		positionBonus := 1.0 / (1.0 + float64(i)*0.1)
		scores[i] *= positionBonus

		// Length penalty: very short sentences are less informative
		wordCount := len(wordSets[i])
		if wordCount < 5 {
			scores[i] *= 0.5
		}
	}

	// Select top-N sentences by score, preserving original order
	type indexedScore struct {
		idx   int
		score float64
	}
	ranked := make([]indexedScore, n)
	for i := range scores {
		ranked[i] = indexedScore{i, scores[i]}
	}

	// Sort by score descending
	for i := 0; i < len(ranked)-1; i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].score > ranked[i].score {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}

	// Take top N indices
	if maxSentences > len(ranked) {
		maxSentences = len(ranked)
	}
	selected := make(map[int]bool, maxSentences)
	for i := 0; i < maxSentences; i++ {
		selected[ranked[i].idx] = true
	}

	// Reconstruct in original order
	var parts []string
	for i, sent := range sentences {
		if selected[i] {
			parts = append(parts, strings.TrimSpace(sent))
		}
	}

	return strings.Join(parts, " ")
}

// splitSentences splits text into sentences using period, exclamation, and question marks.
func splitSentences(text string) []string {
	var sentences []string
	var current strings.Builder

	runes := []rune(text)
	for i := 0; i < len(runes); i++ {
		current.WriteRune(runes[i])

		if runes[i] == '.' || runes[i] == '!' || runes[i] == '?' {
			// Check for abbreviations: if next char is not space/EOL, continue
			if i+1 < len(runes) && !unicode.IsSpace(runes[i+1]) {
				continue
			}
			sent := strings.TrimSpace(current.String())
			if len(sent) > 10 { // skip very short fragments
				sentences = append(sentences, sent)
			}
			current.Reset()
		}
	}

	// Remaining text
	if remaining := strings.TrimSpace(current.String()); len(remaining) > 10 {
		sentences = append(sentences, remaining)
	}

	return sentences
}

// tokenizeToSet splits text into a set of lowercase words, filtering short words.
func tokenizeToSet(text string) map[string]bool {
	set := make(map[string]bool)
	words := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
	for _, w := range words {
		if len(w) > 2 {
			set[w] = true
		}
	}
	return set
}

// wordOverlap computes the normalized word overlap between two word sets.
func wordOverlap(a, b map[string]bool) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	overlap := 0
	for w := range a {
		if b[w] {
			overlap++
		}
	}
	if overlap == 0 {
		return 0
	}
	// Normalize by the log of set sizes to avoid bias toward long sentences
	denom := float64(len(a)) + float64(len(b))
	if denom == 0 {
		return 0
	}
	return float64(overlap) * 2.0 / denom
}
