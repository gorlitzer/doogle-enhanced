package index

import (
	"strings"
	"time"

	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/search/query"

	"github.com/doogle/doogle-v2/internal/models"
)

// newAndMatchQuery creates a MatchQuery that requires ALL terms to match (AND).
func newAndMatchQuery(terms string, field string, boost float64) *query.MatchQuery {
	q := bleve.NewMatchQuery(terms)
	q.SetField(field)
	q.SetBoost(boost)
	q.SetOperator(query.MatchQueryOperatorAnd)
	return q
}

// newAndMatchQueryWithAnalyzer creates an AND MatchQuery with a specific analyzer.
func newAndMatchQueryWithAnalyzer(terms string, field string, boost float64, analyzer string) *query.MatchQuery {
	q := newAndMatchQuery(terms, field, boost)
	q.Analyzer = analyzer
	return q
}

// BuildQuery translates a ParsedQuery into a Bleve query tree.
//
// Architecture: BooleanQuery with two tiers:
//   - Must: primary AND matches across fields + phrase matches.
//     A doc MUST match at least one field with ALL query terms.
//   - Should: fuzzy + synonym queries that BOOST matching docs
//     but cannot produce results on their own.
func BuildQuery(pq *models.ParsedQuery) query.Query {
	var primaryClauses []query.Query
	var boostClauses []query.Query

	// Resolve language-specific analyzer
	langAnalyzer := LangAnalyzer(pq.Language)

	// ── Primary tier: AND match across fields ──
	termStr := strings.Join(pq.Terms, " ")
	if termStr != "" {
		if langAnalyzer != "" {
			primaryClauses = append(primaryClauses,
				newAndMatchQueryWithAnalyzer(termStr, "title", 5.0, langAnalyzer),
				newAndMatchQueryWithAnalyzer(termStr, "url_text", 3.0, langAnalyzer),
				newAndMatchQueryWithAnalyzer(termStr, "headings_text", 2.0, langAnalyzer),
				newAndMatchQueryWithAnalyzer(termStr, "description", 1.5, langAnalyzer),
				newAndMatchQueryWithAnalyzer(termStr, "content", 1.0, langAnalyzer),
				newAndMatchQueryWithAnalyzer(termStr, "anchor_text", 2.0, langAnalyzer),
			)
		} else {
			primaryClauses = append(primaryClauses,
				newAndMatchQuery(termStr, "title", 5.0),
				newAndMatchQuery(termStr, "url_text", 3.0),
				newAndMatchQuery(termStr, "headings_text", 2.0),
				newAndMatchQuery(termStr, "description", 1.5),
				newAndMatchQuery(termStr, "content", 1.0),
				newAndMatchQuery(termStr, "anchor_text", 2.0),
			)
		}

		// Auto phrase boost: when query has 2+ terms, add a phrase match
		// so pages where terms appear together rank much higher.
		if len(pq.Terms) >= 2 {
			titlePhrase := bleve.NewMatchPhraseQuery(termStr)
			titlePhrase.SetField("title")
			titlePhrase.SetBoost(8.0)

			descPhrase := bleve.NewMatchPhraseQuery(termStr)
			descPhrase.SetField("description")
			descPhrase.SetBoost(4.0)

			contentPhrase := bleve.NewMatchPhraseQuery(termStr)
			contentPhrase.SetField("content")
			contentPhrase.SetBoost(3.0)

			boostClauses = append(boostClauses, titlePhrase, descPhrase, contentPhrase)
		}
	}

	// Explicit quoted phrases — also primary (high signal)
	for _, phrase := range pq.Phrases {
		titlePQ := bleve.NewMatchPhraseQuery(phrase)
		titlePQ.SetField("title")
		titlePQ.SetBoost(10.0)

		contentPQ := bleve.NewMatchPhraseQuery(phrase)
		contentPQ.SetField("content")
		contentPQ.SetBoost(6.0)

		primaryClauses = append(primaryClauses, titlePQ, contentPQ)
	}

	// ── Boost tier: fuzzy + synonyms (cannot produce results alone) ──
	if pq.UseFuzzy {
		for _, term := range pq.Terms {
			if len(term) < 4 {
				continue
			}
			fuzziness := 1
			if len(term) >= 6 {
				fuzziness = 2
			}
			fq := bleve.NewFuzzyQuery(term)
			fq.SetField("content")
			fq.SetBoost(0.5)
			fq.SetFuzziness(fuzziness)
			boostClauses = append(boostClauses, fq)
		}
	}

	// Synonym expansion: add as low-boost disjunction queries
	if pq.Synonyms != nil {
		for _, syn := range pq.Synonyms {
			synTitle := bleve.NewMatchQuery(syn)
			synTitle.SetField("title")
			synTitle.SetBoost(0.3)
			synContent := bleve.NewMatchQuery(syn)
			synContent.SetField("content")
			synContent.SetBoost(0.2)
			boostClauses = append(boostClauses, synTitle, synContent)
		}
	}

	// If no primary clauses, fall back to a simple query
	if len(primaryClauses) == 0 {
		if pq.CleanedQuery != "" {
			return bleve.NewMatchQuery(pq.CleanedQuery)
		}
		return bleve.NewMatchAllQuery()
	}

	// Primary clauses as a disjunction (match on ANY field, but each field requires AND)
	primaryQ := bleve.NewDisjunctionQuery(primaryClauses...)

	// Build the final query
	boolQ := bleve.NewBooleanQuery()
	boolQ.AddMust(primaryQ)

	// Add boost clauses as Should (only boost score, can't produce results alone)
	for _, bc := range boostClauses {
		boolQ.AddShould(bc)
	}

	// Exclude terms (NOT / -term): MustNot across all text fields
	for _, term := range pq.ExcludeTerms {
		excludeTitle := bleve.NewMatchQuery(term)
		excludeTitle.SetField("title")
		excludeDesc := bleve.NewMatchQuery(term)
		excludeDesc.SetField("description")
		excludeContent := bleve.NewMatchQuery(term)
		excludeContent.SetField("content")
		excludeQ := bleve.NewDisjunctionQuery(excludeTitle, excludeDesc, excludeContent)
		boolQ.AddMustNot(excludeQ)
	}

	// OR groups: each group becomes a Must(Disjunction min=1)
	for _, group := range pq.OrGroups {
		var orClauses []query.Query
		for _, term := range group {
			titleQ := bleve.NewMatchQuery(term)
			titleQ.SetField("title")
			titleQ.SetBoost(3.0)
			contentQ := bleve.NewMatchQuery(term)
			contentQ.SetField("content")
			descQ := bleve.NewMatchQuery(term)
			descQ.SetField("description")
			descQ.SetBoost(1.5)
			orClauses = append(orClauses, titleQ, contentQ, descQ)
		}
		orQ := bleve.NewDisjunctionQuery(orClauses...)
		orQ.SetMin(1)
		boolQ.AddMust(orQ)
	}

	// Site filter: add domain as an additional Must
	if pq.SiteDomain != "" {
		siteQ := bleve.NewTermQuery(pq.SiteDomain)
		siteQ.SetField("domain")
		boolQ.AddMust(siteQ)
	}

	// Language filter: restrict to specific language
	if pq.Language != "" {
		langQ := bleve.NewTermQuery(pq.Language)
		langQ.SetField("language")
		boolQ.AddMust(langQ)
	}

	// ── Search dorks ──

	// intitle: restrict to title field
	if pq.InTitle != "" {
		q := newAndMatchQuery(pq.InTitle, "title", 5.0)
		boolQ.AddMust(q)
	}

	// inurl: wildcard match on URL
	if pq.InURL != "" {
		q := bleve.NewWildcardQuery("*" + pq.InURL + "*")
		q.SetField("url")
		boolQ.AddMust(q)
	}

	// intext: restrict to content/body field
	if pq.InText != "" {
		q := newAndMatchQuery(pq.InText, "content", 2.0)
		boolQ.AddMust(q)
	}

	// filetype: wildcard match on URL for file extension
	if len(pq.FileTypes) > 0 {
		var ftClauses []query.Query
		for _, ext := range pq.FileTypes {
			q := bleve.NewWildcardQuery("*." + ext)
			q.SetField("url")
			ftClauses = append(ftClauses, q)
		}
		ftQ := bleve.NewDisjunctionQuery(ftClauses...)
		ftQ.SetMin(1)
		boolQ.AddMust(ftQ)
	}

	// before:/after: date range on crawled_at (stored as Unix nanoseconds)
	if pq.Before != "" || pq.After != "" {
		var minFloat, maxFloat *float64
		if pq.After != "" {
			if t, err := time.Parse("2006-01-02", pq.After); err == nil {
				v := float64(t.UnixNano())
				minFloat = &v
			}
		}
		if pq.Before != "" {
			if t, err := time.Parse("2006-01-02", pq.Before); err == nil {
				v := float64(t.UnixNano())
				maxFloat = &v
			}
		}
		if minFloat != nil || maxFloat != nil {
			inclusive := true
			dateQ := bleve.NewNumericRangeInclusiveQuery(minFloat, maxFloat, &inclusive, &inclusive)
			dateQ.SetField("crawled_at")
			boolQ.AddMust(dateQ)
		}
	}

	// has:https — restrict to HTTPS pages
	if pq.HasHTTPS {
		httpsQ := bleve.NewBoolFieldQuery(true)
		httpsQ.SetField("is_https")
		boolQ.AddMust(httpsQ)
	}

	return boolQ
}
