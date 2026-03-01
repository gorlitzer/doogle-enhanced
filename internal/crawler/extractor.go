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
func ExtractContent(doc *goquery.Document, pageURL string) (title, description, content string) {
	title = strings.TrimSpace(doc.Find("title").Text())
	description = strings.TrimSpace(doc.Find("meta[name=description]").AttrOr("content", ""))

	// Remove non-content elements before extracting body text
	doc.Find("script, style, nav, header, footer, aside, noscript, iframe, svg").Remove()
	content = strings.TrimSpace(doc.Find("body").Text())
	content = collapseWhitespace(content)

	return
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
