package store

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/dgraph-io/badger/v4"

	"github.com/doogle/doogle-v2/internal/models"
)

// Key prefixes for trust data in BadgerDB.
const (
	prefixReport     = "trust:report:"     // trust:report:<id> → SpamReport
	prefixReputation = "trust:reputation:" // trust:reputation:<peerID> → PeerReputation
	prefixDomainFlag = "trust:domain:"     // trust:domain:<domain> → report count
)

// TrustStore persists spam reports and peer reputation in BadgerDB.
type TrustStore struct {
	bs *BadgerStore
}

// NewTrustStore creates a TrustStore backed by the shared BadgerStore.
func NewTrustStore(bs *BadgerStore) *TrustStore {
	return &TrustStore{bs: bs}
}

// ReportID computes a deterministic ID for a spam report.
func ReportID(reporterID, url string) string {
	h := sha256.Sum256([]byte(reporterID + "|" + url))
	return hex.EncodeToString(h[:16])
}

// AddReport stores a spam report. Returns true if it's new, false if duplicate.
func (ts *TrustStore) AddReport(report *models.SpamReport) (bool, error) {
	key := []byte(prefixReport + report.ID)

	// Check for duplicate
	existing, err := ts.bs.Get(key)
	if err != nil {
		return false, err
	}
	if existing != nil {
		return false, nil // duplicate
	}

	data, err := json.Marshal(report)
	if err != nil {
		return false, fmt.Errorf("marshal report: %w", err)
	}
	if err := ts.bs.Set(key, data); err != nil {
		return false, err
	}

	// Increment domain flag count
	ts.incrementDomainFlags(report.Domain)

	return true, nil
}

// GetReport retrieves a spam report by ID.
func (ts *TrustStore) GetReport(id string) (*models.SpamReport, error) {
	data, err := ts.bs.Get([]byte(prefixReport + id))
	if err != nil || data == nil {
		return nil, err
	}
	var report models.SpamReport
	if err := json.Unmarshal(data, &report); err != nil {
		return nil, err
	}
	return &report, nil
}

// RecentReports returns the most recent spam reports (up to limit).
func (ts *TrustStore) RecentReports(limit int) ([]models.SpamReport, error) {
	var reports []models.SpamReport
	prefix := []byte(prefixReport)

	err := ts.bs.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = prefix
		opts.Reverse = true
		it := txn.NewIterator(opts)
		defer it.Close()

		count := 0
		for it.Seek(append(prefix, 0xFF)); it.ValidForPrefix(prefix); it.Next() {
			if count >= limit {
				break
			}
			var report models.SpamReport
			err := it.Item().Value(func(val []byte) error {
				return json.Unmarshal(val, &report)
			})
			if err != nil {
				continue
			}
			reports = append(reports, report)
			count++
		}
		return nil
	})

	return reports, err
}

// TotalReports returns the total count of spam reports.
func (ts *TrustStore) TotalReports() (int64, error) {
	var count int64
	prefix := []byte(prefixReport)

	err := ts.bs.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchValues = false
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			count++
		}
		return nil
	})

	return count, err
}

// ReportsForDomain returns all reports for a given domain.
func (ts *TrustStore) ReportsForDomain(domain string) ([]models.SpamReport, error) {
	var reports []models.SpamReport
	prefix := []byte(prefixReport)

	err := ts.bs.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			var report models.SpamReport
			err := it.Item().Value(func(val []byte) error {
				return json.Unmarshal(val, &report)
			})
			if err != nil {
				continue
			}
			if report.Domain == domain {
				reports = append(reports, report)
			}
		}
		return nil
	})

	return reports, err
}

// ─── Peer Reputation ─────────────────────────────────

// GetReputation retrieves a peer's reputation. Returns nil if not tracked yet.
func (ts *TrustStore) GetReputation(peerID string) (*models.PeerReputation, error) {
	data, err := ts.bs.Get([]byte(prefixReputation + peerID))
	if err != nil || data == nil {
		return nil, err
	}
	var rep models.PeerReputation
	if err := json.Unmarshal(data, &rep); err != nil {
		return nil, err
	}
	return &rep, nil
}

// SetReputation stores or updates a peer's reputation.
func (ts *TrustStore) SetReputation(rep *models.PeerReputation) error {
	data, err := json.Marshal(rep)
	if err != nil {
		return fmt.Errorf("marshal reputation: %w", err)
	}
	return ts.bs.Set([]byte(prefixReputation+rep.PeerID), data)
}

// AllReputations returns all tracked peer reputations.
func (ts *TrustStore) AllReputations() ([]models.PeerReputation, error) {
	var reps []models.PeerReputation
	prefix := []byte(prefixReputation)

	err := ts.bs.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			var rep models.PeerReputation
			err := it.Item().Value(func(val []byte) error {
				return json.Unmarshal(val, &rep)
			})
			if err != nil {
				continue
			}
			reps = append(reps, rep)
		}
		return nil
	})

	return reps, err
}

// QuarantinedPeers returns all peers that are currently quarantined.
func (ts *TrustStore) QuarantinedPeers() ([]models.PeerReputation, error) {
	all, err := ts.AllReputations()
	if err != nil {
		return nil, err
	}
	var quarantined []models.PeerReputation
	for _, rep := range all {
		if rep.Quarantined {
			quarantined = append(quarantined, rep)
		}
	}
	return quarantined, nil
}

// ─── Domain Flags ─────────────────────────────────────

func (ts *TrustStore) incrementDomainFlags(domain string) {
	key := []byte(prefixDomainFlag + domain)
	data, _ := ts.bs.Get(key)
	count := int64(1)
	if data != nil {
		var existing int64
		if json.Unmarshal(data, &existing) == nil {
			count = existing + 1
		}
	}
	val, _ := json.Marshal(count)
	ts.bs.Set(key, val)
}

// DomainFlagCount returns the number of reports for a domain.
func (ts *TrustStore) DomainFlagCount(domain string) (int64, error) {
	data, err := ts.bs.Get([]byte(prefixDomainFlag + domain))
	if err != nil || data == nil {
		return 0, err
	}
	var count int64
	if err := json.Unmarshal(data, &count); err != nil {
		return 0, err
	}
	return count, nil
}

// FlaggedDomainCount returns how many unique domains have been flagged.
func (ts *TrustStore) FlaggedDomainCount() (int, error) {
	count := 0
	prefix := []byte(prefixDomainFlag)

	err := ts.bs.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchValues = false
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			count++
		}
		return nil
	})

	return count, err
}

// IsDomainFlagged returns true if a domain has been reported more than threshold times.
func (ts *TrustStore) IsDomainFlagged(domain string, threshold int64) (bool, error) {
	count, err := ts.DomainFlagCount(domain)
	if err != nil {
		return false, err
	}
	return count >= threshold, nil
}

// ─── URL-level helpers ────────────────────────────────

// ExtractDomain extracts the domain from a URL for report tracking.
func ExtractDomain(rawURL string) string {
	// Simple extraction: strip scheme, strip path
	u := rawURL
	if idx := strings.Index(u, "://"); idx >= 0 {
		u = u[idx+3:]
	}
	if idx := strings.Index(u, "/"); idx >= 0 {
		u = u[:idx]
	}
	if idx := strings.Index(u, ":"); idx >= 0 {
		u = u[:idx]
	}
	return strings.ToLower(u)
}
