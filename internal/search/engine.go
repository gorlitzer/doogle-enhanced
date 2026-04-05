package search

import (
	"fmt"
	"strings"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

// Engine performs local searches against the Bleve index.
type Engine struct {
	store              index.Store
	spellChecker       *SpellChecker
	hybridSearcher     *index.HybridSearcher
	entityStore        *store.EntityStore
	clusterComputer    ClusterProvider
	QuarantinedPeersFn func() []string
	DocQuarantineFn    func(docID string) (quarantined bool, reason string)
}

// ClusterProvider provides related topic labels for search results.
type ClusterProvider interface {
	RelatedTopics(docIDs []string, limit int) []string
}

// NewEngine creates a local search engine.
func NewEngine(store index.Store) *Engine {
	return &Engine{store: store}
}

// SetSpellChecker attaches a spell checker to the engine.
func (e *Engine) SetSpellChecker(sc *SpellChecker) {
	e.spellChecker = sc
}

// SetHybridSearcher enables hybrid BM25+vector search.
func (e *Engine) SetHybridSearcher(hs *index.HybridSearcher) {
	e.hybridSearcher = hs
}

// SetEntityStore enables entity card detection.
func (e *Engine) SetEntityStore(es *store.EntityStore) {
	e.entityStore = es
}

// SetClusterComputer enables related topic suggestions.
func (e *Engine) SetClusterComputer(cc ClusterProvider) {
	e.clusterComputer = cc
}

// Search performs a local search and returns results.
func (e *Engine) Search(req *models.SearchRequest) (*models.SearchResponse, error) {
	pq := ParseQuery(req.Query)
	if pq.CleanedQuery == "" && len(pq.Phrases) == 0 {
		return &models.SearchResponse{Query: req.Query}, nil
	}

	// Expand synonyms
	pq.Synonyms = ExpandQuery(pq)

	// Auto-exclude quarantined peers from results
	if e.QuarantinedPeersFn != nil {
		pq.ExcludePeers = append(pq.ExcludePeers, e.QuarantinedPeersFn()...)
	}

	// Classify intent
	intent := ClassifyIntent(pq)

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
	fetchSize := pageSize * 5
	if fetchSize < 100 {
		fetchSize = 100
	}
	offset := (page - 1) * pageSize

	// Choose search backend: hybrid (BM25+vector) or BM25-only
	searchMode := "bm25"
	var hits []index.SearchHit
	var total int
	var err error

	if e.hybridSearcher != nil && e.hybridSearcher.Available() {
		hits, total, err = e.hybridSearcher.Search(pq, 0, fetchSize)
		searchMode = "hybrid"
	} else {
		hits, total, err = e.store.SearchAdvanced(pq, 0, fetchSize)
	}
	if err != nil {
		return nil, fmt.Errorf("search: %w", err)
	}

	// Query relaxation: if AND returned 0 results and we have 2+ terms,
	// retry with OR semantics so at least partial matches surface.
	if total == 0 && len(pq.Terms) >= 2 {
		relaxed := *pq
		relaxed.UseOR = true
		if e.hybridSearcher != nil && e.hybridSearcher.Available() {
			hits, total, err = e.hybridSearcher.Search(&relaxed, 0, fetchSize)
		} else {
			hits, total, err = e.store.SearchAdvanced(&relaxed, 0, fetchSize)
		}
		if err != nil {
			return nil, fmt.Errorf("search relaxed: %w", err)
		}
	}

	var results []models.SearchResult
	for _, hit := range hits {
		// Use passage-based snippet extraction with highlights
		snippet := ExtractSnippet(hit.Doc.Content, pq.Terms, 280)
		desc := snippet.Text
		if desc == "" {
			desc = truncate(hit.Doc.Description, 280)
		}
		if desc == "" && hit.Doc.Summary != "" {
			desc = truncate(hit.Doc.Summary, 280)
		}
		if desc == "" {
			desc = truncate(hit.Doc.Content, 280)
		}

		result := models.SearchResult{
			URL:                  hit.Doc.URL,
			Title:                hit.Doc.Title,
			Description:          desc,
			Domain:               hit.Doc.Domain,
			Language:             hit.Doc.Language,
			Country:              hit.Doc.Country,
			Score:                hit.Score,
			OriginPeerID:         hit.Doc.OriginPeerID,
			PageRankScore:        hit.Doc.PageRankScore,
			EEATScore:            hit.Doc.EEATScore,
			QualityScore:         hit.Doc.QualityScore,
			SpamScore:            hit.Doc.SpamScore,
			LinkScore:            hit.Doc.LinkScore,
			SEOScore:             hit.Doc.SEOScore,
			ReadabilityScore:     hit.Doc.ReadabilityScore,
			CitationScore:        hit.Doc.CitationScore,
			FreshnessScore:       hit.Doc.FreshnessScore,
			AuthorCredibility:    hit.Doc.AuthorCredibility,
			RelevanceScore:       hit.Doc.RelevanceScore,
			StaticScore:          hit.Doc.StaticScore,
			DomainAuthorityScore: hit.Doc.DomainAuthorityScore,
			URLQualityScore:      hit.Doc.URLQualityScore,
			CrawledAt:            hit.Doc.CrawledAt,
			IsTimeSensitive:      hit.Doc.IsTimeSensitive,
			IsEvergreen:          hit.Doc.IsEvergreen,
			PerfScore:            hit.Doc.PerfScore,
			MobileScore:          hit.Doc.MobileScore,
			SchemaType:           hit.Doc.SchemaType,
			StructuredData:       hit.Doc.StructuredData,
		}
		// Check document-level quarantine (24h voting window)
		if e.DocQuarantineFn != nil {
			if q, reason := e.DocQuarantineFn(hit.Doc.ID); q {
				result.Quarantined = true
				result.QuarantineReason = reason
			}
		}
		results = append(results, result)
	}

	// Re-rank with intent awareness
	RerankWithIntent(results, &intent)

	// Paginate after re-ranking
	if offset >= len(results) {
		results = nil
	} else if offset+pageSize >= len(results) {
		results = results[offset:]
	} else {
		results = results[offset : offset+pageSize]
	}

	resp := &models.SearchResponse{
		Query:      req.Query,
		Results:    results,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		Intent:     intent.Type.String(),
		SearchMode: searchMode,
	}

	// Spelling suggestion
	if e.spellChecker != nil {
		if suggestion, ok := e.spellChecker.Suggest(req.Query); ok {
			resp.Suggestion = suggestion
		}
	}

	// Entity card detection
	if e.entityStore != nil {
		if card := DetectEntityCard(req.Query, e.entityStore); card != nil {
			resp.EntityCard = card
		}
	}

	// Related topics from clustering
	if e.clusterComputer != nil && len(results) > 0 {
		docIDs := make([]string, 0, len(results))
		for _, r := range results {
			if id := models.DocumentID(r.URL); id != "" {
				docIDs = append(docIDs, id)
			}
		}
		if topics := e.clusterComputer.RelatedTopics(docIDs, 5); len(topics) > 0 {
			resp.RelatedTopics = topics
		}
	}

	// Instant answers / featured snippets
	if instant := DetectInstantAnswer(req.Query); instant != nil {
		resp.FeaturedSnippet = instant
	} else if len(results) > 0 {
		if featured := ExtractFeaturedSnippet(req.Query, results, &intent); featured != nil {
			resp.FeaturedSnippet = featured
		}
	}

	// Related searches: synonym-based reformulations + related topics
	resp.RelatedSearches = GenerateRelatedSearches(pq, resp.RelatedTopics)

	return resp, nil
}

// extractSnippet finds the best passage in content that contains the most query terms.
// Returns a ~maxLen character window around the best match, or "" if no terms found.
// Deprecated: use ExtractSnippet from snippets.go instead. Kept for backward compat.
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
