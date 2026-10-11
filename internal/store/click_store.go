package store

import (
	"encoding/binary"
	"fmt"
	"math"
	"sort"
	"strings"
)

// ClickStore records search result click signals for learn-to-rank.
type ClickStore struct {
	db *BadgerStore
}

// NewClickStore creates a ClickStore backed by BadgerDB.
func NewClickStore(db *BadgerStore) *ClickStore {
	return &ClickStore{db: db}
}

// RecordClick stores a click event: which URL was clicked for a given query at a given position.
func (cs *ClickStore) RecordClick(query, url string, position int) {
	key := fmt.Sprintf("click:%s:%s", query, url)

	// Increment click count
	var count uint64
	if data, err := cs.db.Get([]byte(key)); err == nil && len(data) >= 8 {
		count = binary.BigEndian.Uint64(data)
	}
	count++

	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, count)
	_ = cs.db.Set([]byte(key), buf)

	// Also record last position for this query+url pair
	posKey := fmt.Sprintf("click_pos:%s:%s", query, url)
	posBuf := make([]byte, 8)
	binary.BigEndian.PutUint64(posBuf, uint64(position))
	_ = cs.db.Set([]byte(posKey), posBuf)
}

// GetClickCount returns how many times a URL was clicked for a query.
func (cs *ClickStore) GetClickCount(query, url string) uint64 {
	key := fmt.Sprintf("click:%s:%s", query, url)
	data, err := cs.db.Get([]byte(key))
	if err != nil || len(data) < 8 {
		return 0
	}
	return binary.BigEndian.Uint64(data)
}

// ClickRecord represents a single click entry for training.
type ClickRecord struct {
	Query    string
	URL      string
	Clicks   uint64
	Position uint64
}

// AllClicks iterates all click records grouped by query.
// Returns a map of query → []ClickRecord sorted by click count descending.
func (cs *ClickStore) AllClicks() map[string][]ClickRecord {
	byQuery := make(map[string][]ClickRecord)

	_ = cs.db.Scan([]byte("click:"), func(key, val []byte) bool {
		k := string(key)
		// Skip position keys
		if strings.HasPrefix(k, "click_pos:") {
			return true
		}
		// Parse "click:{query}:{url}" — use Index not LastIndex since URLs contain colons
		rest := strings.TrimPrefix(k, "click:")
		idx := strings.Index(rest, ":")
		if idx <= 0 {
			return true
		}
		query := rest[:idx]
		url := rest[idx+1:]

		var clicks uint64
		if len(val) >= 8 {
			clicks = binary.BigEndian.Uint64(val)
		}

		var position uint64
		posKey := fmt.Sprintf("click_pos:%s:%s", query, url)
		if posData, err := cs.db.Get([]byte(posKey)); err == nil && len(posData) >= 8 {
			position = binary.BigEndian.Uint64(posData)
		}

		byQuery[query] = append(byQuery[query], ClickRecord{
			Query:    query,
			URL:      url,
			Clicks:   clicks,
			Position: position,
		})
		return true
	})

	return byQuery
}

// TotalClickPairs returns the approximate number of pairwise training examples
// available (each query with N clicked URLs produces N*(N-1)/2 pairs, plus
// each clicked URL paired against non-clicked results shown above it).
func (cs *ClickStore) TotalClickPairs() int {
	total := 0
	byQuery := cs.AllClicks()
	for _, records := range byQuery {
		n := len(records)
		// Each pair of URLs with different click counts is a training pair
		total += n * (n - 1) / 2
	}
	return total
}

// RecordImpression increments the impression count for a query-URL pair.
func (cs *ClickStore) RecordImpression(query, url string, position int) error {
	key := fmt.Sprintf("click_imp:%s:%s", query, url)
	cs.incrUint64(key)
	return nil
}

// RecordDwell records cumulative dwell time for a query-URL pair.
func (cs *ClickStore) RecordDwell(query, url string, dwellMs int64) error {
	// Increment cumulative dwell time
	sumKey := fmt.Sprintf("click_dwell:%s:%s", query, url)
	cs.addUint64(sumKey, uint64(dwellMs))

	// Increment dwell event count
	countKey := fmt.Sprintf("click_dwell_n:%s:%s", query, url)
	cs.incrUint64(countKey)
	return nil
}

// RecordPogoStick increments the pogo-stick count for a query-URL pair.
func (cs *ClickStore) RecordPogoStick(query, url string) error {
	key := fmt.Sprintf("click_pogo:%s:%s", query, url)
	cs.incrUint64(key)
	return nil
}

// CTR returns the position-debiased click-through rate for a query-URL pair.
func (cs *ClickStore) CTR(query, url string) float64 {
	clicks := cs.GetClickCount(query, url)
	impressions := cs.getUint64(fmt.Sprintf("click_imp:%s:%s", query, url))
	if impressions == 0 {
		return 0
	}
	rawCTR := float64(clicks) / float64(impressions)

	// Position bias correction: examProb(pos) = 1.0 / (1.0 + 0.5 * ln(pos + 1))
	posKey := fmt.Sprintf("click_pos:%s:%s", query, url)
	pos := cs.getUint64(posKey)
	if pos == 0 {
		pos = 1
	}
	examProb := 1.0 / (1.0 + 0.5*math.Log(float64(pos)+1))
	if examProb < 0.01 {
		examProb = 0.01
	}
	return rawCTR / examProb
}

// AvgDwellSeconds returns the average dwell time in seconds for a query-URL pair.
func (cs *ClickStore) AvgDwellSeconds(query, url string) float64 {
	sumMs := cs.getUint64(fmt.Sprintf("click_dwell:%s:%s", query, url))
	count := cs.getUint64(fmt.Sprintf("click_dwell_n:%s:%s", query, url))
	if count == 0 {
		return 0
	}
	return float64(sumMs) / float64(count) / 1000.0
}

// PogoStickRate returns the fraction of clicks that resulted in a pogo-stick.
func (cs *ClickStore) PogoStickRate(query, url string) float64 {
	clicks := cs.GetClickCount(query, url)
	if clicks == 0 {
		return 0
	}
	pogo := cs.getUint64(fmt.Sprintf("click_pogo:%s:%s", query, url))
	return float64(pogo) / float64(clicks)
}

// DomainCTR returns the aggregate CTR across all query-URL pairs for a domain.
func (cs *ClickStore) DomainCTR(domain string) float64 {
	var totalClicks, totalImpressions uint64

	_ = cs.db.Scan([]byte("click_imp:"), func(key, val []byte) bool {
		k := string(key)
		rest := strings.TrimPrefix(k, "click_imp:")
		idx := strings.Index(rest, ":")
		if idx <= 0 {
			return true
		}
		url := rest[idx+1:]
		if extractDomainFromURL(url) == domain {
			if len(val) >= 8 {
				totalImpressions += binary.BigEndian.Uint64(val)
			}
			// Get corresponding clicks
			query := rest[:idx]
			totalClicks += cs.GetClickCount(query, url)
		}
		return true
	})

	if totalImpressions == 0 {
		return 0
	}
	return float64(totalClicks) / float64(totalImpressions)
}

// DomainAvgDwell returns the average dwell time in seconds across all query-URL pairs for a domain.
func (cs *ClickStore) DomainAvgDwell(domain string) float64 {
	var totalMs, totalCount uint64

	_ = cs.db.Scan([]byte("click_dwell:"), func(key, val []byte) bool {
		k := string(key)
		if strings.HasPrefix(k, "click_dwell_n:") {
			return true
		}
		rest := strings.TrimPrefix(k, "click_dwell:")
		idx := strings.Index(rest, ":")
		if idx <= 0 {
			return true
		}
		url := rest[idx+1:]
		if extractDomainFromURL(url) == domain {
			if len(val) >= 8 {
				totalMs += binary.BigEndian.Uint64(val)
			}
			query := rest[:idx]
			totalCount += cs.getUint64(fmt.Sprintf("click_dwell_n:%s:%s", query, url))
		}
		return true
	})

	if totalCount == 0 {
		return 0
	}
	return float64(totalMs) / float64(totalCount) / 1000.0
}

// DomainSearchVolume returns the total number of impressions for a domain.
func (cs *ClickStore) DomainSearchVolume(domain string) int64 {
	var total int64
	_ = cs.db.Scan([]byte("click_imp:"), func(key, val []byte) bool {
		k := string(key)
		rest := strings.TrimPrefix(k, "click_imp:")
		idx := strings.Index(rest, ":")
		if idx <= 0 {
			return true
		}
		url := rest[idx+1:]
		if extractDomainFromURL(url) == domain && len(val) >= 8 {
			total += int64(binary.BigEndian.Uint64(val))
		}
		return true
	})
	return total
}

// PopularQueries returns the top-N queries by total click count.
func (cs *ClickStore) PopularQueries(n int) []string {
	queryCounts := make(map[string]uint64)

	_ = cs.db.Scan([]byte("click:"), func(key, val []byte) bool {
		k := string(key)
		if strings.HasPrefix(k, "click_pos:") || strings.HasPrefix(k, "click_imp:") ||
			strings.HasPrefix(k, "click_dwell:") || strings.HasPrefix(k, "click_dwell_n:") ||
			strings.HasPrefix(k, "click_pogo:") {
			return true
		}
		rest := strings.TrimPrefix(k, "click:")
		idx := strings.Index(rest, ":")
		if idx <= 0 {
			return true
		}
		query := rest[:idx]
		var clicks uint64
		if len(val) >= 8 {
			clicks = binary.BigEndian.Uint64(val)
		}
		queryCounts[query] += clicks
		return true
	})

	type qc struct {
		query string
		count uint64
	}
	var sorted []qc
	for q, c := range queryCounts {
		sorted = append(sorted, qc{q, c})
	}
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].count > sorted[j].count })

	if len(sorted) > n {
		sorted = sorted[:n]
	}
	result := make([]string, len(sorted))
	for i, s := range sorted {
		result[i] = s.query
	}
	return result
}

// --- helpers ---

func (cs *ClickStore) incrUint64(key string) {
	cs.addUint64(key, 1)
}

func (cs *ClickStore) addUint64(key string, delta uint64) {
	var current uint64
	if data, err := cs.db.Get([]byte(key)); err == nil && len(data) >= 8 {
		current = binary.BigEndian.Uint64(data)
	}
	current += delta
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, current)
	_ = cs.db.Set([]byte(key), buf)
}

func (cs *ClickStore) getUint64(key string) uint64 {
	data, err := cs.db.Get([]byte(key))
	if err != nil || len(data) < 8 {
		return 0
	}
	return binary.BigEndian.Uint64(data)
}

// extractDomainFromURL extracts the domain from a URL string.
func extractDomainFromURL(rawURL string) string {
	// Simple extraction: find :// then next /
	idx := strings.Index(rawURL, "://")
	if idx < 0 {
		return rawURL
	}
	rest := rawURL[idx+3:]
	if end := strings.IndexByte(rest, '/'); end > 0 {
		rest = rest[:end]
	}
	// Remove port
	if end := strings.LastIndexByte(rest, ':'); end > 0 {
		rest = rest[:end]
	}
	// Remove www. prefix
	rest = strings.TrimPrefix(rest, "www.")
	return rest
}
