package indexer

import (
	"strings"
	"testing"
)

func TestSummarizer_Summarize(t *testing.T) {
	s := NewSummarizer()

	t.Run("short text returned as-is", func(t *testing.T) {
		text := "The cat sat on the mat. Dogs are friendly."
		result := s.Summarize(text, 5)
		if result != text {
			t.Fatalf("expected short text returned unchanged, got %q", result)
		}
	})

	t.Run("long text summarized", func(t *testing.T) {
		text := "Machine learning is a subset of artificial intelligence. " +
			"It enables computers to learn from data without explicit programming. " +
			"Deep learning uses neural networks with many layers. " +
			"Supervised learning requires labeled training data for the model. " +
			"Unsupervised learning discovers hidden patterns in unlabeled data. " +
			"Reinforcement learning trains agents through rewards and penalties. " +
			"Natural language processing handles human language understanding. " +
			"Computer vision allows machines to interpret visual information."

		result := s.Summarize(text, 3)
		sentences := strings.Count(result, ".") + strings.Count(result, "!")
		if sentences > 4 {
			t.Fatalf("expected ~3 sentences, got text with %d periods: %q", sentences, result)
		}
		if len(result) >= len(text) {
			t.Fatal("expected summary shorter than original")
		}
	})

	t.Run("empty text", func(t *testing.T) {
		result := s.Summarize("", 3)
		if result != "" {
			t.Fatalf("expected empty result for empty input, got %q", result)
		}
	})
}

func TestSummarizer_SummarizeWithTitle(t *testing.T) {
	s := NewSummarizer()

	text := "Machine learning is a subset of artificial intelligence. " +
		"It enables computers to learn from data without explicit programming. " +
		"Deep learning uses neural networks with many layers. " +
		"Cats are adorable pets that enjoy sleeping. " +
		"Dogs love to play fetch in the park. " +
		"Machine learning algorithms improve with more training data. " +
		"Natural language processing handles human language understanding."

	result := s.SummarizeWithTitle(text, "Machine Learning Guide", 3)

	// Title-boosted summary should prefer ML-related sentences
	if !strings.Contains(strings.ToLower(result), "machine learning") {
		t.Fatalf("expected title-related content in summary, got %q", result)
	}
}

func TestWordOverlap(t *testing.T) {
	a := map[string]bool{"cat": true, "dog": true, "bird": true}
	b := map[string]bool{"cat": true, "fish": true, "bird": true}

	overlap := wordOverlap(a, b)
	if overlap <= 0 {
		t.Fatalf("expected positive overlap, got %.2f", overlap)
	}

	// No overlap
	c := map[string]bool{"tree": true, "rock": true}
	if wordOverlap(a, c) != 0 {
		t.Fatal("expected zero overlap for disjoint sets")
	}

	// Empty sets
	if wordOverlap(map[string]bool{}, b) != 0 {
		t.Fatal("expected zero overlap for empty set")
	}
}

func TestSplitSentences(t *testing.T) {
	text := "Hello world. This is a test sentence! Is this working? Yes it should work correctly."
	sentences := splitSentences(text)
	if len(sentences) < 3 {
		t.Fatalf("expected >= 3 sentences, got %d: %v", len(sentences), sentences)
	}
}
