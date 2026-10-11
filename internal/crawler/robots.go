package crawler

import (
	"fmt"
	"io"
	"log"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/doogle/doogle-v2/pkg/urlutil"
)

// RobotsCache caches robots.txt data per domain (RFC 9309 compliant).
type RobotsCache struct {
	cache map[string]*robotsEntry
	mu    sync.RWMutex
}

type robotsEntry struct {
	groups    []robotsGroup
	sitemaps  []string
	fetchedAt time.Time
}

type robotsGroup struct {
	agents     []string      // user-agent tokens (lowercased)
	rules      []robotsRule  // allow/disallow rules
	crawlDelay time.Duration
}

type robotsRule struct {
	pattern string
	allow   bool
	regex   *regexp.Regexp
	length  int // original pattern length for specificity
}

// NewRobotsCache creates a new robots.txt cache.
func NewRobotsCache() *RobotsCache {
	return &RobotsCache{
		cache: make(map[string]*robotsEntry),
	}
}

// IsAllowed checks if the given path is allowed by the domain's robots.txt.
func (rc *RobotsCache) IsAllowed(domain, path, userAgent string) bool {
	entry := rc.getOrFetch(domain, userAgent)

	group := rc.matchGroup(entry, userAgent)
	if group == nil {
		return true // no matching group → allow
	}

	return rc.evaluateRules(group.rules, path)
}

// GetCrawlDelay returns the Crawl-delay for the given domain and user agent.
// Returns 0 if no Crawl-delay is specified.
func (rc *RobotsCache) GetCrawlDelay(domain, userAgent string) time.Duration {
	entry := rc.getOrFetch(domain, userAgent)

	group := rc.matchGroup(entry, userAgent)
	if group == nil {
		return 0
	}
	return group.crawlDelay
}

// GetSitemaps returns Sitemap URLs declared in the domain's robots.txt.
func (rc *RobotsCache) GetSitemaps(domain, userAgent string) []string {
	entry := rc.getOrFetch(domain, userAgent)
	return entry.sitemaps
}

func (rc *RobotsCache) getOrFetch(domain, userAgent string) *robotsEntry {
	rc.mu.RLock()
	entry, exists := rc.cache[domain]
	rc.mu.RUnlock()

	if !exists || time.Since(entry.fetchedAt) > 24*time.Hour {
		entry = rc.fetch(domain, userAgent)
		rc.mu.Lock()
		rc.cache[domain] = entry
		rc.mu.Unlock()
	}
	return entry
}

// matchGroup finds the most specific matching group for the given user agent.
// Most specific = longest matching agent token. Falls back to "*".
func (rc *RobotsCache) matchGroup(entry *robotsEntry, userAgent string) *robotsGroup {
	uaLower := strings.ToLower(userAgent)

	var bestGroup *robotsGroup
	bestLen := -1

	for i := range entry.groups {
		g := &entry.groups[i]
		for _, agent := range g.agents {
			if agent == "*" {
				if bestLen < 0 {
					bestGroup = g
					bestLen = 0
				}
			} else if strings.Contains(uaLower, agent) && len(agent) > bestLen {
				bestGroup = g
				bestLen = len(agent)
			}
		}
	}
	return bestGroup
}

// evaluateRules checks path against allow/disallow rules.
// Longest matching pattern wins. On tie, Allow wins (RFC 9309 §2.2.2).
func (rc *RobotsCache) evaluateRules(rules []robotsRule, path string) bool {
	bestLen := -1
	bestAllow := true

	for _, r := range rules {
		if r.regex != nil && r.regex.MatchString(path) {
			if r.length > bestLen || (r.length == bestLen && r.allow) {
				bestLen = r.length
				bestAllow = r.allow
			}
		}
	}
	return bestAllow
}

func (rc *RobotsCache) fetch(domain, userAgent string) *robotsEntry {
	entry := &robotsEntry{fetchedAt: time.Now()}

	client := urlutil.SafeHTTPClient(10*time.Second, nil)
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

	entry.groups, entry.sitemaps = parseRobotsTxt(string(body))
	return entry
}

// compilePattern converts a robots.txt path pattern into a regexp.
// '*' → '.*', '$' at end → anchor, everything else escaped.
// Patterns longer than 1024 characters are rejected to prevent ReDoS.
func compilePattern(pattern string) *regexp.Regexp {
	if pattern == "" || len(pattern) > 1024 {
		return nil
	}

	var b strings.Builder
	b.WriteString("^")

	hasTrailingDollar := strings.HasSuffix(pattern, "$")
	p := pattern
	if hasTrailingDollar {
		p = p[:len(p)-1]
	}

	for _, seg := range strings.Split(p, "*") {
		b.WriteString(regexp.QuoteMeta(seg))
		b.WriteString(".*")
	}
	// Remove trailing ".*" since we always append it
	s := b.String()
	s = s[:len(s)-2]

	if hasTrailingDollar {
		s += "$"
	}

	re, err := regexp.Compile(s)
	if err != nil {
		log.Printf("robots: invalid pattern %q: %v", pattern, err)
		return nil
	}
	return re
}

func parseRobotsTxt(content string) ([]robotsGroup, []string) {
	var groups []robotsGroup
	var sitemaps []string
	lines := strings.Split(content, "\n")

	const maxRulesPerGroup = 500
	const maxGroups = 100
	var currentGroup *robotsGroup
	startNewGroup := true

	for _, line := range lines {
		// Strip inline comments
		if idx := strings.Index(line, "#"); idx >= 0 {
			line = line[:idx]
		}
		line = strings.TrimSpace(line)
		if line == "" {
			startNewGroup = true
			continue
		}

		colon := strings.IndexByte(line, ':')
		if colon < 0 {
			continue
		}
		directive := strings.ToLower(strings.TrimSpace(line[:colon]))
		value := strings.TrimSpace(line[colon+1:])

		switch directive {
		case "user-agent":
			if startNewGroup {
				if len(groups) >= maxGroups {
					continue
				}
				groups = append(groups, robotsGroup{})
				currentGroup = &groups[len(groups)-1]
				startNewGroup = false
			}
			if currentGroup != nil {
				currentGroup.agents = append(currentGroup.agents, strings.ToLower(value))
			}

		case "disallow":
			startNewGroup = false
			if currentGroup != nil && len(currentGroup.rules) < maxRulesPerGroup {
				re := compilePattern(value)
				if re != nil {
					currentGroup.rules = append(currentGroup.rules, robotsRule{
						pattern: value,
						allow:   false,
						regex:   re,
						length:  len(value),
					})
				}
			}

		case "allow":
			startNewGroup = false
			if currentGroup != nil && len(currentGroup.rules) < maxRulesPerGroup {
				re := compilePattern(value)
				if re != nil {
					currentGroup.rules = append(currentGroup.rules, robotsRule{
						pattern: value,
						allow:   true,
						regex:   re,
						length:  len(value),
					})
				}
			}

		case "crawl-delay":
			startNewGroup = false
			if currentGroup != nil {
				if secs, err := strconv.ParseFloat(value, 64); err == nil {
					delay := time.Duration(secs * float64(time.Second))
					if delay > 60*time.Second {
						delay = 60 * time.Second // cap at 60s
					}
					if delay > 0 {
						currentGroup.crawlDelay = delay
					}
				}
			}

		case "sitemap":
			if value != "" {
				sitemaps = append(sitemaps, value)
			}
		}
	}

	// Fix up: ensure the groups slice pointers are stable
	// (we took addresses of slice elements above which is valid since we only append)

	return groups, sitemaps
}
