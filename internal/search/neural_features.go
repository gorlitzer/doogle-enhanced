package search

import (
	"math"
	"strings"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

// QueryContext holds parsed query information for interaction feature computation.
type QueryContext struct {
	RawQuery string
	Terms    []string
	Embedder *index.TFIDFEmbedder
}

// InteractionFeatures holds the 14 new query-document interaction features.
type InteractionFeatures struct {
	TitleTermOverlap   float64 // 14
	BodyTermOverlap    float64 // 15
	HeadingTermOverlap float64 // 16
	URLTermOverlap     float64 // 17
	ExactTitleMatch    float64 // 18
	TitleCoverage      float64 // 19
	QueryDocTFIDFSim   float64 // 20
	QueryLengthNorm    float64 // 21
	DocLengthNorm      float64 // 22
	TermProximity      float64 // 23
	IDFWeightedOverlap float64 // 24
	CTRScore           float64 // 25
	MobileScore        float64 // 26
	PerfScore          float64 // 27
}

// ComputeInteractionFeatures computes query-document interaction features.
func ComputeInteractionFeatures(qctx *QueryContext, r *models.SearchResult, clickStore *store.ClickStore) InteractionFeatures {
	var f InteractionFeatures

	if len(qctx.Terms) == 0 {
		return f
	}

	queryTerms := toLowerSet(qctx.Terms)

	// 14: title_term_overlap
	if r.Title != "" {
		titleTerms := extractWords(r.Title)
		f.TitleTermOverlap = overlap(queryTerms, titleTerms)
	}

	// 15: body_term_overlap (sample first 1000 words from description)
	if r.Description != "" {
		bodyWords := extractWordsLimited(r.Description, 1000)
		f.BodyTermOverlap = overlap(queryTerms, bodyWords)
	}

	// 16: heading_term_overlap — use title as proxy (headings not in SearchResult)
	f.HeadingTermOverlap = f.TitleTermOverlap

	// 17: url_term_overlap
	if r.URL != "" {
		urlTerms := extractURLWords(r.URL)
		f.URLTermOverlap = overlap(queryTerms, urlTerms)
	}

	// 18: exact_title_match
	if r.Title != "" && strings.Contains(strings.ToLower(r.Title), strings.ToLower(qctx.RawQuery)) {
		f.ExactTitleMatch = 1.0
	}

	// 19: title_coverage
	if r.Title != "" {
		titleWords := extractWords(r.Title)
		if len(titleWords) > 0 {
			matchCount := 0
			for w := range titleWords {
				if queryTerms[w] {
					matchCount++
				}
			}
			f.TitleCoverage = float64(matchCount) / float64(len(titleWords))
		}
	}

	// 20: query_doc_tfidf_sim
	if qctx.Embedder != nil {
		docText := r.Title
		if r.Description != "" {
			docText += " " + r.Description
		}
		if docText != "" {
			qVec := qctx.Embedder.EmbedText(qctx.RawQuery)
			dVec := qctx.Embedder.EmbedText(docText)
			f.QueryDocTFIDFSim = cosineSim32(qVec, dVec)
		}
	}

	// 21: query_length_norm
	f.QueryLengthNorm = math.Min(math.Log2(float64(len(qctx.Terms)+1))/4.0, 1.0)

	// 22: doc_length_norm — use word count proxy from description length
	wordCountEstimate := len(strings.Fields(r.Description))
	if wordCountEstimate < 1 {
		wordCountEstimate = 1
	}
	f.DocLengthNorm = math.Min(math.Log2(float64(wordCountEstimate+1))/15.0, 1.0)

	// 23: term_proximity
	if r.Description != "" && len(qctx.Terms) >= 2 {
		f.TermProximity = computeTermProximity(r.Description, qctx.Terms)
	}

	// 24: idf_weighted_overlap — approximate using term frequency rarity
	if qctx.Embedder != nil && r.Title != "" {
		f.IDFWeightedOverlap = computeIDFOverlap(qctx, r.Title+" "+r.Description)
	}

	// 25: ctr_score
	if clickStore != nil {
		ctr := clickStore.CTR(qctx.RawQuery, r.URL)
		dwell := clickStore.AvgDwellSeconds(qctx.RawQuery, r.URL)
		pogo := clickStore.PogoStickRate(qctx.RawQuery, r.URL)
		dwellQuality := math.Min(dwell/120.0, 1.0)
		f.CTRScore = ctr * dwellQuality * (1.0 - pogo)
	}

	// 26: mobile_score
	f.MobileScore = r.MobileScore

	// 27: perf_score
	f.PerfScore = r.PerfScore

	return f
}

// ToArray converts interaction features to a fixed-size array for LTR features 14-27.
func (f *InteractionFeatures) ToArray() [14]float64 {
	return [14]float64{
		f.TitleTermOverlap,
		f.BodyTermOverlap,
		f.HeadingTermOverlap,
		f.URLTermOverlap,
		f.ExactTitleMatch,
		f.TitleCoverage,
		f.QueryDocTFIDFSim,
		f.QueryLengthNorm,
		f.DocLengthNorm,
		f.TermProximity,
		f.IDFWeightedOverlap,
		f.CTRScore,
		f.MobileScore,
		f.PerfScore,
	}
}

// --- helpers ---

func toLowerSet(terms []string) map[string]bool {
	s := make(map[string]bool, len(terms))
	for _, t := range terms {
		s[strings.ToLower(t)] = true
	}
	return s
}

func extractWords(text string) map[string]bool {
	words := strings.Fields(strings.ToLower(text))
	s := make(map[string]bool, len(words))
	for _, w := range words {
		w = strings.Trim(w, ".,;:!?\"'()[]{}—–-")
		if len(w) >= 2 {
			s[w] = true
		}
	}
	return s
}

func extractWordsLimited(text string, maxWords int) map[string]bool {
	words := strings.Fields(strings.ToLower(text))
	if len(words) > maxWords {
		words = words[:maxWords]
	}
	s := make(map[string]bool, len(words))
	for _, w := range words {
		w = strings.Trim(w, ".,;:!?\"'()[]{}—–-")
		if len(w) >= 2 {
			s[w] = true
		}
	}
	return s
}

func extractURLWords(rawURL string) map[string]bool {
	// Find path
	idx := strings.Index(rawURL, "://")
	if idx >= 0 {
		rawURL = rawURL[idx+3:]
	}
	if slash := strings.IndexByte(rawURL, '/'); slash >= 0 {
		rawURL = rawURL[slash:]
	}
	// Replace separators with spaces
	r := strings.NewReplacer("/", " ", "-", " ", "_", " ", ".", " ")
	return extractWords(r.Replace(rawURL))
}

func overlap(queryTerms, docTerms map[string]bool) float64 {
	if len(queryTerms) == 0 {
		return 0
	}
	found := 0
	for q := range queryTerms {
		if docTerms[q] {
			found++
		}
	}
	return float64(found) / float64(len(queryTerms))
}

func cosineSim32(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	denom := math.Sqrt(normA) * math.Sqrt(normB)
	if denom < 1e-10 {
		return 0
	}
	return dot / denom
}

func computeTermProximity(text string, terms []string) float64 {
	lower := strings.ToLower(text)
	words := strings.Fields(lower)
	if len(words) == 0 || len(terms) < 2 {
		return 0
	}

	// Find positions of each query term
	termPositions := make(map[string][]int)
	for _, t := range terms {
		termPositions[strings.ToLower(t)] = nil
	}
	for i, w := range words {
		w = strings.Trim(w, ".,;:!?\"'()[]{}—–-")
		if _, ok := termPositions[w]; ok {
			termPositions[w] = append(termPositions[w], i)
		}
	}

	// Compute average minimum distance between term pairs
	var totalDist float64
	pairs := 0
	lowerTerms := make([]string, len(terms))
	for i, t := range terms {
		lowerTerms[i] = strings.ToLower(t)
	}
	for i := 0; i < len(lowerTerms); i++ {
		posI := termPositions[lowerTerms[i]]
		if len(posI) == 0 {
			continue
		}
		for j := i + 1; j < len(lowerTerms); j++ {
			posJ := termPositions[lowerTerms[j]]
			if len(posJ) == 0 {
				continue
			}
			minDist := len(words)
			for _, pi := range posI {
				for _, pj := range posJ {
					d := pi - pj
					if d < 0 {
						d = -d
					}
					if d < minDist {
						minDist = d
					}
				}
			}
			totalDist += float64(minDist)
			pairs++
		}
	}

	if pairs == 0 {
		return 0
	}
	avgMinDist := totalDist / float64(pairs)
	return 1.0 / (1.0 + avgMinDist)
}

func computeIDFOverlap(qctx *QueryContext, docText string) float64 {
	if qctx.Embedder == nil || len(qctx.Terms) == 0 {
		return 0
	}
	docWords := extractWords(docText)
	var sum float64
	for _, t := range qctx.Terms {
		lower := strings.ToLower(t)
		if docWords[lower] {
			// Use embedder's IDF if available, otherwise use 1.0
			idf := qctx.Embedder.IDF(lower)
			sum += idf
		}
	}
	// Normalize by max possible IDF sum
	maxIDF := float64(len(qctx.Terms)) * 10.0 // rough max IDF
	if maxIDF < 1 {
		maxIDF = 1
	}
	return math.Min(sum/maxIDF, 1.0)
}
