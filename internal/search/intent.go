package search

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/doogle/doogle-v2/internal/models"
)

// containsWord reports whether pattern occurs in raw. A single-token pattern
// must match a whole word (so "book" does not fire on "facebook", "store" on
// "restore", "rent" on "different"); a multi-word pattern is matched as a
// phrase substring, as before.
func containsWord(raw, pattern string) bool {
	if strings.ContainsAny(pattern, " \t") {
		return strings.Contains(raw, pattern)
	}
	for _, tok := range strings.FieldsFunc(raw, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	}) {
		if tok == pattern {
			return true
		}
	}
	return false
}

// IntentType classifies the user's search intent.
type IntentType int

const (
	IntentInformational IntentType = iota
	IntentNavigational
	IntentTransactional
	IntentLocal
)

func (t IntentType) String() string {
	switch t {
	case IntentNavigational:
		return "navigational"
	case IntentTransactional:
		return "transactional"
	case IntentLocal:
		return "local"
	default:
		return "informational"
	}
}

// QueryIntent holds the classified intent for a query.
type QueryIntent struct {
	Type       IntentType
	Confidence float64
	Signals    []string
}

var (
	navigationalPatterns = []string{
		"login", "sign in", "signin", "log in", "sign up", "signup",
		"homepage", "home page", "official site", "official website",
	}

	informationalPrefixes = []string{
		"how to", "what is", "what are", "why do", "why does", "why is",
		"when did", "when does", "when is", "where is", "where do",
		"who is", "who are", "which is", "can i", "can you",
		"how do", "how does", "how can", "how much", "how many",
		"what does", "what do", "is it", "are there",
		"explain", "define", "meaning of", "definition of",
		"difference between", "tutorial", "guide",
	}

	transactionalWords = []string{
		"buy", "purchase", "price", "pricing", "cost", "cheap", "discount",
		"deal", "coupon", "promo", "subscribe", "download", "install",
		"order", "shop", "store", "sale", "free trial", "register",
		"book", "reserve", "rent", "hire",
	}

	localPatterns = []string{
		"near me", "nearby", "closest", "directions to",
		"open now", "hours of", "located in", "address of",
	}

	// URL-like patterns
	urlLikeRe = regexp.MustCompile(`^[a-zA-Z0-9-]+\.(com|org|net|io|co|dev|app|ai)$`)

	// Known brand/domain keywords (single-word navigational)
	knownBrands = map[string]bool{
		"google": true, "facebook": true, "youtube": true, "twitter": true,
		"amazon": true, "github": true, "reddit": true, "wikipedia": true,
		"instagram": true, "linkedin": true, "netflix": true, "spotify": true,
		"stackoverflow": true, "microsoft": true, "apple": true, "gmail": true,
		"outlook": true, "twitch": true, "discord": true, "slack": true,
		"figma": true, "notion": true, "vercel": true, "heroku": true,
		"docker": true, "gitlab": true, "bitbucket": true, "npm": true,
		"pypi": true, "whatsapp": true, "telegram": true, "tiktok": true,
	}
)

// ClassifyIntent determines the user's search intent from the parsed query.
func ClassifyIntent(pq *models.ParsedQuery) QueryIntent {
	raw := strings.ToLower(strings.TrimSpace(pq.Raw))
	terms := pq.Terms
	intent := QueryIntent{Type: IntentInformational, Confidence: 0.3}

	// --- Navigational detection ---
	// Single word matching a known brand
	if len(terms) == 1 && knownBrands[terms[0]] {
		return QueryIntent{Type: IntentNavigational, Confidence: 0.9, Signals: []string{"known_brand:" + terms[0]}}
	}

	// URL-like query
	if urlLikeRe.MatchString(raw) {
		return QueryIntent{Type: IntentNavigational, Confidence: 0.95, Signals: []string{"url_pattern"}}
	}

	// Navigational phrases
	for _, pat := range navigationalPatterns {
		if containsWord(raw, pat) {
			return QueryIntent{Type: IntentNavigational, Confidence: 0.8, Signals: []string{"nav_phrase:" + pat}}
		}
	}

	// site: operator implies navigational
	if pq.SiteDomain != "" {
		return QueryIntent{Type: IntentNavigational, Confidence: 0.85, Signals: []string{"site_operator"}}
	}

	// --- Local detection ---
	for _, pat := range localPatterns {
		if containsWord(raw, pat) {
			return QueryIntent{Type: IntentLocal, Confidence: 0.85, Signals: []string{"local_phrase:" + pat}}
		}
	}

	// --- Transactional detection ---
	var txSignals []string
	for _, word := range transactionalWords {
		if containsWord(raw, word) {
			txSignals = append(txSignals, "tx_word:"+word)
		}
	}
	if len(txSignals) > 0 {
		conf := 0.5 + float64(len(txSignals))*0.15
		if conf > 0.9 {
			conf = 0.9
		}
		return QueryIntent{Type: IntentTransactional, Confidence: conf, Signals: txSignals}
	}

	// --- Informational detection ---
	for _, prefix := range informationalPrefixes {
		if strings.HasPrefix(raw, prefix) {
			intent = QueryIntent{Type: IntentInformational, Confidence: 0.85, Signals: []string{"info_prefix:" + prefix}}
			return intent
		}
	}

	// Multi-word queries without other signals default to informational
	if len(terms) >= 3 {
		intent.Confidence = 0.6
		intent.Signals = []string{"multi_word_default"}
	}

	return intent
}
