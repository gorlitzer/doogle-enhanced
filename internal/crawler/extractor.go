package crawler

import (
	"net/url"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/pkg/urlutil"
)

// ExtractContent extracts title, description, and body text from an HTML document.
// Uses Readability-style main content extraction for cleaner body text.
func ExtractContent(doc *goquery.Document, pageURL string) (title, description, content string) {
	title = strings.TrimSpace(doc.Find("title").Text())
	description = strings.TrimSpace(doc.Find("meta[name=description]").AttrOr("content", ""))

	// Remove non-content elements before extracting body text
	doc.Find("script, style, nav, header, footer, aside, noscript, iframe, svg").Remove()

	// Try Readability-style main content extraction first
	mainContent := extractMainContent(doc)
	if mainContent != "" {
		content = mainContent
	} else {
		// Fallback to full body text
		content = strings.TrimSpace(doc.Find("body").Text())
		content = collapseWhitespace(content)
	}

	return
}

// extractMainContent scores block elements to find the main content area,
// similar to Arc90 Readability's algorithm.
func extractMainContent(doc *goquery.Document) string {
	type scored struct {
		sel   *goquery.Selection
		score int
	}

	var candidates []scored

	doc.Find("article, main, div, section, td").Each(func(_ int, s *goquery.Selection) {
		score := 0

		// Count paragraphs
		pCount := s.Find("p").Length()
		score += pCount

		// Count commas in text (natural prose indicator)
		text := s.Text()
		score += strings.Count(text, ",")

		// Text length bonus
		textLen := len(strings.TrimSpace(text))
		score += textLen / 100

		// Class/ID bonuses and penalties
		classID := strings.ToLower(s.AttrOr("class", "") + " " + s.AttrOr("id", ""))

		// Positive signals
		positiveWords := []string{"article", "content", "post", "entry", "main", "text", "body", "story"}
		for _, w := range positiveWords {
			if strings.Contains(classID, w) {
				score += 25
				break
			}
		}

		// Negative signals
		negativeWords := []string{"sidebar", "nav", "footer", "comment", "ad", "widget", "banner", "menu", "social", "share", "related"}
		for _, w := range negativeWords {
			if strings.Contains(classID, w) {
				score -= 25
				break
			}
		}

		// Tag bonus
		tagName := goquery.NodeName(s)
		if tagName == "article" || tagName == "main" {
			score += 30
		}

		if score > 0 {
			candidates = append(candidates, scored{sel: s, score: score})
		}
	})

	if len(candidates) == 0 {
		return ""
	}

	// Select highest scoring
	best := candidates[0]
	for _, c := range candidates[1:] {
		if c.score > best.score {
			best = c
		}
	}

	// Threshold: need at least 50 score to override fallback
	if best.score < 50 {
		return ""
	}

	text := strings.TrimSpace(best.sel.Text())
	return collapseWhitespace(text)
}

// ExtractMetadata extracts rich metadata: Open Graph, canonical, keywords.
func ExtractMetadata(doc *goquery.Document) (ogTitle, ogDesc, canonical string, metaKeywords []string) {
	ogTitle = doc.Find(`meta[property="og:title"]`).AttrOr("content", "")
	ogDesc = doc.Find(`meta[property="og:description"]`).AttrOr("content", "")
	canonical = doc.Find(`link[rel="canonical"]`).AttrOr("href", "")

	kw := doc.Find(`meta[name="keywords"]`).AttrOr("content", "")
	if kw != "" {
		for _, k := range strings.Split(kw, ",") {
			k = strings.TrimSpace(k)
			if k != "" {
				metaKeywords = append(metaKeywords, k)
			}
		}
	}
	return
}

// ExtractHeadings extracts all h1-h6 heading elements.
func ExtractHeadings(doc *goquery.Document) []models.Heading {
	var headings []models.Heading
	doc.Find("h1, h2, h3, h4, h5, h6").Each(func(_ int, s *goquery.Selection) {
		tagName := goquery.NodeName(s)
		level, _ := strconv.Atoi(tagName[1:])
		text := strings.TrimSpace(s.Text())
		if text != "" && level >= 1 && level <= 6 {
			headings = append(headings, models.Heading{Level: level, Text: text})
		}
	})
	return headings
}

// ExtractImages extracts image URLs with alt text.
func ExtractImages(doc *goquery.Document, baseURL string) []models.Image {
	var images []models.Image
	doc.Find("img[src]").Each(func(_ int, s *goquery.Selection) {
		src, _ := s.Attr("src")
		if src == "" {
			return
		}
		absURL := urlutil.ResolveURL(baseURL, src)
		if absURL == "" {
			return
		}
		alt, _ := s.Attr("alt")
		title, _ := s.Attr("title")
		images = append(images, models.Image{
			URL:   absURL,
			Alt:   alt,
			Title: title,
		})
	})
	if len(images) > 100 {
		images = images[:100]
	}
	return images
}

// ExtractLinks discovers all links from the document and categorizes them.
func ExtractLinks(doc *goquery.Document, baseURLStr string) (links []models.Link, discoveredURLs []string) {
	baseURL, err := url.Parse(baseURLStr)
	if err != nil {
		return
	}

	seen := make(map[string]bool)

	doc.Find("a[href]").Each(func(_ int, s *goquery.Selection) {
		href, exists := s.Attr("href")
		if !exists {
			return
		}

		absURL := urlutil.ResolveURL(baseURLStr, href)
		if absURL == "" {
			return
		}

		normalized := urlutil.Normalize(absURL)
		if seen[normalized] {
			return
		}
		seen[normalized] = true

		parsedURL, err := url.Parse(absURL)
		if err != nil {
			return
		}
		if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
			return
		}

		isExternal := parsedURL.Host != baseURL.Host
		text := strings.TrimSpace(s.Text())

		rel, _ := s.Attr("rel")
		noFollow := strings.Contains(strings.ToLower(rel), "nofollow")

		links = append(links, models.Link{
			URL:        absURL,
			Text:       text,
			IsExternal: isExternal,
			NoFollow:   noFollow,
		})

		if urlutil.ShouldCrawl(absURL) {
			discoveredURLs = append(discoveredURLs, normalized)
		}
	})

	return
}

func collapseWhitespace(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	lastWasSpace := false
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			if !lastWasSpace {
				b.WriteRune(' ')
				lastWasSpace = true
			}
		} else {
			b.WriteRune(r)
			lastWasSpace = false
		}
	}
	return b.String()
}
