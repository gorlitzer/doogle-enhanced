package node

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

const (
	// Peers start at neutral trust. Good behavior raises it, bad behavior lowers it.
	defaultTrustScore = 0.5

	// Below this score, a peer is auto-quarantined.
	quarantineThreshold = 0.15

	// How many reports about a peer's content before we start penalizing trust.
	reportPenaltyStart = 3

	// Trust score penalty per report about a peer's content.
	reportPenalty = 0.05

	// Trust score boost per good document (very small — trust is earned slowly).
	goodDocBoost = 0.001

	// Maximum trust score achievable.
	maxTrustScore = 1.0

	// Minimum trust score (can't go below 0).
	minTrustScore = 0.0

	// Number of reports from different peers needed to auto-flag a domain.
	domainFlagThreshold int64 = 5

	// Trust decay settings — idle peers slowly lose trust.
	trustDecayInterval = 1 * time.Hour  // how often to run decay
	trustDecayAmount   = 0.005          // per-interval decay for idle peers
	trustDecayIdleTime = 24 * time.Hour // peers not seen in this window are "idle"
)

// TrustManager handles spam reporting, peer reputation, and quarantine decisions.
type TrustManager struct {
	store  *store.TrustStore
	selfID string
	mu     sync.RWMutex
}

// NewTrustManager creates a trust manager backed by the given store.
func NewTrustManager(ts *store.TrustStore, selfPeerID string) *TrustManager {
	return &TrustManager{
		store:  ts,
		selfID: selfPeerID,
	}
}

// HandleReport processes a spam report — either local (user submitted) or from a peer.
// Returns true if the report was new (not a duplicate).
func (tm *TrustManager) HandleReport(report *models.SpamReport) (bool, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	// Store the report
	isNew, err := tm.store.AddReport(report)
	if err != nil {
		return false, err
	}
	if !isNew {
		return false, nil // duplicate
	}

	// Update reporter's stats (they made a report — track it)
	tm.incrementReportsMade(report.ReporterID)

	log.Printf("trust: new report from %s for %s (reason: %s)",
		truncPeer(report.ReporterID), report.URL, report.Reason)

	return true, nil
}

// RecordGoodDoc records that a peer contributed a document that passed quality checks.
func (tm *TrustManager) RecordGoodDoc(peerID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	rep := tm.getOrCreateReputation(peerID)
	rep.GoodDocs++
	rep.TrustScore = clampTrust(rep.TrustScore + goodDocBoost)
	rep.LastSeen = time.Now()
	rep.UpdatedAt = time.Now()
	tm.store.SetReputation(rep)
}

// RecordSpamDoc records that a peer contributed a document that was flagged as spam.
func (tm *TrustManager) RecordSpamDoc(peerID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	rep := tm.getOrCreateReputation(peerID)
	rep.SpamDocs++
	rep.ReportsAbout++

	// Apply penalty if above threshold
	if rep.ReportsAbout >= int64(reportPenaltyStart) {
		rep.TrustScore = clampTrust(rep.TrustScore - reportPenalty)
	}

	// Auto-quarantine if trust drops too low
	if rep.TrustScore <= quarantineThreshold && !rep.Quarantined {
		rep.Quarantined = true
		log.Printf("trust: QUARANTINED peer %s (trust=%.2f, spam=%d)",
			truncPeer(peerID), rep.TrustScore, rep.SpamDocs)
	}

	rep.LastSeen = time.Now()
	rep.UpdatedAt = time.Now()
	tm.store.SetReputation(rep)
}

// IsQuarantined returns true if a peer has been quarantined.
func (tm *TrustManager) IsQuarantined(peerID string) bool {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	rep, err := tm.store.GetReputation(peerID)
	if err != nil || rep == nil {
		return false
	}
	return rep.Quarantined
}

// TrustScore returns the current trust score for a peer (0.0-1.0).
// Unknown peers get the default score.
func (tm *TrustManager) TrustScore(peerID string) float64 {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	rep, err := tm.store.GetReputation(peerID)
	if err != nil || rep == nil {
		return defaultTrustScore
	}
	return rep.TrustScore
}

// IsDomainFlagged returns true if a domain has accumulated enough reports.
func (tm *TrustManager) IsDomainFlagged(domain string) bool {
	flagged, _ := tm.store.IsDomainFlagged(domain, domainFlagThreshold)
	return flagged
}

// Summary returns a trust system summary for the API.
func (tm *TrustManager) Summary() *models.TrustSummary {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	totalReports, _ := tm.store.TotalReports()
	quarantined, _ := tm.store.QuarantinedPeers()
	allReps, _ := tm.store.AllReputations()
	flaggedDomains, _ := tm.store.FlaggedDomainCount()
	recent, _ := tm.store.RecentReports(20)

	return &models.TrustSummary{
		TotalReports:     totalReports,
		QuarantinedPeers: len(quarantined),
		TrackedPeers:     len(allReps),
		FlaggedDomains:   flaggedDomains,
		RecentReports:    recent,
		QuarantinedList:  quarantined,
	}
}

// QuarantinedPeerIDs returns the IDs of all quarantined peers.
func (tm *TrustManager) QuarantinedPeerIDs() []string {
	quarantined, err := tm.store.QuarantinedPeers()
	if err != nil {
		return nil
	}
	ids := make([]string, len(quarantined))
	for i, rep := range quarantined {
		ids[i] = rep.PeerID
	}
	return ids
}

// StartDecayLoop starts a background goroutine that periodically decays
// trust for idle peers. Active peers maintain their trust; idle peers
// slowly lose it. Stops when ctx is cancelled.
func (tm *TrustManager) StartDecayLoop(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(trustDecayInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				tm.decayIdlePeers()
			}
		}
	}()
	log.Printf("trust: decay loop started (interval=%s, idle threshold=%s, decay=%.3f)",
		trustDecayInterval, trustDecayIdleTime, trustDecayAmount)
}

// decayIdlePeers reduces trust for peers that haven't been seen recently.
func (tm *TrustManager) decayIdlePeers() {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	allReps, err := tm.store.AllReputations()
	if err != nil {
		return
	}

	now := time.Now()
	decayed := 0
	for _, rep := range allReps {
		// Skip self
		if rep.PeerID == tm.selfID {
			continue
		}
		// Skip already quarantined peers
		if rep.Quarantined {
			continue
		}
		// Skip peers at minimum trust
		if rep.TrustScore <= minTrustScore {
			continue
		}
		// Only decay if peer hasn't been seen in the idle window
		if now.Sub(rep.LastSeen) < trustDecayIdleTime {
			continue
		}

		updated := rep
		updated.TrustScore = clampTrust(rep.TrustScore - trustDecayAmount)
		updated.UpdatedAt = now

		// Auto-quarantine if trust drops too low
		if updated.TrustScore <= quarantineThreshold && !updated.Quarantined {
			updated.Quarantined = true
			log.Printf("trust: QUARANTINED idle peer %s (trust=%.2f)", truncPeer(rep.PeerID), updated.TrustScore)
		}

		tm.store.SetReputation(&updated)
		decayed++
	}
	if decayed > 0 {
		log.Printf("trust: decayed trust for %d idle peer(s)", decayed)
	}
}

// ─── Internal helpers ─────────────────────────────────

func (tm *TrustManager) getOrCreateReputation(peerID string) *models.PeerReputation {
	rep, _ := tm.store.GetReputation(peerID)
	if rep != nil {
		return rep
	}
	now := time.Now()
	return &models.PeerReputation{
		PeerID:     peerID,
		TrustScore: defaultTrustScore,
		FirstSeen:  now,
		LastSeen:   now,
		UpdatedAt:  now,
	}
}

func (tm *TrustManager) incrementReportsMade(peerID string) {
	rep := tm.getOrCreateReputation(peerID)
	rep.ReportsMade++
	rep.UpdatedAt = time.Now()
	tm.store.SetReputation(rep)
}

func clampTrust(score float64) float64 {
	if score > maxTrustScore {
		return maxTrustScore
	}
	if score < minTrustScore {
		return minTrustScore
	}
	return score
}

func truncPeer(peerID string) string {
	if len(peerID) > 12 {
		return peerID[:12]
	}
	return peerID
}
