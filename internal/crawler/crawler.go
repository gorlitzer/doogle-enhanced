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

// StatsStore persists crawler stats across restarts.
type StatsStore interface {
	GetCrawlerStats() (crawled, failed, jsRendered int64)
	SetCrawlerStats(crawled, failed, jsRendered int64) error
}

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
	maxBodyBytes   int

	// Stats persistence
	statsStore StatsStore

	// Headless browser rendering
	browser           *BrowserPool
	enableHeadless    bool
	headlessThreshold int

	// Sitemap discovery
	sitemapFetcher *SitemapFetcher
	sitemapChecked sync.Map // domain → bool

	// Pause/resume
	paused atomic.Bool

	// Stats
	totalCrawled  atomic.Int64
	totalFailed   atomic.Int64
	activeWorkers atomic.Int64
	jsRendered    atomic.Int64

	// Live crawl feed ring buffer
	events  [50]models.CrawlEvent
	evHead  int
	evCount int
	evMu    sync.RWMutex
	nextSeq atomic.Uint64

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
	MaxBodyBytes      int
	StatsStore        StatsStore
}

// New creates a new crawler engine.
func New(cfg Config, scheduler *Scheduler, onCrawled OnDocumentCrawled) *Crawler {
	ctx, cancel := context.WithCancel(context.Background())

	maxBody := cfg.MaxBodyBytes
	if maxBody <= 0 {
		maxBody = 10 << 20 // default 10MB
	}

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
		maxBodyBytes:      maxBody,
		enableHeadless:    cfg.EnableHeadless,
		headlessThreshold: cfg.HeadlessThreshold,
		ctx:               ctx,
		cancel:            cancel,
	}

	c.sitemapFetcher = NewSitemapFetcher(cfg.UserAgent)

	// Load persisted stats from previous session
	if cfg.StatsStore != nil {
		c.statsStore = cfg.StatsStore
		crawled, failed, jsRendered := cfg.StatsStore.GetCrawlerStats()
		c.totalCrawled.Store(crawled)
		c.totalFailed.Store(failed)
		c.jsRendered.Store(jsRendered)
		if crawled > 0 || failed > 0 {
			log.Printf("crawler: restored stats — crawled=%d failed=%d jsRendered=%d", crawled, failed, jsRendered)
		}
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

// Stop gracefully shuts down all workers and persists stats.
func (c *Crawler) Stop() {
	log.Println("crawler: stopping workers")
	c.cancel()
	c.wg.Wait()
	if c.browser != nil {
		c.browser.Close()
	}
	if c.statsStore != nil {
		crawled := c.totalCrawled.Load()
		failed := c.totalFailed.Load()
		jsRendered := c.jsRendered.Load()
		if err := c.statsStore.SetCrawlerStats(crawled, failed, jsRendered); err != nil {
			log.Printf("crawler: failed to persist stats: %v", err)
		} else {
			log.Printf("crawler: persisted stats — crawled=%d failed=%d jsRendered=%d", crawled, failed, jsRendered)
		}
	}
	log.Println("crawler: all workers stopped")
}

// Stats returns current crawler counters.
func (c *Crawler) Stats() (crawled, failed, active, jsRendered int64) {
	return c.totalCrawled.Load(), c.totalFailed.Load(), c.activeWorkers.Load(), c.jsRendered.Load()
}

// Pause pauses the crawler. In-flight tasks finish normally.
func (c *Crawler) Pause() {
	if !c.paused.Swap(true) {
		log.Println("crawler: paused")
	}
}

// Resume resumes the crawler after a pause.
func (c *Crawler) Resume() {
	if c.paused.Swap(false) {
		log.Println("crawler: resumed")
	}
}

// IsPaused returns whether the crawler is currently paused.
func (c *Crawler) IsPaused() bool {
	return c.paused.Load()
}

// recordEvent appends a crawl event to the ring buffer.
func (c *Crawler) recordEvent(ev models.CrawlEvent) {
	ev.Seq = c.nextSeq.Add(1)
	ev.Timestamp = time.Now()

	c.evMu.Lock()
	c.events[c.evHead] = ev
	c.evHead = (c.evHead + 1) % len(c.events)
	if c.evCount < len(c.events) {
		c.evCount++
	}
	c.evMu.Unlock()
}

// RecentEvents returns crawl events with Seq > afterSeq, newest first.
func (c *Crawler) RecentEvents(afterSeq uint64) []models.CrawlEvent {
	c.evMu.RLock()
	defer c.evMu.RUnlock()

	result := make([]models.CrawlEvent, 0, c.evCount)
	for i := 0; i < c.evCount; i++ {
		idx := (c.evHead - 1 - i + len(c.events)) % len(c.events)
		ev := c.events[idx]
		if ev.Seq > afterSeq {
			result = append(result, ev)
		}
	}
	return result
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

// DiscoverSitemap discovers and schedules URLs from a domain's sitemap.xml.
// Only runs once per domain.
func (c *Crawler) DiscoverSitemap(domain string) {
	if _, loaded := c.sitemapChecked.LoadOrStore(domain, true); loaded {
		return // already checked
	}

	robotsSitemaps := c.robots.GetSitemaps(domain, c.userAgent)
	urls := c.sitemapFetcher.DiscoverAndParse(domain, robotsSitemaps)
	if len(urls) == 0 {
		return
	}

	scheduled := 0
	for _, u := range urls {
		if u.Loc == "" {
			continue
		}
		normalized := urlutil.Normalize(u.Loc)
		if !urlutil.ShouldCrawl(normalized) {
			continue
		}
		task := &models.CrawlTask{
			URL:       normalized,
			Domain:    domain,
			Depth:     1,
			Priority:  3, // lower priority than direct links
			CreatedAt: time.Now(),
		}
		if c.scheduler.Schedule(task) {
			scheduled++
		}
	}
	if scheduled > 0 {
		log.Printf("crawler: discovered %d URLs from sitemap for %s", scheduled, domain)
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

		// If paused, wait and retry
		if c.paused.Load() {
			select {
			case <-c.ctx.Done():
				return
			case <-time.After(2 * time.Second):
				continue
			}
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

		// Apply Crawl-delay from robots.txt
		if crawlDelay := c.robots.GetCrawlDelay(domain, c.userAgent); crawlDelay > 0 {
			c.rateLimiter.SetDomainDelay(domain, crawlDelay)
		}
	}

	// Rate limit
	c.rateLimiter.Wait(domain, c.rateLimit, time.Minute)

	// Fetch and extract
	doc, discoveredURLs, err := c.fetch(task.URL)
	if err != nil {
		c.totalFailed.Add(1)
		c.recordEvent(models.CrawlEvent{
			URL:    task.URL,
			Domain: domain,
			Status: "failed",
			Error:  err.Error(),
			Depth:  task.Depth,
		})
		log.Printf("worker %d: fetch failed %s: %v", workerID, task.URL, err)
		return
	}

	c.totalCrawled.Add(1)
	doc.Depth = task.Depth
	c.recordEvent(models.CrawlEvent{
		URL:         task.URL,
		Domain:      domain,
		Title:       doc.Title,
		Status:      "ok",
		StatusCode:  doc.StatusCode,
		ContentSize: doc.ContentSize,
		Depth:       task.Depth,
	})
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
	// SafeHTTPClient refuses to connect to private/loopback/link-local/metadata
	// addresses at dial time — on the initial request and on every redirect hop —
	// which is the authoritative SSRF defense (defeats DNS rebinding).
	client := urlutil.SafeHTTPClient(c.requestTimeout, func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return fmt.Errorf("too many redirects")
		}
		return nil
	})

	req, err := http.NewRequestWithContext(c.ctx, "GET", rawURL, nil)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")

	ttfbStart := time.Now()
	resp, err := client.Do(req)
	ttfbMs := int(time.Since(ttfbStart).Milliseconds())
	if err != nil {
		return nil, nil, nil, fmt.Errorf("HTTP request: %w", err)
	}
	defer resp.Body.Close()

	// Handle 429 Too Many Requests and 503 Service Unavailable with Retry-After
	if resp.StatusCode == 429 || resp.StatusCode == 503 {
		retryDelay := parseRetryAfter(resp.Header.Get("Retry-After"))
		domain := urlutil.ExtractDomain(rawURL)
		c.rateLimiter.SetDomainDelay(domain, retryDelay)
		return nil, nil, nil, fmt.Errorf("HTTP %d (backoff %s)", resp.StatusCode, retryDelay)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// Check content type — handle non-HTML documents (PDF, text, etc.)
	ct := resp.Header.Get("Content-Type")
	if ct != "" && !strings.Contains(ct, "text/html") && !strings.Contains(ct, "application/xhtml") {
		if SupportedContentType(ct) {
			// Read body and extract text from document
			docBody, readErr := io.ReadAll(io.LimitReader(resp.Body, int64(c.maxBodyBytes)))
			if readErr != nil {
				return nil, nil, nil, fmt.Errorf("read doc body: %w", readErr)
			}
			var title, content string
			if strings.Contains(ct, "application/pdf") {
				title, content = extractPDFText(docBody, rawURL)
			} else {
				title, content = extractPlainText(docBody, rawURL)
			}
			if content == "" {
				return nil, nil, nil, fmt.Errorf("no text extracted from %s", ct)
			}
			doc := &models.Document{
				ID:          models.DocumentID(rawURL),
				URL:         rawURL,
				Domain:      urlutil.ExtractDomain(rawURL),
				Title:       title,
				Content:     content,
				ContentSize: len(content),
				StatusCode:  resp.StatusCode,
				CrawledAt:   time.Now(),
				IsHTTPS:     strings.HasPrefix(rawURL, "https://"),
			}
			doc.ComputeHash()
			return doc, nil, docBody, nil
		}
		return nil, nil, nil, fmt.Errorf("not HTML: %s", ct)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, int64(c.maxBodyBytes)))
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

	// Extract robot directives from <meta name="robots"> and X-Robots-Tag header
	robotsMeta := ExtractRobotsMeta(goDoc)
	if xrt := resp.Header.Get("X-Robots-Tag"); xrt != "" {
		MergeXRobotsTag(&robotsMeta, xrt)
	}

	headings := ExtractHeadings(goDoc)
	images := ExtractImages(goDoc, rawURL)
	links, discoveredURLs := ExtractLinks(goDoc, rawURL, robotsMeta.NoFollow)
	structuredData := ExtractStructuredData(goDoc)

	// ExtractContent removes script/style/nav/header/footer — call last
	title, description, content := ExtractContent(goDoc, rawURL)

	// Enrich images with surrounding context for image search
	enrichImageContext(images, content)

	// Canonical enforcement: if canonical differs, index under canonical URL
	docURL := rawURL
	docID := models.DocumentID(rawURL)
	if canonical != "" && urlutil.Normalize(canonical) != urlutil.Normalize(rawURL) {
		docURL = canonical
		docID = models.DocumentID(canonical)
	}

	doc := &models.Document{
		ID:             docID,
		URL:            docURL,
		Domain:         urlutil.ExtractDomain(rawURL),
		Title:          title,
		Description:    description,
		Content:        content,
		ContentSize:    len(content),
		Links:          links,
		Images:         images,
		Headings:       headings,
		StatusCode:     resp.StatusCode,
		CrawledAt:      time.Now(),
		OGTitle:        ogTitle,
		OGDesc:         ogDesc,
		Canonical:      canonical,
		NoIndex:        robotsMeta.NoIndex,
		NoFollow:       robotsMeta.NoFollow,
		RobotsMeta:     robotsMeta.Raw,
		XRobotsTag:     resp.Header.Get("X-Robots-Tag"),
		IsHTTPS:        strings.HasPrefix(rawURL, "https://"),
		StructuredData: structuredData,
		SchemaType:     PrimarySchemaType(structuredData),
	}

	// Merge meta keywords into document keywords
	if len(metaKeywords) > 0 {
		doc.Keywords = metaKeywords
	}

	// Performance metrics
	doc.TTFB = ttfbMs
	doc.PageSizeBytes = len(body)
	perfMetrics := ExtractPerformanceMetrics(goDoc)
	doc.ScriptCount = perfMetrics.ScriptCount
	doc.StylesheetCount = perfMetrics.StylesheetCount
	doc.ResourceCount = perfMetrics.ResourceCount
	doc.HasLazyImages = perfMetrics.HasLazyImages
	doc.HasAsyncScripts = perfMetrics.HasAsyncScripts

	// Mobile metrics
	mobileMetrics := ExtractMobileMetrics(goDoc)
	doc.HasViewportMeta = mobileMetrics.HasViewportMeta
	doc.ViewportContent = mobileMetrics.ViewportContent
	doc.HasMediaQueries = mobileMetrics.HasMediaQueries
	doc.HasFlexboxGrid = mobileMetrics.HasFlexboxGrid
	doc.HasTouchIcons = mobileMetrics.HasTouchIcons
	doc.SmallFontCount = mobileMetrics.SmallFontCount
	doc.SmallTapTargets = mobileMetrics.SmallTapTargets

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

	// Extract robot directives from <meta name="robots"> (no X-Robots-Tag in headless)
	robotsMeta := ExtractRobotsMeta(goDoc)

	headings := ExtractHeadings(goDoc)
	images := ExtractImages(goDoc, rawURL)
	links, discoveredURLs := ExtractLinks(goDoc, rawURL, robotsMeta.NoFollow)
	structuredData := ExtractStructuredData(goDoc)
	title, description, content := ExtractContent(goDoc, rawURL)

	enrichImageContext(images, content)

	// Canonical enforcement
	docURL := rawURL
	docID := models.DocumentID(rawURL)
	if canonical != "" && urlutil.Normalize(canonical) != urlutil.Normalize(rawURL) {
		docURL = canonical
		docID = models.DocumentID(canonical)
	}

	doc := &models.Document{
		ID:             docID,
		URL:            docURL,
		Domain:         urlutil.ExtractDomain(rawURL),
		Title:          title,
		Description:    description,
		Content:        content,
		ContentSize:    len(content),
		Links:          links,
		Images:         images,
		Headings:       headings,
		StatusCode:     200,
		CrawledAt:      time.Now(),
		OGTitle:        ogTitle,
		OGDesc:         ogDesc,
		Canonical:      canonical,
		NoIndex:        robotsMeta.NoIndex,
		NoFollow:       robotsMeta.NoFollow,
		RobotsMeta:     robotsMeta.Raw,
		IsHTTPS:        strings.HasPrefix(rawURL, "https://"),
		StructuredData: structuredData,
		SchemaType:     PrimarySchemaType(structuredData),
	}

	if len(metaKeywords) > 0 {
		doc.Keywords = metaKeywords
	}

	// Performance metrics (no TTFB for headless)
	doc.PageSizeBytes = len(html)
	perfMetrics := ExtractPerformanceMetrics(goDoc)
	doc.ScriptCount = perfMetrics.ScriptCount
	doc.StylesheetCount = perfMetrics.StylesheetCount
	doc.ResourceCount = perfMetrics.ResourceCount
	doc.HasLazyImages = perfMetrics.HasLazyImages
	doc.HasAsyncScripts = perfMetrics.HasAsyncScripts

	// Mobile metrics
	mobileMetrics := ExtractMobileMetrics(goDoc)
	doc.HasViewportMeta = mobileMetrics.HasViewportMeta
	doc.ViewportContent = mobileMetrics.ViewportContent
	doc.HasMediaQueries = mobileMetrics.HasMediaQueries
	doc.HasFlexboxGrid = mobileMetrics.HasFlexboxGrid
	doc.HasTouchIcons = mobileMetrics.HasTouchIcons
	doc.SmallFontCount = mobileMetrics.SmallFontCount
	doc.SmallTapTargets = mobileMetrics.SmallTapTargets

	doc.ComputeHash()

	return doc, discoveredURLs, nil
}

// parseRetryAfter parses a Retry-After header value (seconds or HTTP-date).
// Returns a duration between 1s and 5min, defaulting to 30s on parse failure.
func parseRetryAfter(header string) time.Duration {
	const (
		defaultBackoff = 30 * time.Second
		maxBackoff     = 5 * time.Minute
	)

	if header == "" {
		return defaultBackoff
	}

	header = strings.TrimSpace(header)

	// Try parsing as integer seconds
	var n int
	if _, err := fmt.Sscanf(header, "%d", &n); err == nil {
		d := time.Duration(n) * time.Second
		if d < time.Second {
			d = time.Second
		}
		if d > maxBackoff {
			d = maxBackoff
		}
		return d
	}

	// Try parsing as HTTP-date (RFC 7231)
	for _, layout := range []string{
		time.RFC1123,
		time.RFC1123Z,
		time.RFC850,
		time.ANSIC,
	} {
		if t, err := time.Parse(layout, header); err == nil {
			d := time.Until(t)
			if d < time.Second {
				d = time.Second
			}
			if d > maxBackoff {
				d = maxBackoff
			}
			return d
		}
	}

	return defaultBackoff
}
