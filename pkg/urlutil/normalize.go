package urlutil

import (
	"net/url"
	"strings"
)

// ExtractDomain extracts the host from a URL string.
func ExtractDomain(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "unknown"
	}
	return parsed.Host
}

// ResolveURL converts a relative URL to absolute using the given base.
func ResolveURL(baseURL, relativeURL string) string {
	base, err := url.Parse(baseURL)
	if err != nil {
		return ""
	}
	rel, err := url.Parse(relativeURL)
	if err != nil {
		return ""
	}
	return base.ResolveReference(rel).String()
}

// Normalize cleans up a URL for consistent deduplication.
func Normalize(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}

	// Force lowercase scheme and host
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	parsed.Host = strings.ToLower(parsed.Host)

	// Remove default ports
	if (parsed.Scheme == "http" && strings.HasSuffix(parsed.Host, ":80")) ||
		(parsed.Scheme == "https" && strings.HasSuffix(parsed.Host, ":443")) {
		parsed.Host = parsed.Hostname()
	}

	// Remove fragment
	parsed.Fragment = ""

	// Remove trailing slash for non-root paths
	if parsed.Path != "/" && strings.HasSuffix(parsed.Path, "/") {
		parsed.Path = strings.TrimRight(parsed.Path, "/")
	}
	if parsed.Path == "" {
		parsed.Path = "/"
	}

	return parsed.String()
}

// ShouldCrawl returns true if the URL is worth crawling (http/https, no binary extensions).
func ShouldCrawl(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}

	skipSuffixes := []string{
		".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
		".zip", ".rar", ".tar", ".gz",
		".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
		".css", ".js", ".xml", ".json", ".rss", ".atom",
		".mp3", ".mp4", ".avi", ".mov", ".wmv",
	}
	lower := strings.ToLower(parsed.Path)
	for _, s := range skipSuffixes {
		if strings.HasSuffix(lower, s) {
			return false
		}
	}
	return true
}
