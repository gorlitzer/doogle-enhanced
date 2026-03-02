package indexer

import (
	"net/url"
	"regexp"
	"strings"
	"unicode"
)

// URLSignals holds quality signals derived from URL structure.
type URLSignals struct {
	PathDepth      int
	PathLength     int
	HasQueryParams bool
	IsCleanURL     bool
	SlugReadable   bool
	Score          float64
}

var (
	// Session/tracking parameters that indicate low-quality URLs
	trackingParams = map[string]bool{
		"utm_source": true, "utm_medium": true, "utm_campaign": true,
		"utm_term": true, "utm_content": true, "fbclid": true,
		"gclid": true, "sessionid": true, "sid": true,
		"jsessionid": true, "phpsessid": true, "ref": true,
		"source": true, "clickid": true,
	}

	// Pattern for random-looking path segments (hex, base64, UUIDs)
	randomSegmentRe = regexp.MustCompile(`^[0-9a-f]{8,}$|^[A-Za-z0-9+/=]{16,}$|^[0-9a-f]{8}-[0-9a-f]{4}-`)
)

// ScoreURL evaluates URL structure quality.
func ScoreURL(rawURL string) URLSignals {
	sig := URLSignals{}

	u, err := url.Parse(rawURL)
	if err != nil {
		sig.Score = 0.5
		return sig
	}

	path := strings.Trim(u.Path, "/")
	sig.PathLength = len(path)

	// Count path segments
	segments := []string{}
	if path != "" {
		segments = strings.Split(path, "/")
	}
	sig.PathDepth = len(segments)

	// Check for query parameters
	sig.HasQueryParams = len(u.Query()) > 0

	// Check if URL is clean (no tracking params)
	sig.IsCleanURL = true
	for param := range u.Query() {
		if trackingParams[strings.ToLower(param)] {
			sig.IsCleanURL = false
			break
		}
	}

	// Check if slug is human-readable
	sig.SlugReadable = isReadableSlug(segments)

	// Compute composite score
	score := 1.0

	// Depth penalty
	switch {
	case sig.PathDepth <= 2:
		// no penalty
	case sig.PathDepth == 3:
		score -= 0.1
	case sig.PathDepth == 4:
		score -= 0.2
	default:
		score -= 0.4
	}

	// Query params penalty
	if sig.HasQueryParams {
		score -= 0.15
	}

	// Unclean URL penalty
	if !sig.IsCleanURL {
		score -= 0.1
	}

	// Unreadable slug penalty
	if !sig.SlugReadable {
		score -= 0.2
	}

	// Very long paths
	if sig.PathLength > 100 {
		score -= 0.15
	}

	if score < 0 {
		score = 0
	}
	sig.Score = score

	return sig
}

// isReadableSlug checks if path segments contain human-readable words.
func isReadableSlug(segments []string) bool {
	if len(segments) == 0 {
		return true
	}

	readableCount := 0
	for _, seg := range segments {
		seg = strings.ToLower(seg)
		// Skip file extensions
		if idx := strings.LastIndex(seg, "."); idx >= 0 {
			seg = seg[:idx]
		}
		if seg == "" {
			continue
		}
		if randomSegmentRe.MatchString(seg) {
			return false
		}
		// Check if segment contains mostly letters and hyphens (readable slug)
		letterCount := 0
		for _, r := range seg {
			if unicode.IsLetter(r) || r == '-' || r == '_' {
				letterCount++
			}
		}
		if float64(letterCount)/float64(len(seg)) > 0.7 {
			readableCount++
		}
	}

	return readableCount > 0 || len(segments) == 0
}
