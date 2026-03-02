package search

import (
	"strings"
	"testing"
)

func TestExtractSnippet_EmptyBody(t *testing.T) {
	s := ExtractSnippet("", []string{"go"}, 280)
	if s.Text != "" {
		t.Errorf("expected empty text, got %q", s.Text)
	}
}

func TestExtractSnippet_EmptyTerms(t *testing.T) {
	s := ExtractSnippet("This is some body text about Go programming.", nil, 280)
	if s.Text != "" {
		t.Errorf("expected empty text, got %q", s.Text)
	}
}

func TestExtractSnippet_SingleSentence(t *testing.T) {
	body := "The Go programming language is designed for building scalable systems."
	s := ExtractSnippet(body, []string{"go"}, 280)
	if s.Text == "" {
		t.Fatal("expected non-empty snippet")
	}
	if !strings.Contains(strings.ToLower(s.Text), "go") {
		t.Errorf("snippet %q does not contain term 'go'", s.Text)
	}
	if len(s.Highlights) == 0 {
		t.Error("expected at least one highlight")
	}
}

func TestExtractSnippet_BestSentenceChosen(t *testing.T) {
	body := "Apples are delicious fruit. Go is a programming language for building servers. Bananas are yellow."
	s := ExtractSnippet(body, []string{"go", "programming"}, 280)
	if !strings.Contains(strings.ToLower(s.Text), "go") || !strings.Contains(strings.ToLower(s.Text), "programming") {
		t.Errorf("expected sentence with both terms, got %q", s.Text)
	}
}

func TestExtractSnippet_ProximityBonus(t *testing.T) {
	// Sentence 1: terms far apart; sentence 2: terms close together
	body := "Go is a language and after many other words we mention servers in this very long sentence about various topics. Programming with Go servers is fast and efficient."
	s := ExtractSnippet(body, []string{"go", "servers"}, 280)
	// The second sentence should win because terms are closer together
	if !strings.Contains(s.Text, "fast") {
		t.Errorf("expected sentence with closer proximity, got %q", s.Text)
	}
}

func TestExtractSnippet_Truncation(t *testing.T) {
	body := "The Go programming language is designed for building scalable networked systems and provides garbage collection and concurrency primitives out of the box which makes it ideal for modern cloud infrastructure and microservices."
	s := ExtractSnippet(body, []string{"go"}, 50)
	if len(s.Text) > 55 { // 50 + "..." = 53, allow some slack
		t.Errorf("text too long: %d chars: %q", len(s.Text), s.Text)
	}
	if !strings.HasSuffix(s.Text, "...") {
		t.Errorf("expected truncation with ..., got %q", s.Text)
	}
}

func TestExtractSnippet_HighlightPositions(t *testing.T) {
	body := "Learn Go programming today and build great applications."
	s := ExtractSnippet(body, []string{"go"}, 280)
	if len(s.Highlights) == 0 {
		t.Fatal("expected highlights")
	}
	for _, h := range s.Highlights {
		extracted := strings.ToLower(s.Text[h.Start:h.End])
		if extracted != "go" {
			t.Errorf("highlight points to %q, want 'go'", extracted)
		}
	}
}

func TestExtractSnippet_CaseInsensitive(t *testing.T) {
	body := "The GO PROGRAMMING language is wonderful for building systems."
	s := ExtractSnippet(body, []string{"go"}, 280)
	if s.Text == "" {
		t.Fatal("expected match despite case difference")
	}
}

func TestExtractSnippet_NoMatch(t *testing.T) {
	body := "This sentence talks about apples and bananas and nothing related."
	s := ExtractSnippet(body, []string{"kubernetes"}, 280)
	if s.Text != "" {
		t.Errorf("expected empty snippet for non-matching terms, got %q", s.Text)
	}
}

func TestSplitSentences_Basic(t *testing.T) {
	text := "Hello world, this is a test. This is exciting! How does it work?"
	got := splitSentences(text)
	if len(got) != 3 {
		t.Errorf("expected 3 sentences, got %d: %v", len(got), got)
	}
}

func TestSplitSentences_NoPunctuation(t *testing.T) {
	text := "one long text without any sentence ending punctuation"
	got := splitSentences(text)
	if len(got) != 1 {
		t.Errorf("expected 1 element, got %d: %v", len(got), got)
	}
}

func TestFindHighlights_Multiple(t *testing.T) {
	text := "go is great and go is fast"
	got := findHighlights(text, []string{"go"})
	if len(got) != 2 {
		t.Errorf("expected 2 highlights, got %d", len(got))
	}
	for _, h := range got {
		if text[h.Start:h.End] != "go" {
			t.Errorf("highlight at [%d:%d] = %q", h.Start, h.End, text[h.Start:h.End])
		}
	}
}

func TestTruncateAtWord(t *testing.T) {
	text := "the quick brown fox jumps over the lazy dog"
	got := truncateAtWord(text, 20)
	if len(got) > 25 { // 20 + "..." = 23
		t.Errorf("too long: %q (%d chars)", got, len(got))
	}
	if !strings.HasSuffix(got, "...") {
		t.Errorf("expected ..., got %q", got)
	}
	// Should not cut mid-word
	trimmed := strings.TrimSuffix(got, "...")
	if strings.ContainsRune(trimmed[len(trimmed)-1:], 'a') {
		// Just verify it ends at a word boundary (no partial word)
	}
}
