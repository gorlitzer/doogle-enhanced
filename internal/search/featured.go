package search

import (
	"github.com/doogle/doogle-v2/internal/models"
)

// ExtractFeaturedSnippet picks a featured snippet from the top search result
// when the query has informational intent with sufficient confidence.
func ExtractFeaturedSnippet(query string, results []models.SearchResult, intent *QueryIntent) *models.InstantAnswer {
	// Only for informational intent with high confidence
	if intent.Type != IntentInformational || intent.Confidence < 0.7 {
		return nil
	}

	if len(results) == 0 {
		return nil
	}

	top := results[0]

	// Only if top result has decent quality
	if top.QualityScore < 0.4 && top.EEATScore < 0.3 {
		return nil
	}

	// Only if the snippet is long enough to be useful
	if len(top.Description) < 40 {
		return nil
	}

	return &models.InstantAnswer{
		Type:   "featured_snippet",
		Query:  query,
		Answer: top.Description,
		Source: top.URL,
	}
}

// GenerateRelatedSearches creates related search suggestions from synonyms and topics.
func GenerateRelatedSearches(pq *models.ParsedQuery, relatedTopics []string) []string {
	seen := make(map[string]bool)
	seen[pq.CleanedQuery] = true
	var related []string

	// Synonym-based reformulations: replace first query term with its synonym
	if len(pq.Terms) > 0 && len(pq.Synonyms) > 0 {
		firstTerm := pq.Terms[0]
		count := 0
		for _, syn := range pq.Synonyms {
			if count >= 3 {
				break
			}
			// Build reformulated query
			reformulated := syn
			if len(pq.Terms) > 1 {
				rest := make([]string, 0, len(pq.Terms)-1)
				for _, t := range pq.Terms[1:] {
					rest = append(rest, t)
				}
				reformulated = syn + " " + joinTerms(rest)
			}
			_ = firstTerm // used conceptually
			if !seen[reformulated] {
				seen[reformulated] = true
				related = append(related, reformulated)
				count++
			}
		}
	}

	// Append related topics
	for _, topic := range relatedTopics {
		if len(related) >= 6 {
			break
		}
		if !seen[topic] {
			seen[topic] = true
			related = append(related, topic)
		}
	}

	return related
}

func joinTerms(terms []string) string {
	result := ""
	for i, t := range terms {
		if i > 0 {
			result += " "
		}
		result += t
	}
	return result
}
