package models

import (
	"time"
)

// TimeNowUnix returns the current time as a Unix timestamp.
func TimeNowUnix() int64 {
	return time.Now().Unix()
}

// SpamReport represents a user or peer report about a URL.
type SpamReport struct {
	ID         string    `json:"id"`          // deterministic: hash(reporter+url)
	URL        string    `json:"url"`         // reported URL
	Domain     string    `json:"domain"`      // domain of reported URL
	ReporterID string    `json:"reporter_id"` // peer ID of reporter
	Reason     string    `json:"reason"`      // spam, malware, phishing, illegal, low_quality
	Detail     string    `json:"detail,omitempty"`
	Timestamp  time.Time `json:"timestamp"`
	Status     string    `json:"status,omitempty"` // "", "dismissed", "confirmed"
}

// Valid report reasons.
const (
	ReportReasonSpam       = "spam"
	ReportReasonMalware    = "malware"
	ReportReasonPhishing   = "phishing"
	ReportReasonIllegal    = "illegal"
	ReportReasonLowQuality = "low_quality"
)

// ValidReportReasons returns all accepted report reasons.
func ValidReportReasons() []string {
	return []string{
		ReportReasonSpam,
		ReportReasonMalware,
		ReportReasonPhishing,
		ReportReasonIllegal,
		ReportReasonLowQuality,
	}
}

// PeerReputation tracks a peer's trust on the network.
type PeerReputation struct {
	PeerID       string    `json:"peer_id"`
	TrustScore   float64   `json:"trust_score"`   // 0.0 (banned) - 1.0 (fully trusted), starts at 0.5
	GoodDocs     int64     `json:"good_docs"`      // documents that passed quality checks
	SpamDocs     int64     `json:"spam_docs"`       // documents flagged as spam
	ReportsMade  int64     `json:"reports_made"`    // reports this peer submitted
	ReportsAbout int64     `json:"reports_about"`   // reports about content from this peer
	Quarantined  bool      `json:"quarantined"`     // if true, this peer's content is blocked
	FirstSeen    time.Time `json:"first_seen"`
	LastSeen     time.Time `json:"last_seen"`
	UpdatedAt    time.Time `json:"updated_at"`

	// Graduated response fields
	QuarantinedAt    time.Time `json:"quarantined_at,omitempty"`
	QuarantineCount  int       `json:"quarantine_count"`
	TrustCap         float64   `json:"trust_cap,omitempty"`
	TrustCapExpiry   time.Time `json:"trust_cap_expiry,omitempty"`

	// Reporter credibility
	ReportsConfirmed int64 `json:"reports_confirmed"`
	ReportsRejected  int64 `json:"reports_rejected"`
}

// DomainFlagEntry represents a flagged or blocked domain for the admin UI.
type DomainFlagEntry struct {
	Domain      string `json:"domain"`
	ReportCount int64  `json:"report_count"`
	Blocked     bool   `json:"blocked"`
	Voters      int    `json:"voters"`
}

// TrustSummary is the API response for trust system status.
type TrustSummary struct {
	TotalReports      int64            `json:"total_reports"`
	QuarantinedPeers  int              `json:"quarantined_peers"`
	TrackedPeers      int              `json:"tracked_peers"`
	FlaggedDomains    int              `json:"flagged_domains"`
	RecentReports     []SpamReport     `json:"recent_reports,omitempty"`
	QuarantinedList   []PeerReputation `json:"quarantined_list,omitempty"`
	FlaggedDomainList []DomainFlagEntry  `json:"flagged_domain_list,omitempty"`
	BlockedDomainList []DomainVotesInfo  `json:"blocked_domain_list,omitempty"`
	AllPeers          []PeerReputation   `json:"all_peers,omitempty"`
}

// DomainVotesInfo is a serializable view of domain block votes for the API.
type DomainVotesInfo struct {
	Domain    string   `json:"domain"`
	Voters    []string `json:"voters"`
	Blocked   bool     `json:"blocked"`
	BlockedAt int64    `json:"blocked_at"`
}
