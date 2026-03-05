package indexer

import (
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/doogle/doogle-v2/internal/store"
)

// Analyzer provides NLP-style text analysis: tokenization, keyword extraction,
// n-grams, entity extraction, and semantic density measurement.
type Analyzer struct {
	stopWords map[string]bool
}

// NewAnalyzer creates a text analyzer with comprehensive English stop words.
func NewAnalyzer() *Analyzer {
	stops := []string{
		"a", "about", "above", "after", "again", "all", "am", "an", "and",
		"any", "are", "as", "at", "be", "because", "been", "before", "being",
		"below", "between", "both", "but", "by", "can", "could", "did", "do",
		"does", "doing", "down", "during", "each", "few", "for", "from",
		"further", "get", "got", "had", "has", "have", "having", "he", "her",
		"here", "hers", "herself", "him", "himself", "his", "how", "if", "in",
		"into", "is", "it", "its", "itself", "just", "me", "might", "more",
		"most", "must", "my", "myself", "no", "nor", "not", "now", "of", "off",
		"on", "once", "only", "or", "other", "our", "ours", "ourselves", "out",
		"over", "own", "same", "she", "should", "so", "some", "such", "than",
		"that", "the", "their", "theirs", "them", "themselves", "then", "there",
		"these", "they", "this", "those", "through", "to", "too", "under",
		"until", "up", "very", "was", "we", "were", "what", "when", "where",
		"which", "while", "who", "whom", "why", "will", "with", "would",
		"you", "your", "yours", "yourself", "yourselves",
	}
	m := make(map[string]bool, len(stops))
	for _, w := range stops {
		m[w] = true
	}
	return &Analyzer{stopWords: m}
}

// KeywordScore represents a keyword with its relevance score.
type KeywordScore struct {
	Word      string  `json:"word"`
	Score     float64 `json:"score"`
	Frequency int     `json:"frequency"`
}

// ExtractKeywords extracts top-N keywords using TF scoring with position
// weighting and word length bonuses.
func (a *Analyzer) ExtractKeywords(text string, topN int) []KeywordScore {
	words := a.Tokenize(text)
	if len(words) == 0 {
		return nil
	}

	freq := make(map[string]int)
	firstPos := make(map[string]int)
	total := 0

	for i, w := range words {
		if len(w) > 2 && !a.stopWords[w] {
			freq[w]++
			total++
			if _, seen := firstPos[w]; !seen {
				firstPos[w] = i
			}
		}
	}
	if total == 0 {
		return nil
	}

	var scores []KeywordScore
	for word, count := range freq {
		// Term frequency
		tf := float64(count) / float64(total)

		// Position bonus: words appearing earlier in text rank higher
		posBonus := 1.0 / (1.0 + float64(firstPos[word])/100.0)

		// Length bonus: longer words are often more specific/meaningful
		lengthBonus := math.Min(float64(len(word))/10.0, 1.5)

		score := tf * posBonus * lengthBonus

		scores = append(scores, KeywordScore{
			Word:      word,
			Score:     score,
			Frequency: count,
		})
	}

	sort.Slice(scores, func(i, j int) bool {
		return scores[i].Score > scores[j].Score
	})
	if len(scores) > topN {
		scores = scores[:topN]
	}
	return scores
}

// ExtractNGrams extracts n-word phrases, skipping those containing stop words.
func (a *Analyzer) ExtractNGrams(text string, n, topN int) []string {
	words := a.Tokenize(text)
	if len(words) < n {
		return nil
	}

	freq := make(map[string]int)
	for i := 0; i <= len(words)-n; i++ {
		hasStop := false
		for j := 0; j < n; j++ {
			if a.stopWords[words[i+j]] {
				hasStop = true
				break
			}
		}
		if !hasStop {
			ngram := strings.Join(words[i:i+n], " ")
			freq[ngram]++
		}
	}

	type ngramScore struct {
		ngram string
		count int
	}
	var sorted []ngramScore
	for ng, c := range freq {
		if c >= 2 { // only keep n-grams that appear at least twice
			sorted = append(sorted, ngramScore{ng, c})
		}
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].count > sorted[j].count
	})

	var result []string
	for i := 0; i < len(sorted) && i < topN; i++ {
		result = append(result, sorted[i].ngram)
	}
	return result
}

// ExtractBigrams returns the top n 2-word phrases.
func (a *Analyzer) ExtractBigrams(text string, topN int) []string {
	return a.ExtractNGrams(text, 2, topN)
}

// ExtractTrigrams returns the top n 3-word phrases.
func (a *Analyzer) ExtractTrigrams(text string, topN int) []string {
	return a.ExtractNGrams(text, 3, topN)
}

// SemanticDensity measures information density: unique meaningful words / total words.
func (a *Analyzer) SemanticDensity(text string) float64 {
	words := a.Tokenize(text)
	if len(words) == 0 {
		return 0
	}
	unique := make(map[string]bool)
	for _, w := range words {
		if !a.stopWords[w] && len(w) > 2 {
			unique[w] = true
		}
	}
	return float64(len(unique)) / float64(len(words))
}

// WordCount returns the number of words in the text.
func (a *Analyzer) WordCount(text string) int {
	return len(a.Tokenize(text))
}

// Tokenize splits text into normalized lowercase words.
func (a *Analyzer) Tokenize(text string) []string {
	return strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
}

// EntityExtraction contains named entities extracted from text.
type EntityExtraction struct {
	People        []string `json:"people"`
	Organizations []string `json:"organizations"`
	Locations     []string `json:"locations"`
	Dates         []string `json:"dates"`
	Topics        []string `json:"topics"`
}

// ExtractEntities performs simple pattern-based named entity recognition.
func (a *Analyzer) ExtractEntities(text string) EntityExtraction {
	return EntityExtraction{
		People:        extractPeople(text),
		Organizations: extractOrganizations(text),
		Locations:     extractLocations(text),
		Dates:         extractDates(text),
		Topics:        a.extractTopics(text),
	}
}

func extractPeople(text string) []string {
	// Pattern: Capitalized word followed by capitalized word (likely names)
	re := regexp.MustCompile(`\b([A-Z][a-z]{1,20})\s+([A-Z][a-z]{1,20})\b`)
	matches := re.FindAllString(text, -1)
	dedup := make(map[string]bool)
	var result []string
	for _, m := range matches {
		// Filter common false positives
		if !strings.HasPrefix(m, "The ") && !strings.HasPrefix(m, "This ") && !strings.HasPrefix(m, "That ") {
			if !dedup[m] {
				dedup[m] = true
				result = append(result, m)
			}
		}
	}
	if len(result) > 20 {
		result = result[:20]
	}
	return result
}

func extractOrganizations(text string) []string {
	orgKeywords := []string{
		"Inc", "Corp", "Corporation", "LLC", "Ltd", "Company",
		"Institute", "Foundation", "Association", "University",
		"College", "Department", "Agency", "Bureau", "Ministry",
		"Council", "Commission", "Group", "Network",
	}
	orgs := make(map[string]bool)
	for _, kw := range orgKeywords {
		re := regexp.MustCompile(`\b([A-Z][A-Za-z\s]{1,40}` + kw + `)\b`)
		for _, m := range re.FindAllString(text, 5) {
			orgs[strings.TrimSpace(m)] = true
		}
	}
	var result []string
	for org := range orgs {
		result = append(result, org)
	}
	return result
}

func extractLocations(text string) []string {
	locKeywords := []string{
		"City", "State", "Country", "Province", "County", "District",
		"Region", "Island", "Mountain", "River", "Street", "Avenue",
		"Boulevard", "Road", "Square", "Valley",
	}
	locs := make(map[string]bool)
	for _, kw := range locKeywords {
		re := regexp.MustCompile(`\b([A-Z][A-Za-z\s]{1,30}` + kw + `)\b`)
		for _, m := range re.FindAllString(text, 5) {
			locs[strings.TrimSpace(m)] = true
		}
	}
	var result []string
	for loc := range locs {
		result = append(result, loc)
	}
	return result
}

func extractDates(text string) []string {
	patterns := []string{
		`\b\d{1,2}/\d{1,2}/\d{2,4}\b`,
		`\b\d{4}-\d{2}-\d{2}\b`,
		`\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b`,
		`\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b`,
	}
	dates := make(map[string]bool)
	for _, p := range patterns {
		re := regexp.MustCompile(p)
		for _, m := range re.FindAllString(text, 10) {
			dates[m] = true
		}
	}
	var result []string
	for d := range dates {
		result = append(result, d)
	}
	return result
}

func (a *Analyzer) extractTopics(text string) []string {
	topicMap := map[string][]string{
		"technology": {"computer", "software", "hardware", "internet", "digital", "tech", "machine learning", "programming", "code", "data", "cybersecurity", "algorithm", "database", "cloud", "api"},
		"science":    {"research", "study", "experiment", "scientific", "theory", "discovery", "analysis", "hypothesis", "evidence", "journal", "physics", "chemistry", "biology"},
		"health":     {"medical", "health", "doctor", "patient", "disease", "treatment", "medicine", "hospital", "clinic", "diagnosis", "therapy", "symptom"},
		"business":   {"market", "business", "company", "corporate", "finance", "economy", "trade", "investment", "profit", "revenue", "startup", "enterprise"},
		"education":  {"education", "school", "university", "student", "teacher", "learning", "course", "academic", "degree", "curriculum"},
		"politics":   {"government", "political", "election", "policy", "law", "legislation", "congress", "parliament", "president", "democracy"},
		"news":       {"breaking", "reported", "announced", "confirmed", "sources", "journalist", "press", "media", "coverage", "update"},
		"security":   {"security", "threat", "vulnerability", "hack", "breach", "attack", "defense", "protection", "encryption", "privacy"},
	}

	textLower := strings.ToLower(text)
	type scored struct {
		topic string
		score int
	}
	var scores []scored
	for topic, keywords := range topicMap {
		s := 0
		for _, kw := range keywords {
			if strings.Contains(textLower, kw) {
				s++
			}
		}
		if s > 0 {
			scores = append(scores, scored{topic, s})
		}
	}
	sort.Slice(scores, func(i, j int) bool {
		return scores[i].score > scores[j].score
	})
	var result []string
	for i := 0; i < len(scores) && i < 3; i++ {
		result = append(result, scores[i].topic)
	}
	return result
}

// EnhancedEntity represents a named entity with type and confidence score.
type EnhancedEntity struct {
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	Confidence float64 `json:"confidence"`
}

// ExtractEntitiesEnhanced performs pattern-based NER with confidence scores and more patterns.
// Returns typed entities suitable for knowledge graph population.
func (a *Analyzer) ExtractEntitiesEnhanced(content, title string) []store.TypedEntity {
	var entities []store.TypedEntity
	seen := make(map[string]bool)

	addEntity := func(name, typ string, confidence float64) {
		key := typ + ":" + name
		if seen[key] || len(name) < 2 {
			return
		}
		seen[key] = true
		entities = append(entities, store.TypedEntity{
			Name:       name,
			Type:       typ,
			Confidence: confidence,
		})
	}

	// Extract from title (higher confidence)
	titleEntities := a.ExtractEntities(title)
	for _, p := range titleEntities.People {
		addEntity(p, "person", 0.8)
	}
	for _, o := range titleEntities.Organizations {
		addEntity(o, "organization", 0.8)
	}
	for _, l := range titleEntities.Locations {
		addEntity(l, "location", 0.7)
	}
	for _, t := range titleEntities.Topics {
		addEntity(t, "topic", 0.7)
	}

	// Extract from content (lower confidence)
	contentEntities := a.ExtractEntities(content)
	for _, p := range contentEntities.People {
		addEntity(p, "person", 0.6)
	}
	for _, o := range contentEntities.Organizations {
		addEntity(o, "organization", 0.6)
	}
	for _, l := range contentEntities.Locations {
		addEntity(l, "location", 0.5)
	}
	for _, t := range contentEntities.Topics {
		addEntity(t, "topic", 0.5)
	}

	// Additional patterns: technology names (camelCase, ALL_CAPS acronyms)
	techPatterns := regexp.MustCompile(`\b([A-Z][a-zA-Z]+(?:\.js|\.go|\.py|\.rs)?)\b`)
	for _, m := range techPatterns.FindAllString(title+" "+content, 20) {
		if len(m) >= 3 && len(m) <= 30 {
			addEntity(m, "technology", 0.4)
		}
	}

	// Limit total entities
	if len(entities) > 50 {
		entities = entities[:50]
	}

	return entities
}

// langProfile defines stop words for a language and the threshold to trigger detection.
type langProfile struct {
	code      string
	words     []string
	threshold int
}

// langProfiles ordered by specificity — more distinctive languages first.
var langProfiles = []langProfile{
	{"ja", []string{"の", "に", "は", "を", "た", "が", "で", "て", "と", "し", "れ", "さ"}, 4},
	{"zh", []string{"的", "是", "在", "了", "不", "和", "有", "这", "人", "我", "他", "她"}, 4},
	{"ko", []string{"의", "이", "는", "을", "를", "에", "와", "한", "가", "으로"}, 4},
	{"ar", []string{"في", "من", "على", "إلى", "أن", "هذا", "التي", "هو", "كان"}, 4},
	{"hi", []string{"का", "है", "में", "की", "को", "और", "एक", "यह", "से"}, 4},
	{"ru", []string{"что", "это", "как", "для", "его", "она", "они", "был", "при", "все"}, 3},
	{"pt", []string{" os ", " uma ", " são ", " como ", " com ", " mais ", " para ", " não ", " das ", " dos "}, 4},
	{"fr", []string{" les ", " des ", " une ", " est ", " dans ", " pour ", " avec ", " sur ", " sont ", " pas "}, 4},
	{"de", []string{" die ", " der ", " und ", " den ", " ist ", " ein ", " nicht ", " sich ", " mit ", " auf "}, 4},
	{"it", []string{" gli ", " una ", " sono ", " della ", " nella ", " anche ", " come ", " questo ", " quello "}, 4},
	{"es", []string{" el ", " la ", " los ", " las ", " es ", " en ", " que ", " de ", " por ", " una "}, 4},
	{"nl", []string{" het ", " een ", " van ", " zijn ", " niet ", " voor ", " met ", " ook ", " maar "}, 4},
	{"tr", []string{" bir ", " için ", " olan ", " ile ", " gibi ", " daha ", " çok ", " ancak "}, 3},
	{"pl", []string{" nie ", " się ", " jest ", " jak ", " ale ", " czy ", " przy ", " oraz "}, 3},
}

// DetectLanguage identifies the language of the given text using stop word frequency.
func (a *Analyzer) DetectLanguage(text string) string {
	if len(text) < 20 {
		return "en"
	}

	// Use first 2000 chars for speed
	sample := text
	if len(sample) > 2000 {
		sample = sample[:2000]
	}
	lower := strings.ToLower(sample)

	bestLang := "en"
	bestScore := 0

	for _, lp := range langProfiles {
		count := 0
		for _, w := range lp.words {
			if strings.Contains(lower, w) {
				count++
			}
		}
		if count >= lp.threshold && count > bestScore {
			bestScore = count
			bestLang = lp.code
		}
	}

	return bestLang
}

// ClassifyContent returns content categories.
func (a *Analyzer) ClassifyContent(text string) []string {
	lower := strings.ToLower(text)
	catMap := map[string][]string{
		"technology":       {"software", "programming", "computer", "algorithm", "database", "api", "cloud", "machine learning", "artificial intelligence"},
		"news":             {"breaking", "reported", "announced", "today", "yesterday", "sources say", "according to"},
		"education":        {"learn", "tutorial", "course", "lesson", "guide", "how to", "introduction", "basics"},
		"finance":          {"stock", "invest", "market", "trading", "crypto", "bitcoin", "financial", "banking"},
		"security_privacy": {"security", "privacy", "encryption", "vulnerability", "hack", "breach", "protect"},
	}

	var categories []string
	for cat, keywords := range catMap {
		score := 0
		for _, kw := range keywords {
			if strings.Contains(lower, kw) {
				score++
			}
		}
		if score >= 2 {
			categories = append(categories, cat)
		}
	}
	if len(categories) == 0 {
		categories = []string{"general"}
	}
	return categories
}
