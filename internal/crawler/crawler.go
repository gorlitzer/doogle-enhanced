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

	// Stats
	totalCrawled  atomic.Int64
	totalFailed   atomic.Int64
	activeWorkers atomic.Int64

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// Config for the crawler.
type Config struct {
	Workers        int
	UserAgent      string
	RequestTimeout time.Duration
	RateLimit      int
	MaxDepth       int
	RespectRobots  bool
}

// New creates a new crawler engine.
func New(cfg Config, scheduler *Scheduler, onCrawled OnDocumentCrawled) *Crawler {
	ctx, cancel := context.WithCancel(context.Background())

	return &Crawler{
		scheduler:      scheduler,
		rateLimiter:    NewRateLimiter(500 * time.Millisecond),
		robots:         NewRobotsCache(),
		onCrawled:      onCrawled,
		userAgent:      cfg.UserAgent,
		requestTimeout: cfg.RequestTimeout,
		maxDepth:       cfg.MaxDepth,
		rateLimit:      cfg.RateLimit,
		respectRobots:  cfg.RespectRobots,
		workers:        cfg.Workers,
		ctx:            ctx,
		cancel:         cancel,
	}
}

// Start launches the worker pool.
func (c *Crawler) Start() {
	log.Printf("crawler: starting %d workers", c.workers)

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
	log.Println("crawler: all workers stopped")
}

// Stats returns current crawler counters.
func (c *Crawler) Stats() (crawled, failed, active int64) {
	return c.totalCrawled.Load(), c.totalFailed.Load(), c.activeWorkers.Load()
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

func (c *Crawler) fetch(rawURL string) (*models.Document, []string, error) {
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
		return nil, nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")

	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("HTTP request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// Check content type
	ct := resp.Header.Get("Content-Type")
	if ct != "" && !strings.Contains(ct, "text/html") && !strings.Contains(ct, "application/xhtml") {
		return nil, nil, fmt.Errorf("not HTML: %s", ct)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10MB limit
	if err != nil {
		return nil, nil, fmt.Errorf("read body: %w", err)
	}

	goDoc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return nil, nil, fmt.Errorf("parse HTML: %w", err)
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

	return doc, discoveredURLs, nil
}
