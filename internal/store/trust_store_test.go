package store

import (
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

func TestTrustStore_AddAndGetReport(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrustStore(bs)

	report := &models.SpamReport{
		ID:         ReportID("peer1", "https://spam.com"),
		URL:        "https://spam.com",
		Domain:     "spam.com",
		ReporterID: "peer1",
		Reason:     "spam",
		Timestamp:  time.Now(),
	}

	isNew, err := ts.AddReport(report)
	if err != nil {
		t.Fatalf("AddReport: %v", err)
	}
	if !isNew {
		t.Fatal("expected report to be new")
	}

	// Duplicate
	isNew, err = ts.AddReport(report)
	if err != nil {
		t.Fatalf("AddReport duplicate: %v", err)
	}
	if isNew {
		t.Fatal("expected duplicate to return false")
	}

	// Get
	got, err := ts.GetReport(report.ID)
	if err != nil {
		t.Fatalf("GetReport: %v", err)
	}
	if got.URL != "https://spam.com" {
		t.Fatalf("unexpected URL: %s", got.URL)
	}
}

func TestTrustStore_DismissAndConfirmReport(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrustStore(bs)

	report := &models.SpamReport{
		ID:         "report1",
		URL:        "https://test.com",
		Domain:     "test.com",
		ReporterID: "peer1",
		Reason:     "spam",
		Timestamp:  time.Now(),
	}
	ts.AddReport(report)

	// Dismiss
	if err := ts.DismissReport("report1"); err != nil {
		t.Fatalf("DismissReport: %v", err)
	}
	got, _ := ts.GetReport("report1")
	if got.Status != "dismissed" {
		t.Fatalf("expected dismissed, got %s", got.Status)
	}

	// Confirm another report
	report2 := &models.SpamReport{
		ID:         "report2",
		URL:        "https://malware.com",
		Domain:     "malware.com",
		ReporterID: "peer2",
		Reason:     "malware",
		Timestamp:  time.Now(),
	}
	ts.AddReport(report2)
	if err := ts.ConfirmReport("report2"); err != nil {
		t.Fatalf("ConfirmReport: %v", err)
	}
	got, _ = ts.GetReport("report2")
	if got.Status != "confirmed" {
		t.Fatalf("expected confirmed, got %s", got.Status)
	}

	// Not found
	if err := ts.DismissReport("nonexistent"); err == nil {
		t.Fatal("expected error for nonexistent report")
	}
}

func TestTrustStore_Reputation(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrustStore(bs)

	// Not found
	rep, err := ts.GetReputation("peer1")
	if err != nil {
		t.Fatalf("GetReputation: %v", err)
	}
	if rep != nil {
		t.Fatal("expected nil for unknown peer")
	}

	// Set
	r := &models.PeerReputation{
		PeerID:     "peer1",
		TrustScore: 0.5,
		GoodDocs:   10,
		FirstSeen:  time.Now(),
		LastSeen:   time.Now(),
	}
	if err := ts.SetReputation(r); err != nil {
		t.Fatalf("SetReputation: %v", err)
	}

	// Get
	got, _ := ts.GetReputation("peer1")
	if got == nil {
		t.Fatal("expected reputation")
	}
	if got.TrustScore != 0.5 {
		t.Fatalf("expected trust=0.5, got %.2f", got.TrustScore)
	}

	// All
	all, _ := ts.AllReputations()
	if len(all) != 1 {
		t.Fatalf("expected 1 reputation, got %d", len(all))
	}
}

func TestTrustStore_DomainVotes(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrustStore(bs)

	// Vote 1
	blocked, voters := ts.AddDomainVote("evil.com", "peer1", 3)
	if blocked || voters != 1 {
		t.Fatalf("expected not blocked, 1 voter, got blocked=%v voters=%d", blocked, voters)
	}

	// Duplicate vote
	blocked, voters = ts.AddDomainVote("evil.com", "peer1", 3)
	if blocked || voters != 1 {
		t.Fatalf("expected duplicate ignored, got voters=%d", voters)
	}

	// Votes 2 and 3 → consensus
	ts.AddDomainVote("evil.com", "peer2", 3)
	blocked, voters = ts.AddDomainVote("evil.com", "peer3", 3)
	if !blocked || voters != 3 {
		t.Fatalf("expected blocked=true, 3 voters, got blocked=%v voters=%d", blocked, voters)
	}

	if !ts.IsDomainBlocked("evil.com") {
		t.Fatal("expected domain blocked")
	}
}

func TestTrustStore_UnblockDomain(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrustStore(bs)

	ts.AddDomainVote("blocked.com", "p1", 2)
	ts.AddDomainVote("blocked.com", "p2", 2)

	if !ts.IsDomainBlocked("blocked.com") {
		t.Fatal("expected domain blocked")
	}

	if err := ts.UnblockDomain("blocked.com"); err != nil {
		t.Fatalf("UnblockDomain: %v", err)
	}

	if ts.IsDomainBlocked("blocked.com") {
		t.Fatal("expected domain unblocked")
	}
}

func TestTrustStore_AllFlaggedDomains(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrustStore(bs)

	// Create reports to flag domains
	ts.AddReport(&models.SpamReport{ID: "r1", URL: "https://spam.com/1", Domain: "spam.com", ReporterID: "p1", Timestamp: time.Now()})
	ts.AddReport(&models.SpamReport{ID: "r2", URL: "https://spam.com/2", Domain: "spam.com", ReporterID: "p2", Timestamp: time.Now()})
	ts.AddReport(&models.SpamReport{ID: "r3", URL: "https://evil.com/x", Domain: "evil.com", ReporterID: "p1", Timestamp: time.Now()})

	// Block evil.com
	ts.AddDomainVote("evil.com", "p1", 2)
	ts.AddDomainVote("evil.com", "p2", 2)

	flagged, err := ts.AllFlaggedDomains()
	if err != nil {
		t.Fatalf("AllFlaggedDomains: %v", err)
	}
	if len(flagged) < 2 {
		t.Fatalf("expected >= 2 flagged domains, got %d", len(flagged))
	}

	// Check evil.com is blocked
	for _, d := range flagged {
		if d.Domain == "evil.com" && !d.Blocked {
			t.Fatal("expected evil.com to be blocked")
		}
	}
}

func TestTrustStore_TotalReportsAndRecent(t *testing.T) {
	bs := newTestBadger(t)
	ts := NewTrustStore(bs)

	for i := 0; i < 5; i++ {
		ts.AddReport(&models.SpamReport{
			ID:         ReportID("peer1", "https://spam.com/"+string(rune('a'+i))),
			URL:        "https://spam.com/" + string(rune('a'+i)),
			Domain:     "spam.com",
			ReporterID: "peer1",
			Timestamp:  time.Now(),
		})
	}

	total, err := ts.TotalReports()
	if err != nil {
		t.Fatalf("TotalReports: %v", err)
	}
	if total != 5 {
		t.Fatalf("expected 5 reports, got %d", total)
	}

	recent, _ := ts.RecentReports(3)
	if len(recent) > 3 {
		t.Fatalf("expected <= 3 recent reports, got %d", len(recent))
	}
}
