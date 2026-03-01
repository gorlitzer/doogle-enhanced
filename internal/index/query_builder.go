package index

import (
	"strings"

	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/search/query"

	"github.com/doogle/doogle-v2/internal/models"
)

// BuildQuery translates a ParsedQuery into a Bleve query tree.
func BuildQuery(pq *models.ParsedQuery) query.Query {
	var shouldClauses []query.Query

	// Main terms — search across title, desc, content, anchor_text
	termStr := strings.Join(pq.Terms, " ")
	if termStr != "" {
		titleQ := bleve.NewMatchQuery(termStr)
		titleQ.SetField("title")
		titleQ.SetBoost(3.0)

		descQ := bleve.NewMatchQuery(termStr)
		descQ.SetField("description")
		descQ.SetBoost(1.5)

		contentQ := bleve.NewMatchQuery(termStr)
		contentQ.SetField("content")
		contentQ.SetBoost(1.0)

		anchorQ := bleve.NewMatchQuery(termStr)
		anchorQ.SetField("anchor_text")
		anchorQ.SetBoost(2.0)

		shouldClauses = append(shouldClauses, titleQ, descQ, contentQ, anchorQ)
	}

	// Exact phrases — high boost on title and content
	for _, phrase := range pq.Phrases {
		titlePQ := bleve.NewMatchPhraseQuery(phrase)
		titlePQ.SetField("title")
		titlePQ.SetBoost(5.0)

		contentPQ := bleve.NewMatchPhraseQuery(phrase)
		contentPQ.SetField("content")
		contentPQ.SetBoost(4.0)

		shouldClauses = append(shouldClauses, titlePQ, contentPQ)
	}

	// Fuzzy queries for terms ≥ 4 chars
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
			shouldClauses = append(shouldClauses, fq)
		}
	}

	// Synonym expansion
	for _, syns := range pq.Synonyms {
		synStr := strings.Join(syns, " ")
		titleSyn := bleve.NewMatchQuery(synStr)
		titleSyn.SetField("title")
		titleSyn.SetBoost(1.5)

		contentSyn := bleve.NewMatchQuery(synStr)
		contentSyn.SetField("content")
		contentSyn.SetBoost(0.7)

		shouldClauses = append(shouldClauses, titleSyn, contentSyn)
	}

	// If no clauses were generated, fall back to a simple query
	if len(shouldClauses) == 0 {
		if pq.CleanedQuery != "" {
			return bleve.NewMatchQuery(pq.CleanedQuery)
		}
		return bleve.NewMatchAllQuery()
	}

	// Site filter: wrap in BooleanQuery with must + should
	if pq.SiteDomain != "" {
		siteQ := bleve.NewTermQuery(pq.SiteDomain)
		siteQ.SetField("domain")

		shouldDisjunction := bleve.NewDisjunctionQuery(shouldClauses...)

		boolQ := bleve.NewBooleanQuery()
		boolQ.AddMust(siteQ)
		boolQ.AddShould(shouldDisjunction)
		return boolQ
	}

	return bleve.NewDisjunctionQuery(shouldClauses...)
}
