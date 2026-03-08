package crawler

import (
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// SitemapURL represents a single URL entry from a sitemap.
type SitemapURL struct {
	Loc        string `xml:"loc"`
	LastMod    string `xml:"lastmod,omitempty"`
	ChangeFreq string `xml:"changefreq,omitempty"`
	Priority   string `xml:"priority,omitempty"`
}

// sitemapURLSet is the root element for a <urlset> sitemap.
type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	URLs    []SitemapURL `xml:"url"`
}

// sitemapIndex is the root element for a <sitemapindex>.
type sitemapIndex struct {
	XMLName  xml.Name       `xml:"sitemapindex"`
	Sitemaps []sitemapEntry `xml:"sitemap"`
}

type sitemapEntry struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

// SitemapFetcher discovers and parses sitemap.xml files.
type SitemapFetcher struct {
	client       *http.Client
	userAgent    string
	maxURLs      int // per domain
	maxFileBytes int64
	maxDepth     int // recursion depth for sitemap indexes
}

// NewSitemapFetcher creates a new sitemap fetcher.
func NewSitemapFetcher(userAgent string) *SitemapFetcher {
	return &SitemapFetcher{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		userAgent:    userAgent,
		maxURLs:      50000,
		maxFileBytes: 50 << 20, // 50MB
		maxDepth:     3,
	}
}

// DiscoverAndParse fetches and parses sitemaps for a domain.
// If robotsSitemapURLs is empty, tries the default /sitemap.xml location.
func (sf *SitemapFetcher) DiscoverAndParse(domain string, robotsSitemapURLs []string) []SitemapURL {
	urls := robotsSitemapURLs
	if len(urls) == 0 {
		urls = []string{fmt.Sprintf("https://%s/sitemap.xml", domain)}
	}

	var result []SitemapURL
	for _, sitemapURL := range urls {
		found := sf.fetchSitemap(sitemapURL, 0)
		result = append(result, found...)
		if len(result) >= sf.maxURLs {
			result = result[:sf.maxURLs]
			break
		}
	}
	return result
}

func (sf *SitemapFetcher) fetchSitemap(sitemapURL string, depth int) []SitemapURL {
	if depth > sf.maxDepth {
		return nil
	}

	req, err := http.NewRequest("GET", sitemapURL, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", sf.userAgent)

	resp, err := sf.client.Do(req)
	if err != nil {
		log.Printf("sitemap: fetch error %s: %v", sitemapURL, err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, sf.maxFileBytes))
	if err != nil {
		return nil
	}

	content := string(body)

	// Detect whether this is a sitemap index or a URL set
	if strings.Contains(content, "<sitemapindex") {
		return sf.parseSitemapIndex(body, depth)
	}
	return sf.parseURLSet(body)
}

func (sf *SitemapFetcher) parseSitemapIndex(data []byte, depth int) []SitemapURL {
	var idx sitemapIndex
	if err := xml.Unmarshal(data, &idx); err != nil {
		log.Printf("sitemap: index parse error: %v", err)
		return nil
	}

	var result []SitemapURL
	for _, entry := range idx.Sitemaps {
		if entry.Loc == "" {
			continue
		}
		found := sf.fetchSitemap(entry.Loc, depth+1)
		result = append(result, found...)
		if len(result) >= sf.maxURLs {
			result = result[:sf.maxURLs]
			break
		}
	}
	return result
}

func (sf *SitemapFetcher) parseURLSet(data []byte) []SitemapURL {
	var urlSet sitemapURLSet
	if err := xml.Unmarshal(data, &urlSet); err != nil {
		log.Printf("sitemap: urlset parse error: %v", err)
		return nil
	}
	return urlSet.URLs
}
