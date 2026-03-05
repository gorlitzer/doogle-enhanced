package node

import (
	"log"
	"sync"
	"time"
)

// PeerRateLimiter tracks per-peer message rates and detects flood patterns.
// Peers exceeding the rate limit are temporarily blocked.
type PeerRateLimiter struct {
	mu       sync.Mutex
	windows  map[string]*rateBucket
	limit    int           // max messages per window
	window   time.Duration // time window
	blockFor time.Duration // how long to block offenders
}

type rateBucket struct {
	count     int
	windowEnd time.Time
	blockedAt time.Time
}

// NewPeerRateLimiter creates a rate limiter with the given parameters.
// limit: max messages per window. window: duration of each window.
func NewPeerRateLimiter(limit int, window, blockFor time.Duration) *PeerRateLimiter {
	return &PeerRateLimiter{
		windows:  make(map[string]*rateBucket),
		limit:    limit,
		window:   window,
		blockFor: blockFor,
	}
}

// Allow checks whether a peer is allowed to send a message.
// Returns true if allowed, false if rate-limited or blocked.
func (rl *PeerRateLimiter) Allow(peerID string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	bucket, ok := rl.windows[peerID]
	if !ok {
		rl.windows[peerID] = &rateBucket{
			count:     1,
			windowEnd: now.Add(rl.window),
		}
		return true
	}

	// Check if peer is blocked
	if !bucket.blockedAt.IsZero() {
		if now.Before(bucket.blockedAt.Add(rl.blockFor)) {
			return false
		}
		// Block expired, reset
		bucket.blockedAt = time.Time{}
		bucket.count = 1
		bucket.windowEnd = now.Add(rl.window)
		return true
	}

	// Check if window has expired
	if now.After(bucket.windowEnd) {
		bucket.count = 1
		bucket.windowEnd = now.Add(rl.window)
		return true
	}

	bucket.count++
	if bucket.count > rl.limit {
		bucket.blockedAt = now
		log.Printf("rate-limiter: blocking peer %s (exceeded %d msgs in %s)",
			truncPeer(peerID), rl.limit, rl.window)
		return false
	}

	return true
}

// IsBlocked returns true if a peer is currently blocked by the rate limiter.
func (rl *PeerRateLimiter) IsBlocked(peerID string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	bucket, ok := rl.windows[peerID]
	if !ok {
		return false
	}
	if bucket.blockedAt.IsZero() {
		return false
	}
	return time.Now().Before(bucket.blockedAt.Add(rl.blockFor))
}

// Cleanup removes expired entries to prevent memory growth.
func (rl *PeerRateLimiter) Cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for peerID, bucket := range rl.windows {
		expired := now.After(bucket.windowEnd)
		unblocked := bucket.blockedAt.IsZero() || now.After(bucket.blockedAt.Add(rl.blockFor))
		if expired && unblocked {
			delete(rl.windows, peerID)
		}
	}
}
