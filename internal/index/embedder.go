package index

import (
	"math"
	"strings"
	"unicode"
)

// TFIDFEmbedder provides TF-IDF based document embeddings as a pure-Go fallback
// when no neural sentence transformer is available. Produces sparse vectors
// projected to a fixed dimensionality (384 to match MiniLM).
type TFIDFEmbedder struct {
	vocab    map[string]int // word → index mapping
	df       map[string]int // document frequency: number of docs each term appears in
	idf      []float64      // inverse document frequency per vocab term
	vocabCap int
	docCount int
}

const defaultVocabCap = 10000
const embeddingDim = 384

// NewTFIDFEmbedder creates a TF-IDF embedder. Call AddDocument for corpus building,
// then Finalize before embedding queries.
func NewTFIDFEmbedder() *TFIDFEmbedder {
	return &TFIDFEmbedder{
		vocab:    make(map[string]int),
		df:       make(map[string]int),
		vocabCap: defaultVocabCap,
	}
}

// AddDocument adds a document to the IDF corpus.
func (e *TFIDFEmbedder) AddDocument(text string) {
	e.docCount++
	seen := make(map[string]bool)
	for _, w := range tokenize(text) {
		if seen[w] {
			continue
		}
		seen[w] = true
		// Count real document frequency so Finalize can compute a genuine IDF
		// (rare, discriminative terms weighted above common ones).
		e.df[w]++
		if _, exists := e.vocab[w]; !exists && len(e.vocab) < e.vocabCap {
			e.vocab[w] = len(e.vocab)
		}
	}
}

// Finalize computes IDF values after all documents have been added, using the
// real per-term document frequency (BM25-style smoothed IDF). Previously every
// term got the same constant IDF, which made the "TF-IDF" vectors effectively
// TF-only — rare and common terms were weighted identically.
func (e *TFIDFEmbedder) Finalize() {
	n := float64(e.docCount)
	e.idf = make([]float64, len(e.vocab))
	for word, idx := range e.vocab {
		df := float64(e.df[word])
		// BM25 IDF: log(1 + (N - df + 0.5)/(df + 0.5)). Always positive, and
		// monotonically decreasing in df, so rarer terms score higher.
		e.idf[idx] = math.Log(1.0 + (n-df+0.5)/(df+0.5))
	}
}

// Embed computes a TF-IDF embedding for the given text.
// Returns a 384-dim float32 vector (hashed projection of sparse TF-IDF).
func (e *TFIDFEmbedder) Embed(text string) ([]float32, error) {
	words := tokenize(text)
	if len(words) == 0 {
		return make([]float32, embeddingDim), nil
	}

	// Compute term frequencies
	tf := make(map[string]float64)
	for _, w := range words {
		tf[w]++
	}
	total := float64(len(words))
	for w := range tf {
		tf[w] /= total
	}

	// Project to fixed-size vector using feature hashing
	vec := make([]float32, embeddingDim)
	for word, freq := range tf {
		idfVal := 1.0
		if idx, ok := e.vocab[word]; ok && idx < len(e.idf) {
			idfVal = e.idf[idx]
		}
		tfidf := freq * idfVal

		// Hash to dimension
		h := hashString(word)
		dim := int(h % uint64(embeddingDim))
		sign := float32(1.0)
		if (h>>32)%2 == 0 {
			sign = -1.0
		}
		vec[dim] += sign * float32(tfidf)
	}

	// L2 normalize
	normalizeVec(vec)

	return vec, nil
}

// EmbedBatch computes embeddings for multiple texts.
func (e *TFIDFEmbedder) EmbedBatch(texts []string) ([][]float32, error) {
	results := make([][]float32, len(texts))
	for i, text := range texts {
		vec, err := e.Embed(text)
		if err != nil {
			return nil, err
		}
		results[i] = vec
	}
	return results, nil
}

// CosineSimilarity computes cosine similarity between two vectors.
func CosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

func normalizeVec(v []float32) {
	var norm float64
	for _, val := range v {
		norm += float64(val) * float64(val)
	}
	norm = math.Sqrt(norm)
	if norm > 0 {
		for i := range v {
			v[i] = float32(float64(v[i]) / norm)
		}
	}
}

func tokenize(text string) []string {
	return strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
}

// EmbedText is a convenience wrapper around Embed that ignores errors.
func (e *TFIDFEmbedder) EmbedText(text string) []float32 {
	vec, _ := e.Embed(text)
	return vec
}

// IDF returns the inverse document frequency for a term. Returns 1.0 for unknown terms.
func (e *TFIDFEmbedder) IDF(term string) float64 {
	idx, ok := e.vocab[strings.ToLower(term)]
	if !ok || idx >= len(e.idf) {
		return 1.0
	}
	return e.idf[idx]
}

// hashString is a simple FNV-1a hash for feature hashing.
func hashString(s string) uint64 {
	var h uint64 = 14695981039346656037
	for _, c := range s {
		h ^= uint64(c)
		h *= 1099511628211
	}
	return h
}
