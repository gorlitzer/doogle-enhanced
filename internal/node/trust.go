package node

import (
	"context"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

const (
	// Peers start at neutral trust. Good behavior raises it, bad behavior lowers it.
	defaultTrustScore = 0.5

	// Trust score penalty per confirmed strike. Intentionally small — it takes
	// many confirmed bad documents to erode trust. One document cannot kill a peer.
	strikePenalty = 0.02

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
	trustDecayBase     = 0.998          // exponential decay base (half-life ~14 days)
	trustDecayIdleTime = 24 * time.Hour // peers not seen in this window are "idle"

	// Trust cap after unquarantine — limited for 30 days.
	unquarantineTrustCap    = 0.70
	unquarantineCapDuration = 30 * 24 * time.Hour
	unquarantineStartTrust  = 0.10
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

	// Peer age gating: reject reports from very new peers
	rep, _ := tm.store.GetReputation(report.ReporterID)
	if rep != nil && !rep.FirstSeen.IsZero() {
		peerAge := time.Since(rep.FirstSeen)
		if peerAge < 1*time.Hour {
			log.Printf("trust: rejecting report from new peer %s (age: %s)",
				truncPeer(report.ReporterID), peerAge)
			return false, nil
		}
	}

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

// ReporterWeight returns the penalty weight for a reporter based on peer age.
// Peers less than 24h old get half weight.
func (tm *TrustManager) ReporterWeight(reporterID string) float64 {
	rep, _ := tm.store.GetReputation(reporterID)
	if rep != nil && !rep.FirstSeen.IsZero() {
		if time.Since(rep.FirstSeen) < 24*time.Hour {
			return 0.5
		}
	}
	return 1.0
}

// RecordGoodDoc records that a peer contributed a document that passed quality checks.
func (tm *TrustManager) RecordGoodDoc(peerID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	rep := tm.getOrCreateReputation(peerID)
	rep.GoodDocs++
	rep.TrustScore = clampTrust(rep.TrustScore + goodDocBoost)

	// Enforce trust cap if set and not expired
	if rep.TrustCap > 0 && !rep.TrustCapExpiry.IsZero() && time.Now().Before(rep.TrustCapExpiry) {
		if rep.TrustScore > rep.TrustCap {
			rep.TrustScore = rep.TrustCap
		}
	}

	rep.LastSeen = time.Now()
	rep.UpdatedAt = time.Now()
	tm.store.SetReputation(rep)
}

// RecordSpamDoc records a confirmed strike against a peer for a bad document.
// Each confirmed quarantine = 1 strike. Strikes accumulate permanently as evidence.
// The graduated response is driven by strike count, not trust score alone:
//
//	3 strikes  → warning (results demoted 20%)
//	5 strikes  → throttled (demoted 50%, max 2/query)
//	8 strikes  → quarantined (excluded from results)
//	15 strikes → excommunicado (permanent ban, never accepted again)
//
// Trust score also takes a small hit per strike, but one document can never
// kill a peer — it takes sustained, confirmed evidence.
func (tm *TrustManager) RecordSpamDoc(peerID string, reporterTrust float64, reason string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	rep := tm.getOrCreateReputation(peerID)
	rep.SpamDocs++
	rep.ReportsAbout++
	rep.Strikes++

	// Small trust penalty per strike, weighted by reporter trust and severity.
	// At default values: 0.02 × 0.5 × 1.0 = 0.01 per strike for a spam report
	// from an average-trust peer. It would take ~35 confirmed strikes to go
	// from 0.5 to 0.15 — this is intentional.
	penalty := strikePenalty * reporterTrust * reasonWeight(reason)
	rep.TrustScore = clampTrust(rep.TrustScore - penalty)

	// Graduated response based on strike count (the "bounty board")
	now := time.Now()
	tier := models.ComputeStrikeTier(rep.Strikes)

	if tier == "quarantined" || tier == "excommunicado" {
		if !rep.Quarantined {
			rep.Quarantined = true
			rep.QuarantinedAt = now
			rep.QuarantineCount++
			if tier == "excommunicado" {
				log.Printf("trust: EXCOMMUNICADO peer %s — permanent ban (strikes=%d, trust=%.2f)",
					truncPeer(peerID), rep.Strikes, rep.TrustScore)
			} else {
				log.Printf("trust: QUARANTINED peer %s (strikes=%d, trust=%.2f, count=%d)",
					truncPeer(peerID), rep.Strikes, rep.TrustScore, rep.QuarantineCount)
			}
		}
	}

	rep.LastSeen = now
	rep.UpdatedAt = now
	tm.store.SetReputation(rep)
}

// reasonWeight returns a multiplier for report penalty based on severity.
func reasonWeight(reason string) float64 {
	switch reason {
	case models.ReportReasonMalware, models.ReportReasonPhishing:
		return 1.5
	case models.ReportReasonIllegal:
		return 1.2
	case models.ReportReasonSpam:
		return 1.0
	case models.ReportReasonLowQuality:
		return 0.5
	default:
		return 1.0
	}
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

// Unquarantine lifts quarantine on a peer, applying trust cap for 30 days.
// Returns error if the peer has reached excommunicado (15+ strikes — permanent).
func (tm *TrustManager) Unquarantine(peerID string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	rep, err := tm.store.GetReputation(peerID)
	if err != nil || rep == nil {
		return fmt.Errorf("peer not found: %s", peerID)
	}
	if !rep.Quarantined {
		return fmt.Errorf("peer is not quarantined")
	}
	if rep.Strikes >= models.StrikesExcommunicado {
		return fmt.Errorf("peer is excommunicado (%d strikes) — permanent ban", rep.Strikes)
	}

	now := time.Now()
	rep.Quarantined = false
	rep.TrustScore = unquarantineStartTrust
	rep.TrustCap = unquarantineTrustCap
	rep.TrustCapExpiry = now.Add(unquarantineCapDuration)
	rep.UpdatedAt = now

	log.Printf("trust: UNQUARANTINED peer %s (trust reset to %.2f, cap=%.2f for 30d)",
		truncPeer(peerID), rep.TrustScore, rep.TrustCap)

	return tm.store.SetReputation(rep)
}

// DismissReport marks a report as dismissed and penalizes unreliable reporters.
func (tm *TrustManager) DismissReport(reportID string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	report, err := tm.store.GetReport(reportID)
	if err != nil || report == nil {
		return fmt.Errorf("report not found: %s", reportID)
	}

	if err := tm.store.DismissReport(reportID); err != nil {
		return err
	}

	// Track reporter credibility
	rep := tm.getOrCreateReputation(report.ReporterID)
	rep.ReportsRejected++

	// Penalize persistent false reporters: >50% rejection rate after 5+ reports
	totalReviewed := rep.ReportsConfirmed + rep.ReportsRejected
	if totalReviewed >= 5 && float64(rep.ReportsRejected)/float64(totalReviewed) > 0.5 {
		rep.TrustScore = clampTrust(rep.TrustScore - 0.02)
	}

	rep.UpdatedAt = time.Now()
	return tm.store.SetReputation(rep)
}

// ConfirmReport marks a report as confirmed and rewards reliable reporters.
func (tm *TrustManager) ConfirmReport(reportID string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	report, err := tm.store.GetReport(reportID)
	if err != nil || report == nil {
		return fmt.Errorf("report not found: %s", reportID)
	}

	if err := tm.store.ConfirmReport(reportID); err != nil {
		return err
	}

	// Reward reporter credibility
	rep := tm.getOrCreateReputation(report.ReporterID)
	rep.ReportsConfirmed++
	rep.TrustScore = clampTrust(rep.TrustScore + 0.01)
	rep.UpdatedAt = time.Now()
	return tm.store.SetReputation(rep)
}

// RecordReporterConfirm rewards a reporter whose quarantine was confirmed.
func (tm *TrustManager) RecordReporterConfirm(reporterID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	rep := tm.getOrCreateReputation(reporterID)
	rep.ReportsConfirmed++
	rep.TrustScore = clampTrust(rep.TrustScore + 0.01)
	rep.UpdatedAt = time.Now()
	tm.store.SetReputation(rep)
}

// RecordReporterReject penalizes a reporter whose quarantine was dismissed.
func (tm *TrustManager) RecordReporterReject(reporterID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	rep := tm.getOrCreateReputation(reporterID)
	rep.ReportsRejected++
	totalReviewed := rep.ReportsConfirmed + rep.ReportsRejected
	if totalReviewed >= 5 && float64(rep.ReportsRejected)/float64(totalReviewed) > 0.5 {
		rep.TrustScore = clampTrust(rep.TrustScore - 0.02)
	}
	rep.UpdatedAt = time.Now()
	tm.store.SetReputation(rep)
}

// ComputeTier returns the trust tier for a peer based on strikes (primary) and
// trust score (secondary). Strikes are permanent evidence — they take priority.
// The quarantineCount legacy field is kept for backward compatibility with
// unquarantine flow.
func ComputeTier(score float64, quarantineCount int, strikes int) string {
	// Strike-based tiers take priority (the "bounty board")
	strikeTier := models.ComputeStrikeTier(strikes)
	if strikeTier != "trusted" {
		return strikeTier
	}
	// Fall back to trust score for peers with no strikes
	if score >= 0.3 {
		return "trusted"
	}
	if score >= 0.2 {
		return "warning"
	}
	if score >= 0.1 {
		return "throttled"
	}
	return "quarantined"
}

// TierMultiplier returns the search score multiplier for a given trust tier.
func TierMultiplier(tier string) float64 {
	switch tier {
	case "trusted":
		return 1.0
	case "warning":
		return 0.80
	case "throttled":
		return 0.50
	case "quarantined", "excommunicado":
		return 0.0
	default:
		return 1.0
	}
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
	flaggedList, _ := tm.store.AllFlaggedDomains()
	blockedDomains, _ := tm.store.BlockedDomains()

	// Convert store.DomainVotes to models.DomainVotesInfo
	var blockedList []models.DomainVotesInfo
	for _, dv := range blockedDomains {
		blockedList = append(blockedList, models.DomainVotesInfo{
			Domain:    dv.Domain,
			Voters:    dv.Voters,
			Blocked:   dv.Blocked,
			BlockedAt: dv.BlockedAt,
		})
	}

	return &models.TrustSummary{
		TotalReports:      totalReports,
		QuarantinedPeers:  len(quarantined),
		TrackedPeers:      len(allReps),
		FlaggedDomains:    flaggedDomains,
		RecentReports:     recent,
		QuarantinedList:   quarantined,
		FlaggedDomainList: flaggedList,
		BlockedDomainList: blockedList,
		AllPeers:          allReps,
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
	log.Printf("trust: decay loop started (interval=%s, idle threshold=%s, decay base=%.3f)",
		trustDecayInterval, trustDecayIdleTime, trustDecayBase)
}

// decayIdlePeers reduces trust for peers that haven't been seen recently.
// Uses exponential decay: trust *= 0.998^hoursIdle (half-life ~14 days).
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
		hoursIdle := now.Sub(rep.LastSeen).Hours()
		decayFactor := math.Pow(trustDecayBase, hoursIdle)
		updated.TrustScore = clampTrust(rep.TrustScore * decayFactor)
		updated.UpdatedAt = now

		// Auto-quarantine if trust has decayed below the throttled floor (0.10)
		if updated.TrustScore <= 0.10 && !updated.Quarantined {
			updated.Quarantined = true
			updated.QuarantinedAt = now
			updated.QuarantineCount++
			log.Printf("trust: QUARANTINED idle peer %s (trust=%.2f, count=%d)",
				truncPeer(rep.PeerID), updated.TrustScore, updated.QuarantineCount)
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
