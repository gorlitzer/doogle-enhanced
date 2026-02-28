package indexer

import (
	"math"
	"regexp"
	"strings"
	"unicode"
)

// ReadabilityMetrics holds comprehensive readability analysis results.
type ReadabilityMetrics struct {
	FleschReadingEase      float64 `json:"flesch_reading_ease"`       // 0-100 (higher = easier)
	FleschKincaidGrade     float64 `json:"flesch_kincaid_grade"`      // US grade level
	AverageWordsPerSent    float64 `json:"avg_words_per_sentence"`
	AverageSyllablesPerWord float64 `json:"avg_syllables_per_word"`
	ComplexWordCount       int     `json:"complex_word_count"`        // 3+ syllable words
	LongWordCount          int     `json:"long_word_count"`           // 7+ char words
	SentenceCount          int     `json:"sentence_count"`
	WordCount              int     `json:"word_count"`
	SyllableCount          int     `json:"syllable_count"`
	ReadabilityScore       float64 `json:"readability_score"`         // 0-1 normalized
}

// CitationMetrics quantifies how well a document cites sources.
type CitationMetrics struct {
	URLCount                 int     `json:"url_count"`
	BracketCitationCount     int     `json:"bracket_citation_count"`
	ParentheticalCiteCount   int     `json:"parenthetical_cite_count"`
	HasReferenceSection      bool    `json:"has_reference_section"`
	ScholarlyKeywordCount    int     `json:"scholarly_keyword_count"`
	CitationScore            float64 `json:"citation_score"` // 0-1
}

// AuthorCredibility measures author authority signals.
type AuthorCredibility struct {
	CredentialCount      int     `json:"credential_count"`
	AffiliationCount     int     `json:"affiliation_count"`
	FirstPersonAuthority bool    `json:"first_person_authority"`
	CredibilityScore     float64 `json:"credibility_score"` // 0-1
}

// ReadabilityAnalyzer performs readability, citation, and credibility analysis.
type ReadabilityAnalyzer struct{}

// NewReadabilityAnalyzer creates a readability analyzer.
func NewReadabilityAnalyzer() *ReadabilityAnalyzer {
	return &ReadabilityAnalyzer{}
}

// Analyze computes all readability metrics.
func (ra *ReadabilityAnalyzer) Analyze(text string) ReadabilityMetrics {
	sentences := getSentences(text)
	words := getWords(text)

	m := ReadabilityMetrics{
		SentenceCount: len(sentences),
		WordCount:     len(words),
	}
	if m.WordCount == 0 || m.SentenceCount == 0 {
		return m
	}

	m.SyllableCount = countTotalSyllables(words)
	m.ComplexWordCount = countComplexWords(words)
	m.LongWordCount = countLongWords(words)
	m.AverageWordsPerSent = float64(m.WordCount) / float64(m.SentenceCount)
	m.AverageSyllablesPerWord = float64(m.SyllableCount) / float64(m.WordCount)

	// Flesch Reading Ease: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
	m.FleschReadingEase = 206.835 - 1.015*m.AverageWordsPerSent - 84.6*m.AverageSyllablesPerWord
	m.FleschReadingEase = math.Max(0, math.Min(100, m.FleschReadingEase))

	// Flesch-Kincaid Grade: 0.39*(words/sentences) + 11.8*(syllables/words) - 15.59
	m.FleschKincaidGrade = 0.39*m.AverageWordsPerSent + 11.8*m.AverageSyllablesPerWord - 15.59
	m.FleschKincaidGrade = math.Max(0, m.FleschKincaidGrade)

	m.ReadabilityScore = ra.overallScore(m)
	return m
}

func (ra *ReadabilityAnalyzer) overallScore(m ReadabilityMetrics) float64 {
	score := 0.5

	// Flesch Reading Ease contribution (higher = easier = more accessible)
	score += (m.FleschReadingEase / 100.0) * 0.30

	// Sentence length: 10-25 words/sentence is optimal
	if m.AverageWordsPerSent >= 10 && m.AverageWordsPerSent <= 25 {
		score += 0.15
	} else if m.AverageWordsPerSent < 5 || m.AverageWordsPerSent > 40 {
		score -= 0.10
	}

	// Word complexity: < 15% complex words is good
	if m.WordCount > 0 {
		complexRatio := float64(m.ComplexWordCount) / float64(m.WordCount)
		if complexRatio < 0.15 {
			score += 0.10
		} else if complexRatio > 0.30 {
			score -= 0.10
		}
	}

	// Vocabulary diversity
	uniqueWords := make(map[string]bool)
	// Approximate — we use word count as proxy since we don't have the original words
	diversityEstimate := math.Min(1.0, float64(m.LongWordCount)/float64(m.WordCount+1)*5)
	if diversityEstimate > 0.5 {
		score += 0.05
	}
	_ = uniqueWords

	return clamp(score)
}

// AnalyzeCitations computes citation quality metrics.
func (ra *ReadabilityAnalyzer) AnalyzeCitations(text string) CitationMetrics {
	m := CitationMetrics{}

	// Count URL references
	urlRe := regexp.MustCompile(`https?://[^\s<>"]+`)
	m.URLCount = len(urlRe.FindAllString(text, -1))

	// Bracket citations: [1], [2], etc.
	bracketRe := regexp.MustCompile(`\[\d+\]`)
	m.BracketCitationCount = len(bracketRe.FindAllString(text, -1))

	// Parenthetical citations: (Smith 2020), (Author, Year)
	parenRe := regexp.MustCompile(`\([A-Z][a-z]+(?:,?\s+(?:19|20)\d{2}|\s+et\s+al\.?)\)`)
	m.ParentheticalCiteCount = len(parenRe.FindAllString(text, -1))

	// Reference section
	lower := strings.ToLower(text)
	m.HasReferenceSection = strings.Contains(lower, "references\n") ||
		strings.Contains(lower, "bibliography") ||
		strings.Contains(lower, "works cited") ||
		strings.Contains(lower, "sources\n")

	// Scholarly keywords
	scholarlyWords := []string{
		"study", "research", "analysis", "findings", "methodology",
		"peer-reviewed", "published", "journal", "abstract", "conclusion",
		"literature review", "meta-analysis", "sample size", "statistical",
	}
	for _, w := range scholarlyWords {
		if strings.Contains(lower, w) {
			m.ScholarlyKeywordCount++
		}
	}

	// Compute citation score
	score := 0.0
	score += math.Min(float64(m.URLCount)*0.05, 0.30)
	score += math.Min(float64(m.BracketCitationCount)*0.05, 0.20)
	score += math.Min(float64(m.ParentheticalCiteCount)*0.05, 0.20)
	if m.HasReferenceSection {
		score += 0.15
	}
	if m.ScholarlyKeywordCount >= 3 {
		score += 0.15
	}
	m.CitationScore = clamp(score)

	return m
}

// AnalyzeAuthorCredibility detects author expertise signals.
func (ra *ReadabilityAnalyzer) AnalyzeAuthorCredibility(text string) AuthorCredibility {
	m := AuthorCredibility{}

	// Credentials: PhD, Dr., Professor, etc.
	credentials := []string{
		"ph.d", "phd", "m.d.", "dr.", "professor", "prof.",
		"researcher", "scientist", "engineer", "architect",
	}
	lower := strings.ToLower(text)
	for _, c := range credentials {
		if strings.Contains(lower, c) {
			m.CredentialCount++
		}
	}

	// Affiliations: University, Institute, etc.
	affiliations := []string{
		"university", "institute", "laboratory", "research center",
		"hospital", "college", "academy", "foundation",
	}
	for _, a := range affiliations {
		if strings.Contains(lower, a) {
			m.AffiliationCount++
		}
	}

	// First-person authority
	authorityPhrases := []string{
		"in my research", "i have published", "my work", "our study",
		"our findings", "we demonstrate", "our team",
	}
	for _, p := range authorityPhrases {
		if strings.Contains(lower, p) {
			m.FirstPersonAuthority = true
			break
		}
	}

	score := 0.0
	score += math.Min(float64(m.CredentialCount)*0.15, 0.40)
	score += math.Min(float64(m.AffiliationCount)*0.10, 0.30)
	if m.FirstPersonAuthority {
		score += 0.20
	}
	m.CredibilityScore = clamp(score)

	return m
}

// --- text splitting helpers ---

func getSentences(text string) []string {
	// Split on sentence-ending punctuation followed by whitespace
	re := regexp.MustCompile(`[.!?]+\s+`)
	parts := re.Split(text, -1)
	var sentences []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if len(p) > 0 {
			sentences = append(sentences, p)
		}
	}
	return sentences
}

func getWords(text string) []string {
	var words []string
	for _, w := range strings.Fields(text) {
		cleaned := strings.TrimFunc(w, func(r rune) bool {
			return !unicode.IsLetter(r) && !unicode.IsNumber(r)
		})
		if len(cleaned) >= 2 {
			words = append(words, strings.ToLower(cleaned))
		}
	}
	return words
}

func countTotalSyllables(words []string) int {
	total := 0
	for _, w := range words {
		total += countSyllables(w)
	}
	return total
}

// countSyllables estimates syllable count for an English word.
func countSyllables(word string) int {
	word = strings.ToLower(word)
	if len(word) <= 2 {
		return 1
	}

	vowels := "aeiouy"
	count := 0
	prevWasVowel := false

	for i, ch := range word {
		isVowel := strings.ContainsRune(vowels, ch)
		if isVowel && !prevWasVowel {
			count++
		}
		prevWasVowel = isVowel
		_ = i
	}

	// Silent 'e' at end
	if strings.HasSuffix(word, "e") && count > 1 {
		count--
	}

	if count < 1 {
		count = 1
	}
	return count
}

func countComplexWords(words []string) int {
	count := 0
	for _, w := range words {
		if countSyllables(w) >= 3 {
			count++
		}
	}
	return count
}

func countLongWords(words []string) int {
	count := 0
	for _, w := range words {
		if len(w) >= 7 {
			count++
		}
	}
	return count
}
