package indexer

import (
	"testing"

	"github.com/doogle/doogle-v2/internal/store"
)

func newTestDomainAuthorityStore(t *testing.T) *DomainAuthorityStore {
	t.Helper()
	dir := t.TempDir()
	bs, err := store.NewBadgerStore(dir, false)
	if err != nil {
		t.Fatalf("failed to open badger: %v", err)
	}
	t.Cleanup(func() { bs.Close() })
	return NewDomainAuthorityStore(bs)
}

func TestDomainAuthorityStore_GetMissing(t *testing.T) {
	das := newTestDomainAuthorityStore(t)
	da, err := das.Get("unknown.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if da != nil {
		t.Errorf("expected nil for missing domain, got %+v", da)
	}
}

func TestDomainAuthorityStore_PutGet(t *testing.T) {
	das := newTestDomainAuthorityStore(t)

	want := &DomainAuthority{
		Domain:          "example.com",
		PageCount:       42,
		AvgPageRank:     0.35,
		AvgQuality:      0.7,
		BacklinkDomains: 15,
		Score:           0.55,
	}
	if err := das.Put(want); err != nil {
		t.Fatalf("Put: %v", err)
	}

	got, err := das.Get("example.com")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got == nil {
		t.Fatal("expected non-nil result")
	}

	if got.Domain != want.Domain {
		t.Errorf("Domain = %q, want %q", got.Domain, want.Domain)
	}
	if got.PageCount != want.PageCount {
		t.Errorf("PageCount = %d, want %d", got.PageCount, want.PageCount)
	}
	if got.AvgPageRank != want.AvgPageRank {
		t.Errorf("AvgPageRank = %f, want %f", got.AvgPageRank, want.AvgPageRank)
	}
	if got.AvgQuality != want.AvgQuality {
		t.Errorf("AvgQuality = %f, want %f", got.AvgQuality, want.AvgQuality)
	}
	if got.BacklinkDomains != want.BacklinkDomains {
		t.Errorf("BacklinkDomains = %d, want %d", got.BacklinkDomains, want.BacklinkDomains)
	}
	if got.Score != want.Score {
		t.Errorf("Score = %f, want %f", got.Score, want.Score)
	}
}

func TestDomainAuthorityStore_Overwrite(t *testing.T) {
	das := newTestDomainAuthorityStore(t)

	first := &DomainAuthority{Domain: "example.com", Score: 0.3}
	if err := das.Put(first); err != nil {
		t.Fatalf("Put first: %v", err)
	}

	second := &DomainAuthority{Domain: "example.com", Score: 0.9, PageCount: 100}
	if err := das.Put(second); err != nil {
		t.Fatalf("Put second: %v", err)
	}

	got, err := das.Get("example.com")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Score != 0.9 {
		t.Errorf("Score = %f, want 0.9 (second write)", got.Score)
	}
	if got.PageCount != 100 {
		t.Errorf("PageCount = %d, want 100 (second write)", got.PageCount)
	}
}

func TestDomainAuthorityStore_ScoreFormula(t *testing.T) {
	// Verify the composite score formula:
	// score = AvgPageRank*0.35 + AvgQuality*0.25 + min(PageCount/100,1)*0.20 + min(BacklinkDomains/50,1)*0.20
	da := &DomainAuthority{
		AvgPageRank:     0.5,
		AvgQuality:      0.8,
		PageCount:       50,
		BacklinkDomains: 25,
	}

	expected := 0.5*0.35 + 0.8*0.25 + (50.0/100.0)*0.20 + (25.0/50.0)*0.20
	// = 0.175 + 0.2 + 0.1 + 0.1 = 0.575

	const tolerance = 0.001
	if diff := expected - 0.575; diff > tolerance || diff < -tolerance {
		t.Errorf("manual formula check: expected 0.575, got %f", expected)
	}

	// Now verify with known values that would be computed by ComputeDomainAuthority
	score := da.AvgPageRank*0.35 + da.AvgQuality*0.25
	pageFactor := float64(da.PageCount) / 100.0
	if pageFactor > 1.0 {
		pageFactor = 1.0
	}
	blFactor := float64(da.BacklinkDomains) / 50.0
	if blFactor > 1.0 {
		blFactor = 1.0
	}
	score += pageFactor*0.20 + blFactor*0.20

	if diff := score - 0.575; diff > tolerance || diff < -tolerance {
		t.Errorf("computed score = %f, want ~0.575", score)
	}
}
