package search

import "strings"

// ParseQuery cleans and normalizes a search query.
func ParseQuery(raw string) string {
	q := strings.TrimSpace(raw)
	// Collapse multiple spaces
	parts := strings.Fields(q)
	return strings.Join(parts, " ")
}
