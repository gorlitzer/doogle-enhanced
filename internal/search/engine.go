package search

import (
	"fmt"

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

	offset := (page - 1) * pageSize
	hits, total, err := e.store.SearchAdvanced(pq, offset, pageSize)
	if err != nil {
		return nil, fmt.Errorf("search: %w", err)
	}

	var results []models.SearchResult
	for _, hit := range hits {
		desc := truncate(hit.Doc.Description, 200)
		if desc == "" {
			desc = truncate(hit.Doc.Content, 200)
		}
		result := models.SearchResult{
			URL:               hit.Doc.URL,
			Title:             hit.Doc.Title,
			Description:       desc,
			Domain:            hit.Doc.Domain,
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
			CrawledAt:         hit.Doc.CrawledAt,
			IsTimeSensitive:   hit.Doc.IsTimeSensitive,
			IsEvergreen:       hit.Doc.IsEvergreen,
		}
		results = append(results, result)
	}

	return &models.SearchResponse{
		Query:    req.Query,
		Results:  results,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
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
