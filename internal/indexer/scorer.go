package indexer

import (
	"math"
	"strings"

	"github.com/doogle/doogle-v2/internal/models"
)

// Scorer computes multiple quality signals for documents:
// E-E-A-T, quality, spam, link score, and SEO score.
type Scorer struct {
	analyzer *Analyzer
}

// NewScorer creates a document scorer.
func NewScorer() *Scorer {
	return &Scorer{analyzer: NewAnalyzer()}
}

// Scores holds all computed scoring signals.
type Scores struct {
	EEAT       float64
	Quality    float64
	Spam       float64
	Link       float64
	SEO        float64
	Relevance  float64 // composite
}

// Score computes all scoring signals for a document.
func (s *Scorer) Score(doc *models.Document) Scores {
	sc := Scores{
		EEAT:    s.eeatScore(doc),
		Quality: s.qualityScore(doc),
		Spam:    s.spamScore(doc),
		Link:    s.linkScore(doc),
		SEO:     s.seoScore(doc),
	}
	// Composite relevance: weighted combination
	sc.Relevance = (sc.EEAT*0.30 + sc.Quality*0.35 + sc.Link*0.20 + sc.SEO*0.15)
	// Penalize by spam
	sc.Relevance *= (1.0 - sc.Spam*0.5)
	sc.Relevance = clamp(sc.Relevance)
	return sc
}

// eeatScore computes Google's E-E-A-T: Experience, Expertise, Authoritativeness, Trustworthiness.
func (s *Scorer) eeatScore(doc *models.Document) float64 {
	score := 0.0
	content := strings.ToLower(doc.Content)
	title := strings.ToLower(doc.Title)

	// Experience signals: first-hand accounts
	experiencePhrases := []string{
		"in my experience", "i have tested", "i personally", "from my experience",
		"having used", "i found that", "in practice", "hands-on",
	}
	for _, phrase := range experiencePhrases {
		if strings.Contains(content, phrase) {
			score += 0.05
		}
	}
	score = math.Min(score, 0.20) // cap experience contribution

	// Expertise signals: domain knowledge indicators
	expertiseWords := []string{
		"research", "study", "analysis", "data", "statistics", "methodology",
		"findings", "evidence", "hypothesis", "conclusion", "experiment",
		"peer-reviewed", "published", "journal",
	}
	expertCount := 0
	for _, word := range expertiseWords {
		if strings.Contains(content, word) || strings.Contains(title, word) {
			expertCount++
		}
	}
	score += math.Min(float64(expertCount)*0.04, 0.25)

	// Authoritativeness: content depth and citations
	wordCount := s.analyzer.WordCount(doc.Content)
	if wordCount > 1000 {
		score += 0.15 // substantial content
	} else if wordCount > 500 {
		score += 0.08
	}
	linkCount := len(doc.Links)
	if linkCount >= 3 && linkCount <= 50 {
		score += 0.10 // cites sources but not a link farm
	}

	// Trustworthiness signals
	if doc.IsHTTPS {
		score += 0.10
	}
	// Trusted TLDs
	domainLower := strings.ToLower(doc.Domain)
	if strings.HasSuffix(domainLower, ".edu") || strings.HasSuffix(domainLower, ".gov") || strings.HasSuffix(domainLower, ".org") {
		score += 0.15
	}
	// Absence of suspicious patterns
	if !containsSuspiciousPatterns(content) {
		score += 0.05
	}

	return clamp(score)
}

// qualityScore evaluates content quality across multiple dimensions.
func (s *Scorer) qualityScore(doc *models.Document) float64 {
	score := 0.0

	// Title quality: exists and is well-sized
	titleLen := len(doc.Title)
	if titleLen >= 10 && titleLen <= 100 {
		score += 0.15
		// Bonus if title doesn't contain spam words
		if !containsAny(strings.ToLower(doc.Title), []string{"click here", "buy now", "free money"}) {
			score += 0.05
		}
	} else if titleLen > 0 {
		score += 0.05
	}

	// Content length (optimal: 300-5000 words)
	wordCount := s.analyzer.WordCount(doc.Content)
	if wordCount >= 300 {
		score += 0.15
	}
	if wordCount >= 1000 {
		score += 0.10 // substantial depth
	}
	if wordCount > 10000 {
		score -= 0.05 // might be a dump page
	}
	if wordCount < 100 && wordCount > 0 {
		score += 0.03 // minimal credit for having something
	}

	// Content structure: paragraphs and headings
	if strings.Contains(doc.Content, "\n\n") || len(doc.Headings) > 0 {
		score += 0.10
	}
	if len(doc.Headings) >= 3 {
		score += 0.05 // well-structured with multiple sections
	}

	// Media richness
	imgCount := len(doc.Images)
	if imgCount >= 1 && imgCount <= 50 {
		score += 0.10
	}

	// Link quality: some outbound links show research, too many is suspicious
	linkCount := len(doc.Links)
	if linkCount >= 1 && linkCount <= 100 {
		score += 0.10
	}

	// Meta description present
	if len(doc.Description) >= 50 {
		score += 0.05
	}

	// Semantic density (0.2-0.6 is the sweet spot)
	density := s.analyzer.SemanticDensity(doc.Content)
	if density >= 0.2 && density <= 0.6 {
		score += 0.10
	} else if density > 0 {
		score += 0.03
	}

	// Depth penalty: deeper pages are less likely to be high-quality entry points
	if doc.Depth <= 1 {
		score += 0.05
	}

	return clamp(score)
}

// spamScore detects spam signals. Higher = more likely spam.
func (s *Scorer) spamScore(doc *models.Document) float64 {
	score := 0.0
	content := strings.ToLower(doc.Content)
	title := strings.ToLower(doc.Title)

	// Spam keywords in content
	spamPhrases := []string{
		"buy now", "free money", "click here", "act now", "limited time",
		"no obligation", "winner", "congratulations", "earn money",
		"work from home", "make money", "get rich", "casino", "viagra",
		"weight loss", "as seen on", "call now", "apply online",
		"double your", "extra income", "be your own boss",
	}
	for _, phrase := range spamPhrases {
		if strings.Contains(content, phrase) {
			score += 0.10
		}
		if strings.Contains(title, phrase) {
			score += 0.15 // worse if it's in the title
		}
	}
	score = math.Min(score, 0.60) // cap keyword contribution

	// Excessive caps in title (>50% uppercase)
	if len(doc.Title) > 5 {
		upperCount := 0
		for _, r := range doc.Title {
			if r >= 'A' && r <= 'Z' {
				upperCount++
			}
		}
		if float64(upperCount)/float64(len(doc.Title)) > 0.5 {
			score += 0.15
		}
	}

	// Excessive punctuation in title
	exclaimCount := strings.Count(title, "!") + strings.Count(title, "?")
	if exclaimCount > 2 {
		score += 0.10
	}

	// Thin content
	wordCount := s.analyzer.WordCount(doc.Content)
	if wordCount < 50 {
		score += 0.15
	} else if wordCount < 100 {
		score += 0.05
	}

	// Link farm: excessive links relative to content
	if len(doc.Links) > 100 {
		score += 0.20
	} else if wordCount > 0 && len(doc.Links) > 0 {
		linkDensity := float64(len(doc.Links)) / float64(wordCount)
		if linkDensity > 0.5 { // more than 1 link per 2 words
			score += 0.15
		}
	}

	// Keyword stuffing: any single word appearing extremely frequently
	if wordCount > 50 {
		words := s.analyzer.Tokenize(doc.Content)
		freq := make(map[string]int)
		for _, w := range words {
			if len(w) > 2 && !s.analyzer.stopWords[w] {
				freq[w]++
			}
		}
		for _, count := range freq {
			if count > 20 && float64(count)/float64(wordCount) > 0.05 {
				score += 0.15
				break
			}
		}
	}

	return clamp(score)
}

// linkScore evaluates link profile quality (PageRank-style heuristic).
func (s *Scorer) linkScore(doc *models.Document) float64 {
	score := 0.5 // base score

	linkCount := len(doc.Links)
	internalCount := 0
	externalCount := 0
	for _, l := range doc.Links {
		if l.IsExternal {
			externalCount++
		} else {
			internalCount++
		}
	}

	// Moderate link count is good
	if linkCount >= 3 && linkCount <= 50 {
		score += 0.20
	} else if linkCount >= 1 && linkCount < 3 {
		score += 0.10
	}

	// Quality links: few, well-placed
	if linkCount > 0 && linkCount <= 20 {
		score += 0.15
	}

	// Mix of internal and external is natural
	if externalCount > 0 && internalCount > 0 {
		score += 0.10
	}

	// Depth gives a small bonus (shows the page is reachable)
	if doc.Depth >= 1 && doc.Depth <= 3 {
		score += 0.05
	}

	return clamp(score)
}

// seoScore evaluates on-page SEO signals.
func (s *Scorer) seoScore(doc *models.Document) float64 {
	score := 0.0

	// Title length: 30-60 chars is ideal for SERPs
	titleLen := len(doc.Title)
	if titleLen >= 30 && titleLen <= 60 {
		score += 0.25
	} else if titleLen >= 10 && titleLen <= 100 {
		score += 0.10
	}

	// Meta description: 120-160 chars is ideal
	descLen := len(doc.Description)
	if descLen >= 120 && descLen <= 160 {
		score += 0.25
	} else if descLen >= 50 {
		score += 0.10
	}

	// Content length
	wordCount := s.analyzer.WordCount(doc.Content)
	if wordCount >= 300 {
		score += 0.20
	} else if wordCount >= 100 {
		score += 0.10
	}

	// Heading structure
	if len(doc.Headings) > 0 {
		score += 0.15
	}

	// Images with alt text
	imgWithAlt := 0
	for _, img := range doc.Images {
		if img.Alt != "" {
			imgWithAlt++
		}
	}
	if imgWithAlt > 0 {
		score += 0.10
	}

	// Canonical URL present
	if doc.Canonical != "" {
		score += 0.05
	}

	return clamp(score)
}

// --- helpers ---

func clamp(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func containsAny(text string, phrases []string) bool {
	for _, p := range phrases {
		if strings.Contains(text, p) {
			return true
		}
	}
	return false
}

func containsSuspiciousPatterns(text string) bool {
	suspicious := []string{
		"send bitcoin to", "wire transfer", "western union",
		"money gram", "nigerian prince", "advance fee",
		"lottery winner", "inheritance fund",
	}
	return containsAny(text, suspicious)
}
