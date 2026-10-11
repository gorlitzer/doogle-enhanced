package indexer

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/dgraph-io/badger/v4"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/store"
)

const domainAuthorityPrefix = "domain_authority:"

// DomainAuthority holds site-level reputation signals.
type DomainAuthority struct {
	Domain          string  `json:"domain"`
	PageCount       int     `json:"page_count"`
	AvgPageRank     float64 `json:"avg_pagerank"`
	AvgQuality      float64 `json:"avg_quality"`
	BacklinkDomains int     `json:"backlink_domains"`
	Score           float64 `json:"score"`
}

// DomainAuthorityStore persists and retrieves domain authority scores.
type DomainAuthorityStore struct {
	db *badger.DB
}

// NewDomainAuthorityStore creates a domain authority store.
func NewDomainAuthorityStore(bs *store.BadgerStore) *DomainAuthorityStore {
	return &DomainAuthorityStore{db: bs.DB()}
}

// Get retrieves the domain authority for a domain.
func (das *DomainAuthorityStore) Get(domain string) (*DomainAuthority, error) {
	var da DomainAuthority
	err := das.db.View(func(txn *badger.Txn) error {
		key := []byte(domainAuthorityPrefix + domain)
		item, err := txn.Get(key)
		if err != nil {
			return err
		}
		return item.Value(func(val []byte) error {
			return json.Unmarshal(val, &da)
		})
	})
	if err == badger.ErrKeyNotFound {
		return nil, nil
	}
	return &da, err
}

// Put stores a domain authority record.
func (das *DomainAuthorityStore) Put(da *DomainAuthority) error {
	data, err := json.Marshal(da)
	if err != nil {
		return err
	}
	return das.db.Update(func(txn *badger.Txn) error {
		return txn.Set([]byte(domainAuthorityPrefix+da.Domain), data)
	})
}

// ComputeDomainAuthority computes authority scores for all indexed domains.
// Should be called during or after PageRank computation.
func ComputeDomainAuthority(idx index.Store, linkStore *store.LinkStore, pageRankScores map[string]float64, das *DomainAuthorityStore) {
	start := time.Now()

	// Aggregate per-domain stats by iterating all documents
	type domainStats struct {
		pageCount      int
		pageRankSum    float64
		qualitySum     float64
		backlinkFroms  map[string]bool // unique source domains
	}

	stats := make(map[string]*domainStats)

	idx.ListAll(func(doc *index.IndexDocument) bool {
		domain := doc.Domain
		if domain == "" {
			return true
		}

		ds, ok := stats[domain]
		if !ok {
			ds = &domainStats{backlinkFroms: make(map[string]bool)}
			stats[domain] = ds
		}

		ds.pageCount++
		ds.pageRankSum += doc.PageRankScore
		ds.qualitySum += doc.QualityScore

		return true
	})

	// Count unique backlink domains via link store
	destIDs, err := linkStore.AllDestinations()
	if err != nil {
		log.Printf("domain authority: failed to get destinations: %v", err)
		return
	}

	for _, destID := range destIDs {
		doc, err := idx.Get(destID)
		if err != nil {
			continue
		}
		domain := doc.Domain
		ds, ok := stats[domain]
		if !ok {
			continue
		}

		edges, err := linkStore.GetInboundLinks(destID)
		if err != nil {
			continue
		}
		for _, edge := range edges {
			if edge.IsCross {
				// Extract domain from the source URL
				srcDoc, err := idx.Get(fmt.Sprintf("%x", edge.FromURL))
				if err == nil && srcDoc.Domain != domain {
					ds.backlinkFroms[srcDoc.Domain] = true
				}
			}
		}
	}

	// Compute final scores and persist
	updated := 0
	for domain, ds := range stats {
		da := &DomainAuthority{
			Domain:          domain,
			PageCount:       ds.pageCount,
			BacklinkDomains: len(ds.backlinkFroms),
		}

		if ds.pageCount > 0 {
			da.AvgPageRank = ds.pageRankSum / float64(ds.pageCount)
			da.AvgQuality = ds.qualitySum / float64(ds.pageCount)
		}

		// Composite score: weighted combination
		score := 0.0
		score += da.AvgPageRank * 0.35
		score += da.AvgQuality * 0.25
		score += math.Min(float64(da.PageCount)/100.0, 1.0) * 0.20
		score += math.Min(float64(da.BacklinkDomains)/50.0, 1.0) * 0.20

		da.Score = clamp(score)

		if err := das.Put(da); err != nil {
			log.Printf("domain authority: failed to store %s: %v", domain, err)
			continue
		}
		updated++
	}

	log.Printf("domain authority: computed for %d domains in %dms", updated, time.Since(start).Milliseconds())
}
