package node

import (
	"strings"
)

// URLFilter checks URLs and domains against the operator-configured allowlist/denylist.
type URLFilter struct {
	domainAllowlist map[string]bool
	domainDenylist  map[string]bool
	urlAllowlist    []string
	urlDenylist     []string
	hasDomainAllow  bool
	hasURLAllow     bool
}

// NewURLFilter creates a filter from the trust config.
func NewURLFilter(cfg TrustConfig) *URLFilter {
	f := &URLFilter{}

	if len(cfg.DomainAllowlist) > 0 {
		f.domainAllowlist = make(map[string]bool, len(cfg.DomainAllowlist))
		for _, d := range cfg.DomainAllowlist {
			f.domainAllowlist[strings.ToLower(strings.TrimSpace(d))] = true
		}
		f.hasDomainAllow = true
	}

	if len(cfg.DomainDenylist) > 0 {
		f.domainDenylist = make(map[string]bool, len(cfg.DomainDenylist))
		for _, d := range cfg.DomainDenylist {
			f.domainDenylist[strings.ToLower(strings.TrimSpace(d))] = true
		}
	}

	for _, u := range cfg.URLAllowlist {
		f.urlAllowlist = append(f.urlAllowlist, strings.TrimSpace(u))
	}
	f.hasURLAllow = len(f.urlAllowlist) > 0

	for _, u := range cfg.URLDenylist {
		f.urlDenylist = append(f.urlDenylist, strings.TrimSpace(u))
	}

	return f
}

// IsAllowed checks whether a URL is allowed by the filter rules.
// Returns true if the URL passes all filters.
func (f *URLFilter) IsAllowed(rawURL, domain string) bool {
	domain = strings.ToLower(domain)

	// Domain denylist always blocks
	if len(f.domainDenylist) > 0 && f.domainDenylist[domain] {
		return false
	}

	// URL denylist blocks matching prefixes
	for _, prefix := range f.urlDenylist {
		if strings.HasPrefix(rawURL, prefix) {
			return false
		}
	}

	// If domain allowlist is set, domain must be in it
	if f.hasDomainAllow && !f.domainAllowlist[domain] {
		return false
	}

	// If URL allowlist is set, URL must match at least one prefix
	if f.hasURLAllow {
		matched := false
		for _, prefix := range f.urlAllowlist {
			if strings.HasPrefix(rawURL, prefix) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}

	return true
}

// IsEmpty returns true if no filter rules are configured.
func (f *URLFilter) IsEmpty() bool {
	return !f.hasDomainAllow && len(f.domainDenylist) == 0 &&
		!f.hasURLAllow && len(f.urlDenylist) == 0
}
