package store

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/dgraph-io/badger/v4"
)

// TrendStore tracks hourly-bucketed counters for crawl and query activity.
// Keys: trend:crawl:{domain}:{hour}, trend:query:{term}:{hour}
type TrendStore struct {
	db *BadgerStore
}

// TrendItem represents a trending item with velocity metrics.
type TrendItem struct {
	Name          string  `json:"name"`
	CurrentRate   float64 `json:"current_rate"`
	AverageRate   float64 `json:"average_rate"`
	VelocityRatio float64 `json:"velocity_ratio"`
	Volume        int64   `json:"volume"`
}

// TrendsResponse holds trending queries and domains.
type TrendsResponse struct {
	TrendingQueries []TrendItem `json:"trending_queries"`
	TrendingDomains []TrendItem `json:"trending_domains"`
	ComputedAt      time.Time   `json:"computed_at"`
}

// NewTrendStore creates a trend store backed by BadgerDB.
func NewTrendStore(db *BadgerStore) *TrendStore {
	return &TrendStore{db: db}
}

func hourBucket(t time.Time) string {
	return t.UTC().Format("2006010215")
}

func trendCrawlKey(domain, hour string) []byte {
	return []byte(fmt.Sprintf("trend:crawl:%s:%s", domain, hour))
}

func trendQueryKey(term, hour string) []byte {
	return []byte(fmt.Sprintf("trend:query:%s:%s", term, hour))
}

func trendAvgKey(kind, name string) []byte {
	return []byte(fmt.Sprintf("trend:avg:%s:%s", kind, name))
}

// IncrementCrawl records a crawl event for a domain.
func (ts *TrendStore) IncrementCrawl(domain string) {
	hour := hourBucket(time.Now())
	ts.increment(trendCrawlKey(domain, hour))
}

// IncrementQuery records search activity for query terms.
func (ts *TrendStore) IncrementQuery(terms []string) {
	hour := hourBucket(time.Now())
	for _, term := range terms {
		term = strings.ToLower(strings.TrimSpace(term))
		if len(term) > 2 {
			ts.increment(trendQueryKey(term, hour))
		}
	}
}

func (ts *TrendStore) increment(key []byte) {
	_ = ts.db.DB().Update(func(txn *badger.Txn) error {
		var count int64
		item, err := txn.Get(key)
		if err == nil {
			_ = item.Value(func(val []byte) error {
				if len(val) == 8 {
					count = int64(binary.BigEndian.Uint64(val))
				}
				return nil
			})
		}
		count++
		buf := make([]byte, 8)
		binary.BigEndian.PutUint64(buf, uint64(count))
		return txn.SetEntry(badger.NewEntry(key, buf).WithTTL(168 * time.Hour)) // 7 days
	})
}

// TrendingDomains returns the top-N trending domains by velocity.
func (ts *TrendStore) TrendingDomains(n int) []TrendItem {
	return ts.trending("trend:crawl:", "trend:avg:crawl:", n)
}

// TrendingQueries returns the top-N trending queries by velocity.
func (ts *TrendStore) TrendingQueries(n int) []TrendItem {
	return ts.trending("trend:query:", "trend:avg:query:", n)
}

func (ts *TrendStore) trending(prefix, avgPrefix string, n int) []TrendItem {
	currentHour := hourBucket(time.Now())

	// Collect current hour counts
	currentCounts := make(map[string]int64)
	_ = ts.db.Scan([]byte(prefix), func(key, val []byte) bool {
		parts := strings.Split(string(key), ":")
		if len(parts) < 4 {
			return true
		}
		hour := parts[len(parts)-1]
		name := strings.Join(parts[2:len(parts)-1], ":")
		if hour == currentHour {
			if len(val) == 8 {
				currentCounts[name] = int64(binary.BigEndian.Uint64(val))
			}
		}
		return true
	})

	// Load averages
	averages := make(map[string]float64)
	_ = ts.db.Scan([]byte(avgPrefix), func(key, val []byte) bool {
		parts := strings.Split(string(key), ":")
		if len(parts) >= 4 {
			name := strings.Join(parts[3:], ":")
			var avg float64
			if err := json.Unmarshal(val, &avg); err == nil {
				averages[name] = avg
			}
		}
		return true
	})

	var items []TrendItem
	for name, count := range currentCounts {
		avg := averages[name]
		if avg < 0.1 {
			avg = 0.1 // avoid division by zero
		}
		velocity := float64(count) / avg
		items = append(items, TrendItem{
			Name:          name,
			CurrentRate:   float64(count),
			AverageRate:   avg,
			VelocityRatio: velocity,
			Volume:        count,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].VelocityRatio > items[j].VelocityRatio
	})

	if len(items) > n {
		items = items[:n]
	}
	return items
}

// ComputeAverages recomputes hourly averages for all tracked items.
func (ts *TrendStore) ComputeAverages() {
	ts.computeAveragesForPrefix("trend:crawl:", "trend:avg:crawl:")
	ts.computeAveragesForPrefix("trend:query:", "trend:avg:query:")
}

func (ts *TrendStore) computeAveragesForPrefix(prefix, avgPrefix string) {
	// Collect total counts per item across all hours
	totals := make(map[string]int64)
	hours := make(map[string]map[string]bool) // item → set of hours

	_ = ts.db.Scan([]byte(prefix), func(key, val []byte) bool {
		parts := strings.Split(string(key), ":")
		if len(parts) < 4 {
			return true
		}
		hour := parts[len(parts)-1]
		name := strings.Join(parts[2:len(parts)-1], ":")
		if len(val) == 8 {
			count := int64(binary.BigEndian.Uint64(val))
			totals[name] += count
			if hours[name] == nil {
				hours[name] = make(map[string]bool)
			}
			hours[name][hour] = true
		}
		return true
	})

	// Compute and store averages
	for name, total := range totals {
		numHours := len(hours[name])
		if numHours == 0 {
			numHours = 1
		}
		avg := float64(total) / float64(numHours)
		data, _ := json.Marshal(avg)
		key := []byte(avgPrefix + name)
		_ = ts.db.Set(key, data)
	}
}

// PruneOldBuckets removes trend entries older than the given retention period.
func (ts *TrendStore) PruneOldBuckets(retention time.Duration) int {
	cutoff := time.Now().Add(-retention)
	cutoffHour := hourBucket(cutoff)
	pruned := 0

	for _, prefix := range []string{"trend:crawl:", "trend:query:"} {
		var keysToDelete [][]byte
		_ = ts.db.Scan([]byte(prefix), func(key, val []byte) bool {
			parts := strings.Split(string(key), ":")
			if len(parts) < 4 {
				return true
			}
			hour := parts[len(parts)-1]
			if hour < cutoffHour {
				keysToDelete = append(keysToDelete, append([]byte{}, key...))
			}
			return true
		})

		for _, k := range keysToDelete {
			if err := ts.db.Delete(k); err == nil {
				pruned++
			}
		}
	}

	return pruned
}

// GetVolume returns the total volume for an item over the past N hours.
func (ts *TrendStore) GetVolume(kind, name string, hours int) int64 {
	now := time.Now()
	var total int64
	prefix := fmt.Sprintf("trend:%s:%s:", kind, name)

	cutoff := hourBucket(now.Add(-time.Duration(hours) * time.Hour))

	_ = ts.db.Scan([]byte(prefix), func(key, val []byte) bool {
		parts := strings.Split(string(key), ":")
		hour := parts[len(parts)-1]
		if hour >= cutoff && len(val) == 8 {
			total += int64(binary.BigEndian.Uint64(val))
		}
		return true
	})

	return total
}

// GetTrends returns the full trends response.
func (ts *TrendStore) GetTrends() *TrendsResponse {
	return &TrendsResponse{
		TrendingQueries: ts.TrendingQueries(20),
		TrendingDomains: ts.TrendingDomains(20),
		ComputedAt:      time.Now(),
	}
}

// Spike detection: items with velocity ratio > threshold
func (ts *TrendStore) DetectSpikes(threshold float64) []TrendItem {
	var spikes []TrendItem
	for _, item := range ts.TrendingQueries(50) {
		if item.VelocityRatio > threshold && !math.IsInf(item.VelocityRatio, 0) {
			spikes = append(spikes, item)
		}
	}
	for _, item := range ts.TrendingDomains(50) {
		if item.VelocityRatio > threshold && !math.IsInf(item.VelocityRatio, 0) {
			spikes = append(spikes, item)
		}
	}
	return spikes
}
