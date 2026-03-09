package crawler

import (
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// PerformanceMetrics holds lightweight performance signals extracted from HTML.
type PerformanceMetrics struct {
	ScriptCount     int
	StylesheetCount int
	ResourceCount   int
	InlineStyleLen  int
	HasLazyImages   bool
	HasAsyncScripts bool
}

// ExtractPerformanceMetrics analyses the parsed HTML document for performance signals.
func ExtractPerformanceMetrics(doc *goquery.Document) PerformanceMetrics {
	var m PerformanceMetrics

	// Count external scripts
	doc.Find("script[src]").Each(func(_ int, s *goquery.Selection) {
		m.ScriptCount++
		if _, ok := s.Attr("async"); ok {
			m.HasAsyncScripts = true
		}
		if _, ok := s.Attr("defer"); ok {
			m.HasAsyncScripts = true
		}
	})

	// Count stylesheets
	doc.Find(`link[rel="stylesheet"]`).Each(func(_ int, _ *goquery.Selection) {
		m.StylesheetCount++
	})

	// Count images and detect lazy loading
	doc.Find("img").Each(func(_ int, s *goquery.Selection) {
		m.ResourceCount++
		if loading, ok := s.Attr("loading"); ok && strings.EqualFold(loading, "lazy") {
			m.HasLazyImages = true
		}
	})

	// Total resource count = scripts + stylesheets + images
	m.ResourceCount += m.ScriptCount + m.StylesheetCount

	// Sum inline style lengths
	doc.Find("[style]").Each(func(_ int, s *goquery.Selection) {
		if style, ok := s.Attr("style"); ok {
			m.InlineStyleLen += len(style)
		}
	})

	return m
}
