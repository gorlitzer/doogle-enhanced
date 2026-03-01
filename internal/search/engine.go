package search

import (
	"fmt"
	"strings"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
)

// Engine performs local searches against the Bleve index.
type Engine struct {
	store index.Store
}

// NewEngine creates a local search engine.
func NewEngine(store index.Store) *Engine {
	return &Engine{store: store}
}

// Search performs a local search and returns results.
func (e *Engine) Search(req *models.SearchRequest) (*models.SearchResponse, error) {
	pq := ParseQuery(req.Query)
	if pq.CleanedQuery == "" && len(pq.Phrases) == 0 {
		return &models.SearchResponse{Query: req.Query}, nil
	}

	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 10
	}
	if pageSize > 50 {
		pageSize = 50
	}

	// Over-fetch from Bleve so re-ranking can re-order across a wider pool.
	// We fetch up to 100 results from offset 0 and paginate after re-ranking.
	fetchSize := pageSize * 5
	if fetchSize < 100 {
		fetchSize = 100
	}
	offset := (page - 1) * pageSize

	hits, total, err := e.store.SearchAdvanced(pq, 0, fetchSize)
	if err != nil {
		return nil, fmt.Errorf("search: %w", err)
	}

	var results []models.SearchResult
	for _, hit := range hits {
		desc := extractSnippet(hit.Doc.Content, pq.Terms, 200)
		if desc == "" {
			desc = truncate(hit.Doc.Description, 200)
		}
		if desc == "" {
			desc = truncate(hit.Doc.Content, 200)
		}
		result := models.SearchResult{
			URL:               hit.Doc.URL,
			Title:             hit.Doc.Title,
			Description:       desc,
			Domain:            hit.Doc.Domain,
			Language:          hit.Doc.Language,
			Score:             hit.Score,
			PageRankScore:     hit.Doc.PageRankScore,
			EEATScore:         hit.Doc.EEATScore,
			QualityScore:      hit.Doc.QualityScore,
			SpamScore:         hit.Doc.SpamScore,
			LinkScore:         hit.Doc.LinkScore,
			SEOScore:          hit.Doc.SEOScore,
			ReadabilityScore:  hit.Doc.ReadabilityScore,
			CitationScore:     hit.Doc.CitationScore,
			FreshnessScore:    hit.Doc.FreshnessScore,
			AuthorCredibility: hit.Doc.AuthorCredibility,
			RelevanceScore:    hit.Doc.RelevanceScore,
			StaticScore:       hit.Doc.StaticScore,
			CrawledAt:         hit.Doc.CrawledAt,
			IsTimeSensitive:   hit.Doc.IsTimeSensitive,
			IsEvergreen:       hit.Doc.IsEvergreen,
		}
		results = append(results, result)
	}

	// Paginate after caller re-ranks
	if offset >= len(results) {
		results = nil
	} else if offset+pageSize >= len(results) {
		results = results[offset:]
	} else {
		results = results[offset : offset+pageSize]
	}

	return &models.SearchResponse{
		Query:    req.Query,
		Results:  results,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

// extractSnippet finds the best passage in content that contains the most query terms.
// Returns a ~maxLen character window around the best match, or "" if no terms found.
func extractSnippet(content string, terms []string, maxLen int) string {
	if content == "" || len(terms) == 0 {
		return ""
	}

	lower := strings.ToLower(content)
	lowerTerms := make([]string, len(terms))
	for i, t := range terms {
		lowerTerms[i] = strings.ToLower(t)
	}

	// Slide a window across the content to find the region with the most term hits.
	bestPos := -1
	bestCount := 0

	// Step through the content in chunks, scoring each window
	step := 40
	halfWindow := maxLen / 2
	for pos := 0; pos < len(lower); pos += step {
		start := pos
		end := pos + maxLen
		if end > len(lower) {
			end = len(lower)
		}
		window := lower[start:end]

		count := 0
		for _, t := range lowerTerms {
			if strings.Contains(window, t) {
				count++
			}
		}
		if count > bestCount {
			bestCount = count
			bestPos = start
		}
		if bestCount == len(lowerTerms) {
			break // all terms found, good enough
		}
	}

	if bestCount == 0 {
		return ""
	}

	// Extract the window, aligning to word boundaries
	start := bestPos
	end := bestPos + maxLen
	if end > len(content) {
		end = len(content)
	}

	// Adjust start to not cut a word
	prefix := ""
	if start > 0 {
		for start < end && content[start] != ' ' {
			start++
		}
		start++ // skip the space
		prefix = "..."
	}

	// Adjust end to not cut a word
	suffix := ""
	if end < len(content) {
		for end > start && content[end-1] != ' ' {
			end--
		}
		suffix = "..."
	}

	if start >= end {
		return ""
	}

	_ = halfWindow // reserved for future centering logic
	return prefix + strings.TrimSpace(content[start:end]) + suffix
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	// Find last space before maxLen
	for i := maxLen; i > maxLen-20 && i > 0; i-- {
		if s[i] == ' ' {
			return s[:i] + "..."
		}
	}
	return s[:maxLen] + "..."
}
