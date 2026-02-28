package crawler

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// RobotsCache caches robots.txt data per domain.
type RobotsCache struct {
	cache map[string]*robotsEntry
	mu    sync.RWMutex
}

type robotsEntry struct {
	disallowed []string
	fetchedAt  time.Time
}

// NewRobotsCache creates a new robots.txt cache.
func NewRobotsCache() *RobotsCache {
	return &RobotsCache{
		cache: make(map[string]*robotsEntry),
	}
}

// IsAllowed checks if the given path is allowed by the domain's robots.txt.
func (rc *RobotsCache) IsAllowed(domain, path, userAgent string) bool {
	rc.mu.RLock()
	entry, exists := rc.cache[domain]
	rc.mu.RUnlock()

	if !exists || time.Since(entry.fetchedAt) > 24*time.Hour {
		// Fetch fresh robots.txt
		entry = rc.fetch(domain, userAgent)
		rc.mu.Lock()
		rc.cache[domain] = entry
		rc.mu.Unlock()
	}

	for _, disallow := range entry.disallowed {
		if strings.HasPrefix(path, disallow) {
			return false
		}
	}
	return true
}

func (rc *RobotsCache) fetch(domain, userAgent string) *robotsEntry {
	entry := &robotsEntry{fetchedAt: time.Now()}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(fmt.Sprintf("https://%s/robots.txt", domain))
	if err != nil {
		// Try HTTP fallback
		resp, err = client.Get(fmt.Sprintf("http://%s/robots.txt", domain))
		if err != nil {
			return entry // Allow all if robots.txt unreachable
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return entry
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return entry
	}

	entry.disallowed = parseRobotsTxt(string(body), userAgent)
	return entry
}

func parseRobotsTxt(content, targetAgent string) []string {
	var disallowed []string
	lines := strings.Split(content, "\n")
	currentAgent := ""
	appliesToUs := false

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if strings.HasPrefix(strings.ToLower(line), "user-agent:") {
			agent := strings.TrimSpace(line[len("user-agent:"):])
			currentAgent = strings.ToLower(agent)
			appliesToUs = currentAgent == "*" || strings.Contains(strings.ToLower(targetAgent), currentAgent)
			continue
		}

		if appliesToUs && strings.HasPrefix(strings.ToLower(line), "disallow:") {
			path := strings.TrimSpace(line[len("disallow:"):])
			if path != "" {
				disallowed = append(disallowed, path)
			}
		}

		_ = currentAgent // used in the agent matching above
	}

	return disallowed
}
