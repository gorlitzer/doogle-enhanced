package crawler

import (
	"context"
	"log"
	"sync"
	"time"
)

// RateLimiter handles per-domain rate limiting.
type RateLimiter struct {
	limits      map[string]*domainLimit
	mu          sync.Mutex
	globalDelay time.Duration
}

type domainLimit struct {
	lastRequest  time.Time
	requestCount int
	windowStart  time.Time
	maxRequests  int
	windowSize   time.Duration
	crawlDelay   time.Duration // from robots.txt Crawl-delay
}

// NewRateLimiter creates a rate limiter with the given global delay between requests.
func NewRateLimiter(globalDelay time.Duration) *RateLimiter {
	return &RateLimiter{
		limits:      make(map[string]*domainLimit),
		globalDelay: globalDelay,
	}
}

// SetDomainDelay sets a per-domain crawl delay (e.g. from robots.txt Crawl-delay or Retry-After).
func (rl *RateLimiter) SetDomainDelay(domain string, delay time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	limit, exists := rl.limits[domain]
	if !exists {
		limit = &domainLimit{
			windowStart: time.Now(),
		}
		rl.limits[domain] = limit
	}
	limit.crawlDelay = delay
}

// Wait blocks until it's safe to make a request to the given domain.
func (rl *RateLimiter) Wait(domain string, maxRequests int, window time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	// getLimit fetches (or recreates) the domain's limit. It is re-called after
	// every unlock/sleep because Cleanup may have deleted the entry meanwhile —
	// mutating the old orphaned pointer would silently lose the rate accounting.
	getLimit := func() *domainLimit {
		limit, exists := rl.limits[domain]
		if !exists {
			limit = &domainLimit{
				maxRequests: maxRequests,
				windowSize:  window,
				windowStart: time.Now(),
			}
			rl.limits[domain] = limit
		}
		return limit
	}

	limit := getLimit()
	now := time.Now()

	// Reset window if expired
	if now.Sub(limit.windowStart) > limit.windowSize {
		limit.requestCount = 0
		limit.windowStart = now
	}

	// If rate exceeded, wait for window reset
	if limit.requestCount >= limit.maxRequests {
		waitTime := limit.windowStart.Add(limit.windowSize).Sub(now)
		if waitTime > 0 {
			rl.mu.Unlock()
			time.Sleep(waitTime)
			rl.mu.Lock()
			limit = getLimit() // entry may have been deleted during the sleep
			now = time.Now()   // the pre-sleep 'now' is stale
			limit.requestCount = 0
			limit.windowStart = now
		}
	}

	// Per-request delay: max(globalDelay, crawlDelay)
	delay := rl.globalDelay
	if limit.crawlDelay > delay {
		delay = limit.crawlDelay
	}
	if !limit.lastRequest.IsZero() {
		elapsed := now.Sub(limit.lastRequest)
		if elapsed < delay {
			rl.mu.Unlock()
			time.Sleep(delay - elapsed)
			rl.mu.Lock()
			limit = getLimit() // re-fetch after sleep
		}
	}

	limit.requestCount++
	limit.lastRequest = time.Now()
}

// Cleanup periodically removes stale domain entries.
func (rl *RateLimiter) Cleanup(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			rl.mu.Lock()
			now := time.Now()
			for domain, limit := range rl.limits {
				if now.Sub(limit.lastRequest) > time.Hour {
					delete(rl.limits, domain)
					log.Printf("rate limiter: cleaned up domain %s", domain)
				}
			}
			rl.mu.Unlock()
		}
	}
}
