package crawler

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// MobileMetrics holds mobile-friendliness signals extracted from HTML.
type MobileMetrics struct {
	HasViewportMeta bool
	ViewportContent string
	HasMediaQueries bool
	HasFlexboxGrid  bool
	HasTouchIcons   bool
	SmallFontCount  int
	SmallTapTargets int
}

var (
	mediaQueryRe = regexp.MustCompile(`@media\b`)
	flexGridRe   = regexp.MustCompile(`\b(flex|grid)\b`)
	fontSizeRe   = regexp.MustCompile(`font-size\s*:\s*(\d+(?:\.\d+)?)\s*(px|pt)`)
	widthHeightRe = regexp.MustCompile(`(?:width|height)\s*:\s*(\d+(?:\.\d+)?)\s*px`)
)

// ExtractMobileMetrics analyses the parsed HTML document for mobile-friendliness signals.
func ExtractMobileMetrics(doc *goquery.Document) MobileMetrics {
	var m MobileMetrics

	// Check viewport meta tag
	doc.Find(`meta[name="viewport"]`).Each(func(_ int, s *goquery.Selection) {
		if content, ok := s.Attr("content"); ok {
			m.HasViewportMeta = true
			m.ViewportContent = content
		}
	})

	// Scan <style> tags for @media queries and flexbox/grid
	doc.Find("style").Each(func(_ int, s *goquery.Selection) {
		text := s.Text()
		if mediaQueryRe.MatchString(text) {
			m.HasMediaQueries = true
		}
		if flexGridRe.MatchString(text) {
			m.HasFlexboxGrid = true
		}
	})

	// Also check linked stylesheets with media attribute
	doc.Find(`link[rel="stylesheet"][media]`).Each(func(_ int, s *goquery.Selection) {
		if media, ok := s.Attr("media"); ok && media != "all" && media != "" {
			m.HasMediaQueries = true
		}
	})

	// Detect touch icons
	doc.Find(`link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]`).Each(func(_ int, _ *goquery.Selection) {
		m.HasTouchIcons = true
	})

	// Scan inline style attributes for small fonts and small tap targets
	doc.Find("[style]").Each(func(_ int, s *goquery.Selection) {
		style, ok := s.Attr("style")
		if !ok {
			return
		}
		lower := strings.ToLower(style)

		// Small font detection (< 12px)
		if matches := fontSizeRe.FindStringSubmatch(lower); len(matches) >= 3 {
			if size, err := strconv.ParseFloat(matches[1], 64); err == nil {
				if (matches[2] == "px" && size < 12) || (matches[2] == "pt" && size < 9) {
					m.SmallFontCount++
				}
			}
		}

		// Small tap target detection (width or height < 44px on interactive elements)
		tag := strings.ToLower(goquery.NodeName(s))
		if tag == "a" || tag == "button" || tag == "input" || tag == "select" {
			if matches := widthHeightRe.FindStringSubmatch(lower); len(matches) >= 2 {
				if size, err := strconv.ParseFloat(matches[1], 64); err == nil && size < 44 {
					m.SmallTapTargets++
				}
			}
		}
	})

	return m
}
