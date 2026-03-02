package search

import (
	"regexp"
	"strings"

	"github.com/doogle/doogle-v2/internal/models"
)

var (
	phraseRe   = regexp.MustCompile(`"([^"]+)"`)
	siteRe     = regexp.MustCompile(`(?i)site:(\S+)`)
	langRe     = regexp.MustCompile(`(?i)lang:(\S+)`)
	intitleRe  = regexp.MustCompile(`(?i)intitle:(\S+)`)
	inurlRe    = regexp.MustCompile(`(?i)inurl:(\S+)`)
	intextRe   = regexp.MustCompile(`(?i)(?:intext|inbody):(\S+)`)
	filetypeRe = regexp.MustCompile(`(?i)(?:filetype|ext):(\S+)`)
	beforeRe   = regexp.MustCompile(`(?i)before:(\S+)`)
	afterRe    = regexp.MustCompile(`(?i)after:(\S+)`)
	hasRe      = regexp.MustCompile(`(?i)has:(\S+)`)
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

// synonymMap maps terms to their synonyms for query expansion.
var synonymMap = map[string][]string{
	// Programming languages
	"javascript": {"js", "ecmascript"}, "js": {"javascript"}, "ecmascript": {"javascript"},
	"python": {"py"}, "py": {"python"},
	"typescript": {"ts"}, "ts": {"typescript"},
	"golang": {"go language"}, "csharp": {"c#", "c sharp"}, "cpp": {"c++"},
	"ruby": {"rb"}, "rb": {"ruby"},

	// Tech concepts
	"machine learning": {"ml", "deep learning"}, "ml": {"machine learning"},
	"artificial intelligence": {"ai"}, "ai": {"artificial intelligence"},
	"api": {"application programming interface", "rest api", "web api"},
	"database": {"db", "data base"}, "db": {"database"},
	"frontend": {"front-end", "front end"}, "backend": {"back-end", "back end"},
	"devops": {"dev ops"}, "ci/cd": {"continuous integration", "continuous deployment"},
	"ui": {"user interface"}, "ux": {"user experience"},
	"os": {"operating system"}, "cpu": {"processor"},
	"gpu": {"graphics card", "graphics processing unit"},
	"ram": {"memory"}, "ssd": {"solid state drive"}, "hdd": {"hard drive"},
	"html": {"hypertext markup language"}, "css": {"cascading style sheets"},
	"sql": {"structured query language"}, "nosql": {"non-relational database"},
	"oop": {"object oriented programming"}, "fp": {"functional programming"},
	"cli": {"command line"}, "gui": {"graphical user interface"},
	"cdn": {"content delivery network"}, "dns": {"domain name system"},
	"http": {"hypertext transfer protocol"}, "https": {"secure http"},
	"ssh": {"secure shell"}, "ftp": {"file transfer protocol"},
	"json": {"javascript object notation"}, "xml": {"extensible markup language"},
	"yaml": {"yml"}, "yml": {"yaml"},
	"regex": {"regular expression", "regexp"}, "regexp": {"regex", "regular expression"},

	// Frameworks and tools
	"react": {"reactjs", "react.js"}, "reactjs": {"react"},
	"vue": {"vuejs", "vue.js"}, "vuejs": {"vue"},
	"angular": {"angularjs"}, "angularjs": {"angular"},
	"node": {"nodejs", "node.js"}, "nodejs": {"node"},
	"docker": {"container", "containerization"},
	"kubernetes": {"k8s"}, "k8s": {"kubernetes"},
	"postgres": {"postgresql"}, "postgresql": {"postgres"},
	"mongo": {"mongodb"}, "mongodb": {"mongo"},
	"redis": {"in-memory cache"},

	// Common tech terms
	"repo": {"repository"}, "repository": {"repo"},
	"config": {"configuration"}, "configuration": {"config"},
	"auth": {"authentication"}, "authentication": {"auth"},
	"admin": {"administrator"}, "dev": {"developer"},
	"docs": {"documentation"}, "documentation": {"docs"},
	"lib": {"library"}, "library": {"lib"},
	"pkg": {"package"},
	"env": {"environment"}, "environment": {"env"},
	"async": {"asynchronous"}, "sync": {"synchronous"},

	// General terms
	"photo": {"picture", "image"}, "picture": {"photo", "image"}, "image": {"photo", "picture"},
	"video": {"clip", "footage"}, "movie": {"film"}, "film": {"movie"},
	"car": {"automobile", "vehicle"}, "automobile": {"car"},
	"phone": {"smartphone", "mobile"}, "smartphone": {"phone", "mobile"},
	"laptop": {"notebook computer"}, "computer": {"pc"},
	"website": {"web site", "site"}, "webpage": {"web page"},
	"email": {"e-mail"}, "e-mail": {"email"},
	"wifi": {"wi-fi", "wireless"}, "bluetooth": {"bt"},
	"cheap": {"affordable", "inexpensive", "budget"},
	"fast": {"quick", "rapid", "speedy"},
	"big": {"large", "huge"}, "small": {"tiny", "little"},
	"error": {"bug", "issue", "problem"}, "bug": {"error", "issue", "defect"},
	"fix": {"solve", "resolve", "repair"}, "install": {"setup", "set up"},
	"remove": {"delete", "uninstall"}, "delete": {"remove"},
	"create": {"make", "build", "generate"}, "update": {"upgrade", "modify"},
}

// ExpandQuery adds synonym expansions to a parsed query.
func ExpandQuery(pq *models.ParsedQuery) []string {
	var expansions []string
	seen := make(map[string]bool)

	// Add synonyms for individual terms
	for _, term := range pq.Terms {
		if syns, ok := synonymMap[term]; ok {
			for _, syn := range syns {
				if !seen[syn] {
					seen[syn] = true
					expansions = append(expansions, syn)
				}
			}
		}
	}

	// Check multi-word phrases in the cleaned query
	lower := strings.ToLower(pq.CleanedQuery)
	for phrase, syns := range synonymMap {
		if strings.Contains(phrase, " ") && strings.Contains(lower, phrase) {
			for _, syn := range syns {
				if !seen[syn] {
					seen[syn] = true
					expansions = append(expansions, syn)
				}
			}
		}
	}

	return expansions
}

// ParseQuery processes a raw query string into a structured ParsedQuery.
func ParseQuery(raw string) *models.ParsedQuery {
	pq := &models.ParsedQuery{
		Raw: raw,
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

	// 2b. Extract lang:xx
	langMatch := langRe.FindStringSubmatch(remaining)
	if len(langMatch) > 1 {
		pq.Language = strings.ToLower(langMatch[1])
	}
	remaining = langRe.ReplaceAllString(remaining, " ")

	// 2c. Extract search dorks
	if m := intitleRe.FindStringSubmatch(remaining); len(m) > 1 {
		pq.InTitle = strings.ToLower(m[1])
	}
	remaining = intitleRe.ReplaceAllString(remaining, " ")

	if m := inurlRe.FindStringSubmatch(remaining); len(m) > 1 {
		pq.InURL = strings.ToLower(m[1])
	}
	remaining = inurlRe.ReplaceAllString(remaining, " ")

	if m := intextRe.FindStringSubmatch(remaining); len(m) > 1 {
		pq.InText = strings.ToLower(m[1])
	}
	remaining = intextRe.ReplaceAllString(remaining, " ")

	ftMatches := filetypeRe.FindAllStringSubmatch(remaining, -1)
	for _, m := range ftMatches {
		pq.FileTypes = append(pq.FileTypes, strings.ToLower(m[1]))
	}
	remaining = filetypeRe.ReplaceAllString(remaining, " ")

	if m := beforeRe.FindStringSubmatch(remaining); len(m) > 1 {
		pq.Before = m[1]
	}
	remaining = beforeRe.ReplaceAllString(remaining, " ")

	if m := afterRe.FindStringSubmatch(remaining); len(m) > 1 {
		pq.After = m[1]
	}
	remaining = afterRe.ReplaceAllString(remaining, " ")

	if m := hasRe.FindStringSubmatch(remaining); len(m) > 1 {
		if strings.ToLower(m[1]) == "https" {
			pq.HasHTTPS = true
		}
	}
	remaining = hasRe.ReplaceAllString(remaining, " ")

	// 3. Tokenize: extract -excludes and OR groups before stop-word removal
	words := strings.Fields(remaining)
	var pendingOR []string
	for i := 0; i < len(words); i++ {
		word := words[i]

		// Exclude terms: -term
		if len(word) > 1 && word[0] == '-' {
			excluded := strings.ToLower(word[1:])
			if excluded != "" {
				pq.ExcludeTerms = append(pq.ExcludeTerms, excluded)
			}
			continue
		}

		// Uppercase OR is a boolean operator (lowercase "or" is a stop word)
		if word == "OR" && i > 0 && i < len(words)-1 {
			// Collect left side (last term added or last pending) and right side
			if len(pendingOR) == 0 {
				// Pull the previous term into the OR group
				if len(pq.Terms) > 0 {
					pendingOR = append(pendingOR, pq.Terms[len(pq.Terms)-1])
					pq.Terms = pq.Terms[:len(pq.Terms)-1]
				}
			}
			continue
		}

		lower := strings.ToLower(word)

		// If we have a pending OR group, add to it
		if len(pendingOR) > 0 {
			pendingOR = append(pendingOR, lower)
			// Check if next token is also "OR"
			if i+1 < len(words) && words[i+1] == "OR" {
				continue // keep accumulating
			}
			// Flush the OR group
			pq.OrGroups = append(pq.OrGroups, pendingOR)
			pendingOR = nil
			continue
		}

		if stopWords[lower] {
			continue
		}
		pq.Terms = append(pq.Terms, lower)
	}

	// 4. Fuzzy for short queries
	pq.UseFuzzy = len(pq.Terms) <= 3

	// 5. Build cleaned query (for fallback / backward compat)
	var cleanParts []string
	cleanParts = append(cleanParts, pq.Terms...)
	for _, p := range pq.Phrases {
		cleanParts = append(cleanParts, p)
	}
	pq.CleanedQuery = strings.Join(cleanParts, " ")

	return pq
}
