package node

import "strings"

// categoryKeywords maps category IDs to keyword lists.
// Mirrors the wizard CATEGORY_GROUPS — deliberately rough for profiling signal.
var categoryKeywords = map[string][]string{
	"education":   {"education", "course", "university", "college", "school", "learn", "tutorial", "lesson", "study", "academic"},
	"science":     {"science", "research", "physics", "chemistry", "biology", "experiment", "scientific", "lab", "journal", "paper"},
	"news":        {"news", "journalism", "reporter", "headline", "press", "media", "breaking", "article", "editorial"},
	"history":     {"history", "historical", "ancient", "civilization", "archaeology", "heritage", "century", "medieval", "dynasty"},
	"philosophy":  {"philosophy", "ethics", "moral", "existential", "logic", "metaphysics", "epistemology", "philosopher"},
	"law":         {"law", "legal", "court", "legislation", "attorney", "lawyer", "regulation", "statute", "justice"},
	"health":      {"health", "medicine", "doctor", "hospital", "disease", "treatment", "therapy", "symptom", "diagnosis", "medical"},
	"food":        {"food", "cooking", "recipe", "kitchen", "cuisine", "chef", "baking", "ingredient", "meal", "restaurant"},
	"sports":      {"sports", "fitness", "football", "basketball", "soccer", "tennis", "athlete", "workout", "exercise", "game"},
	"travel":      {"travel", "tourism", "destination", "hotel", "flight", "vacation", "trip", "backpacking", "adventure"},
	"fashion":     {"fashion", "style", "clothing", "designer", "outfit", "trend", "wardrobe", "apparel", "accessory"},
	"arts":        {"art", "design", "painting", "sculpture", "gallery", "illustration", "creative", "drawing", "visual"},
	"film":        {"film", "movie", "cinema", "director", "actor", "television", "series", "documentary", "streaming"},
	"music":       {"music", "song", "album", "concert", "artist", "band", "genre", "playlist", "instrument", "composer"},
	"books":       {"book", "literature", "novel", "author", "fiction", "nonfiction", "reading", "publisher", "library"},
	"gaming":      {"gaming", "game", "gamer", "esports", "console", "playstation", "xbox", "nintendo", "steam", "multiplayer"},
	"tech":        {"programming", "developer", "software", "code", "coding", "api", "algorithm", "python", "javascript", "rust", "golang"},
	"opensource":  {"opensource", "open source", "github", "repository", "contributor", "fork", "linux", "free software"},
	"blockchain":  {"blockchain", "crypto", "bitcoin", "ethereum", "defi", "nft", "web3", "token", "decentralized"},
	"finance":     {"finance", "investing", "stock", "market", "trading", "portfolio", "bank", "economy", "money", "fund"},
	"startups":    {"startup", "entrepreneur", "venture", "founder", "funding", "pitch", "bootstrapping", "growth"},
	"environment": {"environment", "climate", "sustainability", "pollution", "renewable", "conservation", "carbon", "ecosystem"},
	"psychology":  {"psychology", "behavior", "cognitive", "therapy", "mental", "emotion", "brain", "anxiety", "mindfulness"},
	"diy":         {"diy", "craft", "maker", "woodworking", "electronics", "build", "project", "handmade", "workshop"},
	"auto":        {"automotive", "car", "engine", "motorsport", "vehicle", "driving", "mechanic", "racing"},
}

// ClassifyQuery returns the best-matching category ID for a search query.
// Returns "" if no category matches.
func ClassifyQuery(query string) string {
	words := strings.Fields(strings.ToLower(query))
	if len(words) == 0 {
		return ""
	}

	bestCat := ""
	bestCount := 0

	for catID, keywords := range categoryKeywords {
		count := 0
		for _, w := range words {
			for _, kw := range keywords {
				if w == kw || strings.Contains(w, kw) {
					count++
					break
				}
			}
		}
		if count > bestCount {
			bestCount = count
			bestCat = catID
		}
	}

	return bestCat
}
