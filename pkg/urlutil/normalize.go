package urlutil

import (
	"net"
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

	// Strip tracking parameters and sort query params
	if parsed.RawQuery != "" {
		params := parsed.Query()
		changed := false
		for key := range params {
			if isTrackingParam(key) {
				delete(params, key)
				changed = true
			}
		}
		if changed || len(params) > 0 {
			parsed.RawQuery = params.Encode() // Encode() sorts keys
		}
		if len(params) == 0 {
			parsed.RawQuery = ""
		}
	}

	// Remove trailing slash for non-root paths
	if parsed.Path != "/" && strings.HasSuffix(parsed.Path, "/") {
		parsed.Path = strings.TrimRight(parsed.Path, "/")
	}
	if parsed.Path == "" {
		parsed.Path = "/"
	}

	return parsed.String()
}

// trackingParams is the set of exact-match query parameter names to strip.
var trackingParams = map[string]bool{
	"fbclid":  true,
	"gclid":   true,
	"msclkid": true,
	"mc_cid":  true,
	"mc_eid":  true,
	"_ga":     true,
	"_gl":     true,
	"zanpid":  true,
	"dclid":   true,
}

// trackingPrefixes are query parameter prefixes to strip (e.g. utm_source).
var trackingPrefixes = []string{"utm_"}

// isTrackingParam returns true if the query parameter is a known tracking param.
func isTrackingParam(key string) bool {
	lower := strings.ToLower(key)
	if trackingParams[lower] {
		return true
	}
	for _, prefix := range trackingPrefixes {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

// IsSafeURL checks that a URL targets a public host (not private/internal IPs).
// This prevents SSRF attacks from untrusted sources (gossip, user input).
func IsSafeURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := u.Hostname()
	if host == "" {
		return false
	}

	// Reject localhost variants.
	lower := strings.ToLower(host)
	if lower == "localhost" || lower == "0.0.0.0" || strings.HasSuffix(lower, ".local") {
		return false
	}

	ip := net.ParseIP(host)
	if ip == nil {
		// Hostname, not a literal IP. We can't know the target address until DNS
		// resolves at connect time, so this is only a cheap pre-filter — the
		// authoritative SSRF defense is the dial-time guard (see SafeDialControl),
		// which re-checks the *resolved* IP and defeats DNS rebinding.
		return true
	}

	return IsSafeResolvedIP(ip)
}

// IsSafeResolvedIP reports whether a concrete IP address is a safe crawl target:
// a public, routable unicast address. It rejects loopback, private (incl. IPv6
// unique-local), link-local, unspecified, and cloud metadata addresses. This is
// the single source of truth for both the URL pre-filter and the dial-time guard.
func IsSafeResolvedIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsUnspecified() ||
		ip.IsInterfaceLocalMulticast() {
		return false
	}
	// Cloud metadata endpoints (AWS/GCP/Azure IMDS and its IPv6 alias).
	if ip.Equal(net.ParseIP("169.254.169.254")) || ip.Equal(net.ParseIP("fd00:ec2::254")) {
		return false
	}
	return true
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
