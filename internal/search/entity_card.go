package search

import (
	"strings"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

// DetectEntityCard checks if the query matches a known entity in the knowledge graph
// and returns an entity card for display in search results.
func DetectEntityCard(query string, entityStore *store.EntityStore) *models.EntityCard {
	if entityStore == nil {
		return nil
	}

	// Clean query: remove operators
	cleanQuery := cleanEntityQuery(query)
	if cleanQuery == "" {
		return nil
	}

	// Try exact match first
	entity := entityStore.FindEntity(cleanQuery)
	if entity == nil {
		// Try searching
		results := entityStore.SearchEntities(cleanQuery, 1)
		if len(results) > 0 {
			entity = &results[0]
		}
	}

	if entity == nil || entity.DocCount < 2 {
		return nil // need at least 2 documents to show a card
	}

	card := &models.EntityCard{
		Name:       entity.Name,
		Type:       entity.Type,
		Properties: entity.Properties,
		DocCount:   entity.DocCount,
	}

	// Use first stored description or generate from properties
	if entity.Description != "" {
		card.Description = entity.Description
	}

	// Add related entities
	related := entityStore.GetRelatedEntities(entity.Name, 5)
	for _, re := range related {
		card.RelatedEntities = append(card.RelatedEntities, models.EntityCardRef{
			Name: re.Name,
			Type: re.Type,
		})
	}

	return card
}

// cleanEntityQuery removes search operators from a query for entity matching.
func cleanEntityQuery(query string) string {
	var parts []string
	for _, word := range strings.Fields(query) {
		// Skip operator tokens
		if strings.Contains(word, ":") || strings.HasPrefix(word, "-") || strings.HasPrefix(word, "+") {
			continue
		}
		// Remove quotes
		word = strings.Trim(word, `"'`)
		if word != "" {
			parts = append(parts, word)
		}
	}
	return strings.Join(parts, " ")
}
