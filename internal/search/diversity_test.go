package search

import (
	"testing"

	"github.com/doogle/doogle-v2/internal/models"
)

func makeResult(url string, score float64) models.SearchResult {
	return models.SearchResult{URL: url, Score: score}
}

func TestDomainDiversity_Empty(t *testing.T) {
	got := ApplyDomainDiversity(nil, 2, 10)
	if len(got) != 0 {
		t.Errorf("expected empty, got %d results", len(got))
	}
}

func TestDomainDiversity_SingleResult(t *testing.T) {
	in := []models.SearchResult{makeResult("https://example.com/a", 1.0)}
	got := ApplyDomainDiversity(in, 2, 10)
	if len(got) != 1 {
		t.Fatalf("expected 1, got %d", len(got))
	}
	if got[0].URL != in[0].URL {
		t.Errorf("result changed")
	}
}

func TestDomainDiversity_NoCap(t *testing.T) {
	in := []models.SearchResult{
		makeResult("https://example.com/a", 3.0),
		makeResult("https://example.com/b", 2.0),
		makeResult("https://example.com/c", 1.0),
	}
	got := ApplyDomainDiversity(in, 0, 10)
	if len(got) != 3 {
		t.Fatalf("expected 3, got %d", len(got))
	}
	// Order should be unchanged when maxPerDomain=0
	for i := range in {
		if got[i].URL != in[i].URL {
			t.Errorf("position %d: got %s, want %s", i, got[i].URL, in[i].URL)
		}
	}
}

func TestDomainDiversity_AllDifferentDomains(t *testing.T) {
	in := []models.SearchResult{
		makeResult("https://a.com/1", 5.0),
		makeResult("https://b.com/1", 4.0),
		makeResult("https://c.com/1", 3.0),
		makeResult("https://d.com/1", 2.0),
		makeResult("https://e.com/1", 1.0),
	}
	got := ApplyDomainDiversity(in, 2, 10)
	if len(got) != 5 {
		t.Fatalf("expected 5, got %d", len(got))
	}
	for i := range in {
		if got[i].URL != in[i].URL {
			t.Errorf("position %d: got %s, want %s", i, got[i].URL, in[i].URL)
		}
	}
}

func TestDomainDiversity_SameDomainCapped(t *testing.T) {
	in := []models.SearchResult{
		makeResult("https://example.com/a", 4.0),
		makeResult("https://example.com/b", 3.0),
		makeResult("https://example.com/c", 2.0),
		makeResult("https://example.com/d", 1.0),
	}
	got := ApplyDomainDiversity(in, 2, 10)
	if len(got) != 4 {
		t.Fatalf("expected 4, got %d", len(got))
	}
	// First two kept in place, last two are demoted
	if got[0].URL != "https://example.com/a" {
		t.Errorf("pos 0: got %s", got[0].URL)
	}
	if got[1].URL != "https://example.com/b" {
		t.Errorf("pos 1: got %s", got[1].URL)
	}
	// Demoted results follow
	if got[2].URL != "https://example.com/c" {
		t.Errorf("pos 2: got %s, want demoted /c", got[2].URL)
	}
	if got[3].URL != "https://example.com/d" {
		t.Errorf("pos 3: got %s, want demoted /d", got[3].URL)
	}
}

func TestDomainDiversity_MixedDomains(t *testing.T) {
	in := []models.SearchResult{
		makeResult("https://a.com/1", 6.0),
		makeResult("https://a.com/2", 5.0),
		makeResult("https://a.com/3", 4.0),
		makeResult("https://b.com/1", 3.0),
		makeResult("https://b.com/2", 2.0),
	}
	got := ApplyDomainDiversity(in, 2, 10)
	if len(got) != 5 {
		t.Fatalf("expected 5, got %d", len(got))
	}
	// a.com/1 and a.com/2 kept, a.com/3 demoted; b.com/1 and b.com/2 kept
	// Kept: a.com/1, a.com/2, b.com/1, b.com/2 + demoted: a.com/3
	if got[0].URL != "https://a.com/1" {
		t.Errorf("pos 0: got %s", got[0].URL)
	}
	if got[1].URL != "https://a.com/2" {
		t.Errorf("pos 1: got %s", got[1].URL)
	}
	if got[2].URL != "https://b.com/1" {
		t.Errorf("pos 2: got %s", got[2].URL)
	}
	if got[3].URL != "https://b.com/2" {
		t.Errorf("pos 3: got %s", got[3].URL)
	}
	if got[4].URL != "https://a.com/3" {
		t.Errorf("pos 4: got %s, want demoted a.com/3", got[4].URL)
	}
}

func TestDomainDiversity_TopNBoundary(t *testing.T) {
	in := []models.SearchResult{
		makeResult("https://a.com/1", 5.0),
		makeResult("https://a.com/2", 4.0),
		makeResult("https://a.com/3", 3.0), // beyond topN=2
		makeResult("https://a.com/4", 2.0), // beyond topN=2
	}
	got := ApplyDomainDiversity(in, 1, 2)
	if len(got) != 4 {
		t.Fatalf("expected 4, got %d", len(got))
	}
	// Only first 2 (topN) are subject to cap; a.com/1 kept, a.com/2 demoted
	// Then demoted (a.com/2) + tail (a.com/3, a.com/4)
	if got[0].URL != "https://a.com/1" {
		t.Errorf("pos 0: got %s", got[0].URL)
	}
	// Demoted comes next, then the beyond-topN items
	if got[1].URL != "https://a.com/2" {
		t.Errorf("pos 1: got %s, want demoted a.com/2", got[1].URL)
	}
	if got[2].URL != "https://a.com/3" {
		t.Errorf("pos 2: got %s", got[2].URL)
	}
	if got[3].URL != "https://a.com/4" {
		t.Errorf("pos 3: got %s", got[3].URL)
	}
}

func TestRegistrableDomain_Subdomain(t *testing.T) {
	got := registrableDomain("https://docs.example.com/path")
	if got != "example.com" {
		t.Errorf("got %q, want example.com", got)
	}
}

func TestRegistrableDomain_WWW(t *testing.T) {
	got := registrableDomain("https://www.example.com/")
	if got != "example.com" {
		t.Errorf("got %q, want example.com", got)
	}
}

func TestRegistrableDomain_Bare(t *testing.T) {
	got := registrableDomain("https://example.com")
	if got != "example.com" {
		t.Errorf("got %q, want example.com", got)
	}
}

func TestRegistrableDomain_Invalid(t *testing.T) {
	got := registrableDomain("not-a-url")
	if got != "not-a-url" {
		t.Errorf("got %q, want raw input fallback", got)
	}
}
