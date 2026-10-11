package search

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// Snippet holds an extracted passage with highlight positions.
type Snippet struct {
	Text       string      `json:"text"`
	Highlights []Highlight `json:"highlights,omitempty"`
}

// Highlight marks a query term position within the snippet text.
type Highlight struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

// ExtractSnippet finds the best passage in body containing query terms,
// with sentence-level granularity and highlight positions.
func ExtractSnippet(body string, queryTerms []string, maxLen int) Snippet {
	if body == "" || len(queryTerms) == 0 {
		return Snippet{}
	}
	if maxLen <= 0 {
		maxLen = 280
	}

	lowerTerms := make([]string, len(queryTerms))
	for i, t := range queryTerms {
		lowerTerms[i] = strings.ToLower(t)
	}

	sentences := splitSentences(body)
	if len(sentences) == 0 {
		return Snippet{}
	}

	// Score each sentence by unique query term coverage + proximity bonus
	bestIdx := -1
	bestScore := -1

	for i, sent := range sentences {
		lower := strings.ToLower(sent)
		uniqueHits := 0
		for _, t := range lowerTerms {
			if strings.Contains(lower, t) {
				uniqueHits++
			}
		}
		if uniqueHits == 0 {
			continue
		}

		// Proximity bonus: if multiple terms appear close together
		score := uniqueHits * 10
		if uniqueHits >= 2 {
			score += proximityBonus(lower, lowerTerms)
		}

		if score > bestScore {
			bestScore = score
			bestIdx = i
		}
	}

	if bestIdx < 0 {
		// Fallback: first sentence containing any query term
		for i, sent := range sentences {
			lower := strings.ToLower(sent)
			for _, t := range lowerTerms {
				if strings.Contains(lower, t) {
					bestIdx = i
					break
				}
			}
			if bestIdx >= 0 {
				break
			}
		}
	}

	if bestIdx < 0 {
		return Snippet{}
	}

	// Build snippet text from best sentence (and adjacent if short)
	text := sentences[bestIdx]
	if len(text) < maxLen && bestIdx+1 < len(sentences) {
		next := sentences[bestIdx+1]
		if len(text)+len(next)+1 <= maxLen {
			text = text + " " + next
		}
	}

	// Truncate if still too long
	if len(text) > maxLen {
		text = truncateAtWord(text, maxLen)
	}

	// Find highlight positions
	highlights := findHighlights(text, lowerTerms)

	return Snippet{Text: text, Highlights: highlights}
}

// splitSentences splits text into sentences using common delimiters.
func splitSentences(text string) []string {
	var sentences []string
	var current strings.Builder

	runes := []rune(text)
	for i := 0; i < len(runes); i++ {
		current.WriteRune(runes[i])

		// End of sentence: period, exclamation, or question mark followed by space or EOF
		if runes[i] == '.' || runes[i] == '!' || runes[i] == '?' {
			if i+1 >= len(runes) || unicode.IsSpace(runes[i+1]) {
				sent := strings.TrimSpace(current.String())
				if len(sent) > 10 { // skip tiny fragments
					sentences = append(sentences, sent)
				}
				current.Reset()
			}
		}
	}

	// Remaining text
	if remaining := strings.TrimSpace(current.String()); len(remaining) > 10 {
		sentences = append(sentences, remaining)
	}

	return sentences
}

// proximityBonus gives a score bonus when query terms appear close together.
func proximityBonus(lowerText string, terms []string) int {
	// Find first occurrence of each term
	positions := make([]int, 0, len(terms))
	for _, t := range terms {
		pos := strings.Index(lowerText, t)
		if pos >= 0 {
			positions = append(positions, pos)
		}
	}
	if len(positions) < 2 {
		return 0
	}

	// Compute min span
	minPos, maxPos := positions[0], positions[0]
	for _, p := range positions[1:] {
		if p < minPos {
			minPos = p
		}
		if p > maxPos {
			maxPos = p
		}
	}

	span := maxPos - minPos
	if span < 50 {
		return 5
	}
	if span < 100 {
		return 3
	}
	if span < 200 {
		return 1
	}
	return 0
}

// findHighlights locates all query term occurrences in text.
func findHighlights(text string, lowerTerms []string) []Highlight {
	lower := strings.ToLower(text)
	var highlights []Highlight

	for _, term := range lowerTerms {
		start := 0
		for {
			idx := strings.Index(lower[start:], term)
			if idx < 0 {
				break
			}
			absStart := start + idx
			absEnd := absStart + len(term)
			// Emit rune (code-point) offsets, not byte offsets, so consumers that
			// index by code point (e.g. JavaScript strings) align correctly on
			// text containing multibyte UTF-8 characters.
			highlights = append(highlights, Highlight{
				Start: utf8.RuneCountInString(text[:absStart]),
				End:   utf8.RuneCountInString(text[:absEnd]),
			})
			start = absEnd
		}
	}

	return highlights
}

// truncateAtWord truncates text at a word boundary near maxLen.
func truncateAtWord(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	// Find last space before maxLen
	for i := maxLen; i > maxLen-30 && i > 0; i-- {
		if s[i] == ' ' {
			return s[:i] + "..."
		}
	}
	return s[:maxLen] + "..."
}
