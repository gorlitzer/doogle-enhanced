package search

import (
	"net/url"
	"strings"

	"github.com/doogle/doogle-v2/internal/models"
)

// ApplyDomainDiversity caps results per domain in the top N positions.
// Demoted results are pushed below topN, not removed.
func ApplyDomainDiversity(results []models.SearchResult, maxPerDomain int, topN int) []models.SearchResult {
	if len(results) <= 1 || maxPerDomain <= 0 {
		return results
	}
	if topN > len(results) {
		topN = len(results)
	}

	domainCount := make(map[string]int)
	var kept []models.SearchResult
	var demoted []models.SearchResult

	// Process top N: enforce cap
	for i := 0; i < topN; i++ {
		domain := registrableDomain(results[i].URL)
		domainCount[domain]++
		if domainCount[domain] <= maxPerDomain {
			kept = append(kept, results[i])
		} else {
			demoted = append(demoted, results[i])
		}
	}

	// Append demoted results after the kept top-N
	kept = append(kept, demoted...)

	// Append everything after topN as-is (no cap)
	if topN < len(results) {
		kept = append(kept, results[topN:]...)
	}

	return kept
}

// registrableDomain extracts the registrable domain from a URL.
// Falls back to the hostname if parsing fails.
func registrableDomain(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return rawURL
	}
	host := u.Hostname()

	// Strip www. prefix
	host = strings.TrimPrefix(host, "www.")

	// Simple registrable domain extraction: take last two parts
	// (e.g., "docs.example.com" → "example.com")
	parts := strings.Split(host, ".")
	if len(parts) >= 2 {
		return parts[len(parts)-2] + "." + parts[len(parts)-1]
	}
	return host
}
