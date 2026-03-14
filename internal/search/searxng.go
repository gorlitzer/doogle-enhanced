package search

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

// PublicSearXNGInstances is a curated list of reliable public SearXNG instances.
// These are selected for uptime, JSON API support, and low rate-limiting.
var PublicSearXNGInstances = []string{
	"https://search.sapti.me",
	"https://searxng.site",
	"https://search.bus-hit.me",
	"https://searx.tiekoetter.com",
	"https://search.ononoki.org",
	"https://searx.be",
	"https://search.mdosch.de",
	"https://searx.zhenyapav.com",
	"https://search.hbubli.cc",
	"https://nyc1.sx.ggtyler.dev",
}

// SearXNGClient queries a SearXNG instance's JSON API for external search results.
type SearXNGClient struct {
	urls         []string
	currentIdx   int
	mu           sync.Mutex
	timeout      time.Duration
	maxResults   int
	categories   string
	scorePenalty float64
	httpClient   *http.Client
}

// searxngResponse is the JSON structure returned by SearXNG's /search endpoint.
type searxngResponse struct {
	Results []searxngResult `json:"results"`
}

type searxngResult struct {
	URL     string  `json:"url"`
	Title   string  `json:"title"`
	Content string  `json:"content"`
	Engine  string  `json:"engine"`
	Score   float64 `json:"score"`
}

// NewSearXNGClient creates a client for querying a single SearXNG instance.
func NewSearXNGClient(baseURL string, timeout time.Duration, maxResults int, categories string, scorePenalty float64) *SearXNGClient {
	return newSearXNGClient([]string{strings.TrimRight(baseURL, "/")}, timeout, maxResults, categories, scorePenalty)
}

// NewSearXNGClientAuto creates a client that uses the curated public instance list
// with automatic failover rotation.
func NewSearXNGClientAuto(timeout time.Duration, maxResults int, categories string, scorePenalty float64) *SearXNGClient {
	return newSearXNGClient(PublicSearXNGInstances, timeout, maxResults, categories, scorePenalty)
}

func newSearXNGClient(urls []string, timeout time.Duration, maxResults int, categories string, scorePenalty float64) *SearXNGClient {
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	if maxResults <= 0 {
		maxResults = 10
	}
	if categories == "" {
		categories = "general"
	}
	if scorePenalty <= 0 || scorePenalty > 1 {
		scorePenalty = 0.7
	}
	return &SearXNGClient{
		urls:         urls,
		timeout:      timeout,
		maxResults:   maxResults,
		categories:   categories,
		scorePenalty: scorePenalty,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// CurrentURL returns the currently active instance URL.
func (c *SearXNGClient) CurrentURL() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.urls) == 0 {
		return ""
	}
	return c.urls[c.currentIdx%len(c.urls)]
}

// rotate advances to the next instance in the list.
func (c *SearXNGClient) rotate() {
	// Must be called with c.mu held.
	if len(c.urls) > 1 {
		c.currentIdx = (c.currentIdx + 1) % len(c.urls)
	}
}

// Query searches SearXNG and returns results converted to Doogle's SearchResult format.
// On failure (timeout, 429, non-200), it rotates to the next instance before returning.
// Errors are logged but never propagated — returns empty results on failure.
func (c *SearXNGClient) Query(ctx context.Context, query string) ([]models.SearchResult, error) {
	c.mu.Lock()
	baseURL := c.urls[c.currentIdx%len(c.urls)]
	c.mu.Unlock()

	reqURL := fmt.Sprintf("%s/search?q=%s&format=json&categories=%s",
		baseURL,
		url.QueryEscape(query),
		url.QueryEscape(c.categories),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		log.Printf("searxng: failed to create request: %v", err)
		return nil, nil
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("searxng: request failed (%s): %v", baseURL, err)
		c.mu.Lock()
		c.rotate()
		c.mu.Unlock()
		return nil, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		log.Printf("searxng: rate limited (429) from %s, rotating", baseURL)
		c.mu.Lock()
		c.rotate()
		c.mu.Unlock()
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		log.Printf("searxng: unexpected status %d from %s, rotating", resp.StatusCode, baseURL)
		c.mu.Lock()
		c.rotate()
		c.mu.Unlock()
		return nil, nil
	}

	var sResp searxngResponse
	if err := json.NewDecoder(resp.Body).Decode(&sResp); err != nil {
		log.Printf("searxng: failed to decode response: %v", err)
		return nil, nil
	}

	results := make([]models.SearchResult, 0, len(sResp.Results))
	for _, sr := range sResp.Results {
		if sr.URL == "" {
			continue
		}
		if len(results) >= c.maxResults {
			break
		}
		results = append(results, models.SearchResult{
			URL:            sr.URL,
			Title:          sr.Title,
			Description:    sr.Content,
			Domain:         extractDomain(sr.URL),
			Score:          sr.Score * c.scorePenalty,
			Source:         "searxng",
			PeerID:         "searxng",
			PeerName:       "SearXNG",
			OriginPeerID:   "searxng",
			OriginPeerName: "SearXNG",
		})
	}

	return results, nil
}

// extractDomain extracts the hostname from a URL string.
func extractDomain(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	host := u.Hostname()
	// Strip www. prefix
	if strings.HasPrefix(host, "www.") {
		host = host[4:]
	}
	return host
}
