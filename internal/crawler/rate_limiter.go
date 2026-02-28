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
}

// NewRateLimiter creates a rate limiter with the given global delay between requests.
func NewRateLimiter(globalDelay time.Duration) *RateLimiter {
	return &RateLimiter{
		limits:      make(map[string]*domainLimit),
		globalDelay: globalDelay,
	}
}

// Wait blocks until it's safe to make a request to the given domain.
func (rl *RateLimiter) Wait(domain string, maxRequests int, window time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	limit, exists := rl.limits[domain]
	if !exists {
		limit = &domainLimit{
			maxRequests: maxRequests,
			windowSize:  window,
			windowStart: time.Now(),
		}
		rl.limits[domain] = limit
	}

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
			limit.requestCount = 0
			limit.windowStart = time.Now()
		}
	}

	// Global delay between requests
	if !limit.lastRequest.IsZero() {
		elapsed := now.Sub(limit.lastRequest)
		if elapsed < rl.globalDelay {
			rl.mu.Unlock()
			time.Sleep(rl.globalDelay - elapsed)
			rl.mu.Lock()
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
