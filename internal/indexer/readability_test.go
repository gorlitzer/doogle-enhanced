package indexer

import (
	"testing"
)

func TestReadabilityAnalyzer_Analyze(t *testing.T) {
	ra := NewReadabilityAnalyzer()

	t.Run("simple text", func(t *testing.T) {
		text := "The cat sat on the mat. The dog ran in the park. Birds fly in the sky."
		m := ra.Analyze(text)
		if m.WordCount == 0 {
			t.Fatal("expected non-zero word count")
		}
		if m.SentenceCount == 0 {
			t.Fatal("expected non-zero sentence count")
		}
		if m.FleschReadingEase <= 0 {
			t.Fatalf("expected positive Flesch score, got %.2f", m.FleschReadingEase)
		}
		if m.ReadabilityScore <= 0 || m.ReadabilityScore > 1.0 {
			t.Fatalf("expected readability score in (0,1], got %.2f", m.ReadabilityScore)
		}
	})

	t.Run("empty text", func(t *testing.T) {
		m := ra.Analyze("")
		if m.WordCount != 0 {
			t.Fatalf("expected 0 words for empty text, got %d", m.WordCount)
		}
		if m.ReadabilityScore != 0 {
			t.Fatalf("expected 0 readability for empty text, got %.2f", m.ReadabilityScore)
		}
	})

	t.Run("complex academic text", func(t *testing.T) {
		text := "The methodological considerations necessitate comprehensive examination of the epistemological foundations. Interdisciplinary approaches demonstrate substantive improvements in understanding phenomenological manifestations. The quantitative analysis reveals statistically significant correlations between the independent variables."
		m := ra.Analyze(text)
		if m.ComplexWordCount == 0 {
			t.Fatal("expected complex words in academic text")
		}
		if m.FleschKincaidGrade < 10 {
			t.Fatalf("expected high grade level for academic text, got %.1f", m.FleschKincaidGrade)
		}
	})

	t.Run("syllable counting", func(t *testing.T) {
		cases := []struct {
			word     string
			expected int
		}{
			{"the", 1},
			{"cat", 1},
			{"apple", 1},  // silent-e rule: 2 vowel groups - 1 = 1
			{"beautiful", 3},
			{"understanding", 4},
		}
		for _, tc := range cases {
			got := countSyllables(tc.word)
			if got != tc.expected {
				t.Errorf("countSyllables(%q) = %d, want %d", tc.word, got, tc.expected)
			}
		}
	})
}

func TestReadabilityAnalyzer_Citations(t *testing.T) {
	ra := NewReadabilityAnalyzer()

	t.Run("scholarly text", func(t *testing.T) {
		text := `This study examines the methodology of peer-reviewed research.
According to (Smith 2020), the findings suggest statistical improvements.
See also (Jones 2019) for a meta-analysis of sample size effects.
References
[1] Smith, J. "On methodology." Journal of Science, 2020.
[2] Jones, K. "Statistical analysis." Research Review, 2019.
https://example.com/paper1 https://example.com/paper2`

		m := ra.AnalyzeCitations(text)
		if m.URLCount < 2 {
			t.Fatalf("expected >= 2 URLs, got %d", m.URLCount)
		}
		if m.BracketCitationCount < 2 {
			t.Fatalf("expected >= 2 bracket citations, got %d", m.BracketCitationCount)
		}
		if m.ParentheticalCiteCount < 1 {
			t.Fatalf("expected >= 1 parenthetical cite, got %d", m.ParentheticalCiteCount)
		}
		if !m.HasReferenceSection {
			t.Fatal("expected reference section detected")
		}
		if m.ScholarlyKeywordCount < 3 {
			t.Fatalf("expected >= 3 scholarly keywords, got %d", m.ScholarlyKeywordCount)
		}
		if m.CitationScore <= 0.5 {
			t.Fatalf("expected high citation score, got %.2f", m.CitationScore)
		}
	})

	t.Run("no citations", func(t *testing.T) {
		m := ra.AnalyzeCitations("The cat sat on the mat.")
		if m.CitationScore > 0.1 {
			t.Fatalf("expected near-zero citation score, got %.2f", m.CitationScore)
		}
	})
}

func TestReadabilityAnalyzer_AuthorCredibility(t *testing.T) {
	ra := NewReadabilityAnalyzer()

	t.Run("credible author", func(t *testing.T) {
		text := "Dr. Smith, a professor at the University of Oxford, published this research. In my research, I have demonstrated significant results."
		m := ra.AnalyzeAuthorCredibility(text)
		if m.CredentialCount == 0 {
			t.Fatal("expected credentials detected")
		}
		if m.AffiliationCount == 0 {
			t.Fatal("expected affiliations detected")
		}
		if !m.FirstPersonAuthority {
			t.Fatal("expected first-person authority detected")
		}
		if m.CredibilityScore <= 0.3 {
			t.Fatalf("expected high credibility score, got %.2f", m.CredibilityScore)
		}
	})

	t.Run("no credibility signals", func(t *testing.T) {
		m := ra.AnalyzeAuthorCredibility("I like cats. They are fluffy.")
		if m.CredibilityScore > 0.1 {
			t.Fatalf("expected low credibility score, got %.2f", m.CredibilityScore)
		}
	})
}
