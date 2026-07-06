package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

// Reranker re-orders the top candidates for a query using a stronger relevance
// signal than the first-stage ranker. It must be fail-open: on any error it
// returns the input order unchanged, so search never breaks because reranking
// is slow or unavailable.
type Reranker interface {
	Rerank(ctx context.Context, query string, results []models.SearchResult) []models.SearchResult
}

// ActiveReranker is the process-wide reranker. Nil (the default) disables
// reranking entirely. Set at startup when the operator opts in.
var ActiveReranker Reranker

// MaybeRerank applies ActiveReranker to the head of results if one is configured.
// It is the single hook the search pipeline calls.
func MaybeRerank(query string, results []models.SearchResult) []models.SearchResult {
	if ActiveReranker == nil || len(results) < 2 || strings.TrimSpace(query) == "" {
		return results
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	return ActiveReranker.Rerank(ctx, query, results)
}

// OllamaReranker is a cross-encoder-style reranker implemented as an
// LLM-relevance-judge over Ollama's /api/generate. This is NOT a true
// cross-encoder (Ollama has no native rerank API); it asks a small instruct
// model to score query/document relevance. It is off by default and bounds work
// to the top-N candidates.
type OllamaReranker struct {
	url    string // e.g. http://localhost:11434/api/generate
	model  string // e.g. qwen2.5:0.5b-instruct
	topN   int    // number of head candidates to rerank
	client *http.Client
}

// NewOllamaReranker builds a reranker against an Ollama server base URL.
func NewOllamaReranker(baseURL, model string, topN int) *OllamaReranker {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	baseURL = strings.TrimRight(baseURL, "/")
	if model == "" {
		model = "qwen2.5:0.5b-instruct"
	}
	if topN <= 0 {
		topN = 20
	}
	return &OllamaReranker{
		url:    baseURL + "/api/generate",
		model:  model,
		topN:   topN,
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

type ollamaGenerateRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
	Format string `json:"format,omitempty"` // "json" to constrain output
}

type ollamaGenerateResponse struct {
	Response string `json:"response"`
}

// Rerank scores the top-N candidates with the LLM and reorders them by score.
// The tail (beyond topN) is left untouched. Fail-open on any error.
func (r *OllamaReranker) Rerank(ctx context.Context, query string, results []models.SearchResult) []models.SearchResult {
	n := r.topN
	if n > len(results) {
		n = len(results)
	}
	head := results[:n]

	prompt := buildRerankPrompt(query, head)
	body, err := json.Marshal(ollamaGenerateRequest{Model: r.model, Prompt: prompt, Stream: false, Format: "json"})
	if err != nil {
		return results
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.url, bytes.NewReader(body))
	if err != nil {
		return results
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		slog.Debug("reranker: request failed, keeping original order", "err", err)
		return results
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		slog.Debug("reranker: non-200, keeping original order", "status", resp.StatusCode)
		return results
	}

	var gen ollamaGenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&gen); err != nil {
		return results
	}

	scores := parseRerankScores(gen.Response, n)
	if scores == nil {
		return results // unparseable → keep first-stage order
	}

	// Stable sort the head by descending score; ties keep first-stage order.
	idx := make([]int, n)
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool { return scores[idx[a]] > scores[idx[b]] })

	reordered := make([]models.SearchResult, 0, len(results))
	for _, i := range idx {
		reordered = append(reordered, head[i])
	}
	reordered = append(reordered, results[n:]...)
	return reordered
}

func buildRerankPrompt(query string, head []models.SearchResult) string {
	var b strings.Builder
	b.WriteString("You are a search relevance judge. Rate how well each document answers the query on a scale of 0 (irrelevant) to 10 (perfect).\n")
	b.WriteString("Query: ")
	b.WriteString(query)
	b.WriteString("\n\nDocuments:\n")
	for i, r := range head {
		snippet := r.Description
		if len(snippet) > 240 {
			snippet = snippet[:240]
		}
		fmt.Fprintf(&b, "[%d] %s — %s\n", i, r.Title, snippet)
	}
	b.WriteString("\nRespond ONLY with a JSON object mapping each document index (as a string) to its integer score, e.g. {\"0\": 8, \"1\": 3}.")
	return b.String()
}

var scorePairRe = regexp.MustCompile(`"?(\d+)"?\s*:\s*(\d+(?:\.\d+)?)`)

// parseRerankScores extracts index→score pairs from the model's JSON-ish output.
// Returns a slice of length n (missing indices default to 0), or nil if nothing
// parseable was found.
func parseRerankScores(out string, n int) []float64 {
	scores := make([]float64, n)
	found := false
	for _, m := range scorePairRe.FindAllStringSubmatch(out, -1) {
		idx, err1 := strconv.Atoi(m[1])
		val, err2 := strconv.ParseFloat(m[2], 64)
		if err1 != nil || err2 != nil || idx < 0 || idx >= n {
			continue
		}
		scores[idx] = val
		found = true
	}
	if !found {
		return nil
	}
	return scores
}
