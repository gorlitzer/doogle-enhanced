package index

import (
	"strings"

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

	// ── Primary tier: AND match across fields ──
	termStr := strings.Join(pq.Terms, " ")
	if termStr != "" {
		primaryClauses = append(primaryClauses,
			newAndMatchQuery(termStr, "title", 3.0),
			newAndMatchQuery(termStr, "description", 1.5),
			newAndMatchQuery(termStr, "content", 1.0),
			newAndMatchQuery(termStr, "anchor_text", 2.0),
		)

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

	for _, syns := range pq.Synonyms {
		synStr := strings.Join(syns, " ")
		titleSyn := bleve.NewMatchQuery(synStr)
		titleSyn.SetField("title")
		titleSyn.SetBoost(1.5)

		contentSyn := bleve.NewMatchQuery(synStr)
		contentSyn.SetField("content")
		contentSyn.SetBoost(0.7)

		boostClauses = append(boostClauses, titleSyn, contentSyn)
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

	return boolQ
}
