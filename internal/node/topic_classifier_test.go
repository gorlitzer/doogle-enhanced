package node

import "testing"

func TestClassifyQuery_SingleKeyword(t *testing.T) {
	tests := []struct {
		query    string
		expected string
	}{
		{"python programming tutorial", "tech"},
		{"bitcoin ethereum defi", "blockchain"},
		{"recipe for chocolate cake", "food"},
		{"football scores today", "sports"},
		{"climate change renewable energy", "environment"},
		{"medical treatment diagnosis", "health"},
	}

	for _, tt := range tests {
		got := ClassifyQuery(tt.query)
		if got != tt.expected {
			t.Errorf("ClassifyQuery(%q) = %q, want %q", tt.query, got, tt.expected)
		}
	}
}

func TestClassifyQuery_NoMatch(t *testing.T) {
	got := ClassifyQuery("xyzzy qwerty asdfgh")
	if got != "" {
		t.Errorf("ClassifyQuery(gibberish) = %q, want empty", got)
	}
}

func TestClassifyQuery_EmptyQuery(t *testing.T) {
	got := ClassifyQuery("")
	if got != "" {
		t.Errorf("ClassifyQuery(\"\") = %q, want empty", got)
	}
}

func TestClassifyQuery_MultiWordQuery(t *testing.T) {
	// "science research paper" should match science
	got := ClassifyQuery("science research paper")
	if got != "science" {
		t.Errorf("ClassifyQuery(\"science research paper\") = %q, want \"science\"", got)
	}
}

func TestClassifyQuery_CaseInsensitive(t *testing.T) {
	got := ClassifyQuery("BLOCKCHAIN CRYPTO BITCOIN")
	if got != "blockchain" {
		t.Errorf("ClassifyQuery(uppercase) = %q, want \"blockchain\"", got)
	}
}
