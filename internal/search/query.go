package search

import (
	"regexp"
	"strings"

	"github.com/doogle/doogle-v2/internal/models"
)

var (
	phraseRe = regexp.MustCompile(`"([^"]+)"`)
	siteRe   = regexp.MustCompile(`(?i)site:(\S+)`)
)

// stopWords to remove from query terms.
var stopWords = map[string]bool{
	"a": true, "an": true, "the": true, "is": true, "are": true,
	"was": true, "were": true, "be": true, "been": true, "being": true,
	"have": true, "has": true, "had": true, "do": true, "does": true,
	"did": true, "will": true, "would": true, "could": true, "should": true,
	"may": true, "might": true, "shall": true, "can": true, "need": true,
	"dare": true, "ought": true, "used": true, "to": true, "of": true,
	"in": true, "for": true, "on": true, "with": true, "at": true,
	"by": true, "from": true, "as": true, "into": true, "through": true,
	"during": true, "before": true, "after": true, "above": true,
	"below": true, "between": true, "out": true, "off": true, "over": true,
	"under": true, "again": true, "further": true, "then": true, "once": true,
	"and": true, "but": true, "or": true, "nor": true, "not": true, "so": true,
	"yet": true, "both": true, "either": true, "neither": true, "each": true,
	"every": true, "all": true, "any": true, "few": true, "more": true,
	"most": true, "other": true, "some": true, "such": true, "no": true,
	"only": true, "own": true, "same": true, "than": true, "too": true,
	"very": true, "just": true, "because": true, "if": true, "when": true,
	"where": true, "how": true, "what": true, "which": true, "who": true,
	"whom": true, "this": true, "that": true, "these": true, "those": true,
	"i": true, "me": true, "my": true, "we": true, "our": true, "you": true,
	"your": true, "he": true, "him": true, "his": true, "she": true, "her": true,
	"it": true, "its": true, "they": true, "them": true, "their": true,
}

// synonymMap maps common abbreviations and synonyms.
var synonymMap = map[string][]string{
	"js":            {"javascript"},
	"javascript":    {"js"},
	"ts":            {"typescript"},
	"typescript":    {"ts"},
	"py":            {"python"},
	"python":        {"py"},
	"rb":            {"ruby"},
	"ruby":          {"rb"},
	"k8s":           {"kubernetes"},
	"kubernetes":    {"k8s"},
	"k3s":           {"kubernetes"},
	"docs":          {"documentation"},
	"documentation": {"docs"},
	"doc":           {"documentation", "docs"},
	"api":           {"interface", "endpoint"},
	"db":            {"database"},
	"database":      {"db"},
	"sql":           {"database", "query"},
	"nosql":         {"database", "mongodb", "redis"},
	"ui":            {"interface", "frontend"},
	"ux":            {"user experience", "usability"},
	"frontend":      {"front-end", "client-side"},
	"backend":       {"back-end", "server-side"},
	"devops":        {"deployment", "infrastructure"},
	"ci":            {"continuous integration"},
	"cd":            {"continuous deployment"},
	"ml":            {"machine learning"},
	"ai":            {"artificial intelligence"},
	"dl":            {"deep learning"},
	"nlp":           {"natural language processing"},
	"css":           {"stylesheet", "styling"},
	"html":          {"markup", "webpage"},
	"react":         {"reactjs"},
	"reactjs":       {"react"},
	"vue":           {"vuejs"},
	"vuejs":         {"vue"},
	"node":          {"nodejs"},
	"nodejs":        {"node"},
	"golang":        {"go"},
	"go":            {"golang"},
	"rust":          {"rustlang"},
	"rustlang":      {"rust"},
	"car":           {"automobile", "vehicle"},
	"automobile":    {"car", "vehicle"},
	"fix":           {"repair", "resolve", "patch"},
	"error":         {"bug", "issue", "problem"},
	"bug":           {"error", "issue", "defect"},
	"tutorial":      {"guide", "howto", "walkthrough"},
	"guide":         {"tutorial", "howto"},
	"howto":         {"tutorial", "guide"},
	"install":       {"setup", "installation"},
	"setup":         {"install", "configure"},
	"config":        {"configuration", "settings"},
	"configuration": {"config", "settings"},
}

// ParseQuery processes a raw query string into a structured ParsedQuery.
func ParseQuery(raw string) *models.ParsedQuery {
	pq := &models.ParsedQuery{
		Raw:      raw,
		Synonyms: make(map[string][]string),
	}

	remaining := strings.TrimSpace(raw)
	if remaining == "" {
		return pq
	}

	// 1. Extract "quoted phrases"
	phraseMatches := phraseRe.FindAllStringSubmatch(remaining, -1)
	for _, m := range phraseMatches {
		phrase := strings.TrimSpace(m[1])
		if phrase != "" {
			pq.Phrases = append(pq.Phrases, phrase)
		}
	}
	remaining = phraseRe.ReplaceAllString(remaining, " ")

	// 2. Extract site:domain
	siteMatch := siteRe.FindStringSubmatch(remaining)
	if len(siteMatch) > 1 {
		pq.SiteDomain = strings.ToLower(siteMatch[1])
	}
	remaining = siteRe.ReplaceAllString(remaining, " ")

	// 3. Tokenize, lowercase, remove stop words
	for _, word := range strings.Fields(remaining) {
		lower := strings.ToLower(word)
		if stopWords[lower] {
			continue
		}
		pq.Terms = append(pq.Terms, lower)
	}

	// 4. Look up synonyms
	for _, term := range pq.Terms {
		if syns, ok := synonymMap[term]; ok {
			pq.Synonyms[term] = syns
		}
	}

	// 5. Fuzzy for short queries
	pq.UseFuzzy = len(pq.Terms) <= 3

	// 6. Build cleaned query (for fallback / backward compat)
	var cleanParts []string
	cleanParts = append(cleanParts, pq.Terms...)
	for _, p := range pq.Phrases {
		cleanParts = append(cleanParts, p)
	}
	pq.CleanedQuery = strings.Join(cleanParts, " ")

	return pq
}
