package crawler

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/PuerkitoBio/goquery"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/pkg/urlutil"
)

// OnDocumentCrawled is called when a page has been successfully crawled.
type OnDocumentCrawled func(doc *models.Document, discoveredURLs []string)

// Crawler is the crawl engine that manages a worker pool.
type Crawler struct {
	scheduler   *Scheduler
	rateLimiter *RateLimiter
	robots      *RobotsCache
	onCrawled   OnDocumentCrawled

	userAgent      string
	requestTimeout time.Duration
	maxDepth       int
	rateLimit      int
	respectRobots  bool
	workers        int

	// Headless browser rendering
	browser           *BrowserPool
	enableHeadless    bool
	headlessThreshold int

	// Stats
	totalCrawled  atomic.Int64
	totalFailed   atomic.Int64
	activeWorkers atomic.Int64
	jsRendered    atomic.Int64

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// Config for the crawler.
type Config struct {
	Workers           int
	UserAgent         string
	RequestTimeout    time.Duration
	RateLimit         int
	MaxDepth          int
	RespectRobots     bool
	EnableHeadless    bool
	HeadlessThreshold int
	HeadlessTimeout   time.Duration
}

// New creates a new crawler engine.
func New(cfg Config, scheduler *Scheduler, onCrawled OnDocumentCrawled) *Crawler {
	ctx, cancel := context.WithCancel(context.Background())

	c := &Crawler{
		scheduler:         scheduler,
		rateLimiter:       NewRateLimiter(500 * time.Millisecond),
		robots:            NewRobotsCache(),
		onCrawled:         onCrawled,
		userAgent:         cfg.UserAgent,
		requestTimeout:    cfg.RequestTimeout,
		maxDepth:          cfg.MaxDepth,
		rateLimit:         cfg.RateLimit,
		respectRobots:     cfg.RespectRobots,
		workers:           cfg.Workers,
		enableHeadless:    cfg.EnableHeadless,
		headlessThreshold: cfg.HeadlessThreshold,
		ctx:               ctx,
		cancel:            cancel,
	}

	if cfg.EnableHeadless {
		timeout := cfg.HeadlessTimeout
		if timeout == 0 {
			timeout = 30 * time.Second
		}
		bp, err := NewBrowserPool(timeout)
		if err != nil {
			log.Printf("crawler: headless browser init failed: %v (continuing without headless)", err)
			c.enableHeadless = false
		} else {
			c.browser = bp
		}
	}

	return c
}

// Start launches the worker pool.
func (c *Crawler) Start() {
	log.Printf("crawler: starting %d workers (headless=%v)", c.workers, c.enableHeadless)

	// Start rate limiter cleanup
	go c.rateLimiter.Cleanup(c.ctx)

	for i := 0; i < c.workers; i++ {
		c.wg.Add(1)
		go c.worker(i)
	}
}

// Stop gracefully shuts down all workers.
func (c *Crawler) Stop() {
	log.Println("crawler: stopping workers")
	c.cancel()
	c.wg.Wait()
	if c.browser != nil {
		c.browser.Close()
	}
	log.Println("crawler: all workers stopped")
}

// Stats returns current crawler counters.
func (c *Crawler) Stats() (crawled, failed, active, jsRendered int64) {
	return c.totalCrawled.Load(), c.totalFailed.Load(), c.activeWorkers.Load(), c.jsRendered.Load()
}

// AddSeed schedules a seed URL for crawling.
func (c *Crawler) AddSeed(rawURL string) {
	normalized := urlutil.Normalize(rawURL)
	task := &models.CrawlTask{
		URL:       normalized,
		Domain:    urlutil.ExtractDomain(normalized),
		Depth:     0,
		Priority:  1,
		CreatedAt: time.Now(),
	}
	if c.scheduler.Schedule(task) {
		log.Printf("crawler: added seed URL: %s", normalized)
	}
}

func (c *Crawler) worker(id int) {
	defer c.wg.Done()
	log.Printf("crawler: worker %d started", id)

	for {
		select {
		case <-c.ctx.Done():
			log.Printf("crawler: worker %d stopped", id)
			return
		default:
		}

		task := c.scheduler.TryNext()
		if task == nil {
			select {
			case <-c.ctx.Done():
				return
			case <-time.After(1 * time.Second):
				continue
			}
		}

		c.processTask(id, task)
	}
}

func (c *Crawler) processTask(workerID int, task *models.CrawlTask) {
	if task.Depth > c.maxDepth {
		return
	}

	c.activeWorkers.Add(1)
	defer c.activeWorkers.Add(-1)

	domain := urlutil.ExtractDomain(task.URL)

	// Check robots.txt
	if c.respectRobots {
		parsedURL, err := url.Parse(task.URL)
		if err == nil && !c.robots.IsAllowed(domain, parsedURL.Path, c.userAgent) {
			log.Printf("worker %d: blocked by robots.txt: %s", workerID, task.URL)
			return
		}
	}

	// Rate limit
	c.rateLimiter.Wait(domain, c.rateLimit, time.Minute)

	// Fetch and extract
	doc, discoveredURLs, err := c.fetch(task.URL)
	if err != nil {
		c.totalFailed.Add(1)
		log.Printf("worker %d: fetch failed %s: %v", workerID, task.URL, err)
		return
	}

	c.totalCrawled.Add(1)
	doc.Depth = task.Depth
	log.Printf("worker %d: crawled %s (depth=%d, links=%d)", workerID, task.URL, task.Depth, len(discoveredURLs))

	if c.onCrawled != nil {
		c.onCrawled(doc, discoveredURLs)
	}
}

// spaMarkers are HTML signatures that indicate a JS-rendered single-page application.
var spaMarkers = []string{
	`id="root"`,
	`id="app"`,
	`id="__next"`,
	`__NEXT_DATA__`,
	`__NUXT__`,
	`id="___gatsby"`,
	`ng-app`,
	`ng-version`,
}

// isSPAShell checks whether the raw HTML body looks like a JS SPA shell with minimal content.
func isSPAShell(body []byte, contentLen int, threshold int) bool {
	if contentLen >= threshold {
		return false
	}
	bodyStr := string(body)
	for _, marker := range spaMarkers {
		if strings.Contains(bodyStr, marker) {
			return true
		}
	}
	return false
}

func (c *Crawler) fetch(rawURL string) (*models.Document, []string, error) {
	doc, discoveredURLs, body, err := c.fetchHTTP(rawURL)
	if err != nil {
		return nil, nil, err
	}

	// Check if headless fallback is warranted
	if c.enableHeadless && c.browser != nil && isSPAShell(body, doc.ContentSize, c.headlessThreshold) {
		log.Printf("crawler: SPA detected for %s (content=%d bytes), trying headless fallback", rawURL, doc.ContentSize)
		hdDoc, hdURLs, hdErr := c.fetchHeadless(rawURL)
		if hdErr != nil {
			log.Printf("crawler: headless fallback failed for %s: %v", rawURL, hdErr)
			// Return the original HTTP result
			return doc, discoveredURLs, nil
		}
		if hdDoc.ContentSize > doc.ContentSize {
			c.jsRendered.Add(1)
			log.Printf("crawler: headless fallback succeeded for %s (content %d -> %d bytes)", rawURL, doc.ContentSize, hdDoc.ContentSize)
			return hdDoc, hdURLs, nil
		}
	}

	return doc, discoveredURLs, nil
}

func (c *Crawler) fetchHTTP(rawURL string) (*models.Document, []string, []byte, error) {
	client := &http.Client{
		Timeout: c.requestTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	req, err := http.NewRequestWithContext(c.ctx, "GET", rawURL, nil)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")

	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("HTTP request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// Check content type
	ct := resp.Header.Get("Content-Type")
	if ct != "" && !strings.Contains(ct, "text/html") && !strings.Contains(ct, "application/xhtml") {
		return nil, nil, nil, fmt.Errorf("not HTML: %s", ct)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10MB limit
	if err != nil {
		return nil, nil, nil, fmt.Errorf("read body: %w", err)
	}

	goDoc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("parse HTML: %w", err)
	}

	// Extract metadata, headings, and images BEFORE content extraction,
	// because ExtractContent mutates the DOM by removing nav/header/footer/etc.
	ogTitle, ogDesc, canonical, metaKeywords := ExtractMetadata(goDoc)
	headings := ExtractHeadings(goDoc)
	images := ExtractImages(goDoc, rawURL)
	links, discoveredURLs := ExtractLinks(goDoc, rawURL)

	// ExtractContent removes script/style/nav/header/footer — call last
	title, description, content := ExtractContent(goDoc, rawURL)

	doc := &models.Document{
		ID:          models.DocumentID(rawURL),
		URL:         rawURL,
		Domain:      urlutil.ExtractDomain(rawURL),
		Title:       title,
		Description: description,
		Content:     content,
		ContentSize: len(content),
		Links:       links,
		Images:      images,
		Headings:    headings,
		StatusCode:  resp.StatusCode,
		CrawledAt:   time.Now(),
		OGTitle:     ogTitle,
		OGDesc:      ogDesc,
		Canonical:   canonical,
		IsHTTPS:     strings.HasPrefix(rawURL, "https://"),
	}

	// Merge meta keywords into document keywords
	if len(metaKeywords) > 0 {
		doc.Keywords = metaKeywords
	}

	doc.ComputeHash()

	return doc, discoveredURLs, body, nil
}

func (c *Crawler) fetchHeadless(rawURL string) (*models.Document, []string, error) {
	html, err := c.browser.RenderPage(rawURL, c.userAgent)
	if err != nil {
		return nil, nil, fmt.Errorf("headless render: %w", err)
	}

	goDoc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return nil, nil, fmt.Errorf("parse headless HTML: %w", err)
	}

	// Same extraction pipeline as fetchHTTP
	ogTitle, ogDesc, canonical, metaKeywords := ExtractMetadata(goDoc)
	headings := ExtractHeadings(goDoc)
	images := ExtractImages(goDoc, rawURL)
	links, discoveredURLs := ExtractLinks(goDoc, rawURL)
	title, description, content := ExtractContent(goDoc, rawURL)

	doc := &models.Document{
		ID:          models.DocumentID(rawURL),
		URL:         rawURL,
		Domain:      urlutil.ExtractDomain(rawURL),
		Title:       title,
		Description: description,
		Content:     content,
		ContentSize: len(content),
		Links:       links,
		Images:      images,
		Headings:    headings,
		StatusCode:  200,
		CrawledAt:   time.Now(),
		OGTitle:     ogTitle,
		OGDesc:      ogDesc,
		Canonical:   canonical,
		IsHTTPS:     strings.HasPrefix(rawURL, "https://"),
	}

	if len(metaKeywords) > 0 {
		doc.Keywords = metaKeywords
	}

	doc.ComputeHash()

	return doc, discoveredURLs, nil
}
