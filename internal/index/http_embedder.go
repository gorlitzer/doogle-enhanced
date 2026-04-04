package index

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// HTTPEmbedder calls an external embedding API (e.g., sentence-transformers server)
// to produce dense neural embeddings. Falls back to TF-IDF on errors.
type HTTPEmbedder struct {
	url      string
	client   *http.Client
	fallback TextEmbedder
	healthy  bool
}

type embedRequest struct {
	Texts []string `json:"texts"`
}

type embedResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
}

// NewHTTPEmbedder creates an embedder that calls a remote embedding service.
// If the service is unreachable, it transparently falls back to the provided fallback embedder.
func NewHTTPEmbedder(url string, fallback TextEmbedder) *HTTPEmbedder {
	e := &HTTPEmbedder{
		url:      url,
		client:   &http.Client{Timeout: 5 * time.Second},
		fallback: fallback,
	}
	e.healthy = e.ping()
	return e
}

// Embed produces a neural embedding for the given text.
// Falls back to TF-IDF on any error.
func (e *HTTPEmbedder) Embed(text string) ([]float32, error) {
	if !e.healthy {
		return e.fallback.Embed(text)
	}

	body, err := json.Marshal(embedRequest{Texts: []string{text}})
	if err != nil {
		return e.fallback.Embed(text)
	}

	resp, err := e.client.Post(e.url, "application/json", bytes.NewReader(body))
	if err != nil {
		slog.Debug("neural embedder: request failed, using TF-IDF fallback", "err", err)
		e.healthy = false
		go e.reconnectLoop()
		return e.fallback.Embed(text)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		slog.Debug("neural embedder: non-200 response, using fallback", "status", resp.StatusCode, "body", string(respBody))
		return e.fallback.Embed(text)
	}

	var result embedResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 10<<20)).Decode(&result); err != nil {
		slog.Debug("neural embedder: decode error, using fallback", "err", err)
		return e.fallback.Embed(text)
	}

	if len(result.Embeddings) == 0 || len(result.Embeddings[0]) == 0 {
		return e.fallback.Embed(text)
	}

	vec := result.Embeddings[0]

	// Normalize to unit length
	normalizeVec(vec)

	return vec, nil
}

// EmbedBatch sends multiple texts in a single request for efficiency.
func (e *HTTPEmbedder) EmbedBatch(texts []string) ([][]float32, error) {
	if !e.healthy || len(texts) == 0 {
		results := make([][]float32, len(texts))
		for i, t := range texts {
			vec, err := e.fallback.Embed(t)
			if err != nil {
				return nil, err
			}
			results[i] = vec
		}
		return results, nil
	}

	body, err := json.Marshal(embedRequest{Texts: texts})
	if err != nil {
		return nil, err
	}

	resp, err := e.client.Post(e.url, "application/json", bytes.NewReader(body))
	if err != nil {
		e.healthy = false
		go e.reconnectLoop()
		// Fallback individually
		results := make([][]float32, len(texts))
		for i, t := range texts {
			results[i], _ = e.fallback.Embed(t)
		}
		return results, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		results := make([][]float32, len(texts))
		for i, t := range texts {
			results[i], _ = e.fallback.Embed(t)
		}
		return results, nil
	}

	var result embedResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 50<<20)).Decode(&result); err != nil {
		return nil, err
	}

	// Normalize all vectors
	for i := range result.Embeddings {
		normalizeVec(result.Embeddings[i])
	}

	return result.Embeddings, nil
}

// IsNeural returns true if the neural embedding service is available.
func (e *HTTPEmbedder) IsNeural() bool {
	return e.healthy
}

// ping checks if the embedding service is reachable.
func (e *HTTPEmbedder) ping() bool {
	body, _ := json.Marshal(embedRequest{Texts: []string{"test"}})
	resp, err := e.client.Post(e.url, "application/json", bytes.NewReader(body))
	if err != nil {
		slog.Warn("neural embedder: service unreachable, using TF-IDF fallback", "url", e.url, "err", err)
		return false
	}
	resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		slog.Info("neural embedder: connected", "url", e.url)
		return true
	}

	slog.Warn("neural embedder: service returned error, using TF-IDF fallback",
		"url", e.url, "status", resp.StatusCode)
	return false
}

// reconnectLoop periodically retries connecting to the embedding service.
func (e *HTTPEmbedder) reconnectLoop() {
	for i := 0; i < 10; i++ {
		time.Sleep(30 * time.Second)
		if e.ping() {
			e.healthy = true
			return
		}
	}
	slog.Warn(fmt.Sprintf("neural embedder: gave up reconnecting after %d attempts", 10))
}
