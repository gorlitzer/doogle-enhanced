package index

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// HTTPEmbedder calls an external embedding API to produce dense neural embeddings.
// Supports two modes:
//   - Ollama: POST /api/embed with {"model": "...", "input": [...]}
//   - Generic: POST /embed with {"texts": [...]}
//
// Falls back to TF-IDF on errors.
type HTTPEmbedder struct {
	url      string
	model    string // Ollama model name (empty for generic mode)
	isOllama bool
	client   *http.Client
	fallback TextEmbedder
	healthy  bool
}

// --- Request/response types ---

// Generic API format (our embedding-server.py and compatible servers)
type genericEmbedRequest struct {
	Texts []string `json:"texts"`
}

type genericEmbedResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
}

// Ollama API format
type ollamaEmbedRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type ollamaEmbedResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
}

// --- Constructors ---

// NewHTTPEmbedder creates an embedder that calls a generic embedding API.
// The URL should be the full endpoint (e.g., http://localhost:11411/embed).
func NewHTTPEmbedder(url string, fallback TextEmbedder) *HTTPEmbedder {
	e := &HTTPEmbedder{
		url:      url,
		client:   &http.Client{Timeout: 10 * time.Second},
		fallback: fallback,
	}
	e.healthy = e.ping()
	return e
}

// NewOllamaEmbedder creates an embedder that calls Ollama's embedding API.
// baseURL is the Ollama server (default http://localhost:11434).
// model is the embedding model name (e.g., "all-minilm", "nomic-embed-text").
func NewOllamaEmbedder(baseURL, model string, fallback TextEmbedder) *HTTPEmbedder {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	baseURL = strings.TrimRight(baseURL, "/")
	if model == "" {
		model = "nomic-embed-text"
	}
	e := &HTTPEmbedder{
		url:      baseURL + "/api/embed",
		model:    model,
		isOllama: true,
		client:   &http.Client{Timeout: 30 * time.Second}, // Ollama may need to load model
		fallback: fallback,
	}
	e.healthy = e.ping()
	return e
}

// --- Embed ---

func (e *HTTPEmbedder) Embed(text string) ([]float32, error) {
	if !e.healthy {
		return e.fallback.Embed(text)
	}

	var body []byte
	var err error

	if e.isOllama {
		body, err = json.Marshal(ollamaEmbedRequest{Model: e.model, Input: []string{text}})
	} else {
		body, err = json.Marshal(genericEmbedRequest{Texts: []string{text}})
	}
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

	vec, err := e.decodeFirst(resp.Body)
	if err != nil {
		slog.Debug("neural embedder: decode error, using fallback", "err", err)
		return e.fallback.Embed(text)
	}

	normalizeVec(vec)
	return vec, nil
}

// EmbedBatch sends multiple texts in a single request.
func (e *HTTPEmbedder) EmbedBatch(texts []string) ([][]float32, error) {
	if !e.healthy || len(texts) == 0 {
		return e.fallbackBatch(texts)
	}

	var body []byte
	var err error

	if e.isOllama {
		body, err = json.Marshal(ollamaEmbedRequest{Model: e.model, Input: texts})
	} else {
		body, err = json.Marshal(genericEmbedRequest{Texts: texts})
	}
	if err != nil {
		return e.fallbackBatch(texts)
	}

	resp, err := e.client.Post(e.url, "application/json", bytes.NewReader(body))
	if err != nil {
		e.healthy = false
		go e.reconnectLoop()
		return e.fallbackBatch(texts)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return e.fallbackBatch(texts)
	}

	vecs, err := e.decodeAll(resp.Body)
	if err != nil {
		return e.fallbackBatch(texts)
	}

	for i := range vecs {
		normalizeVec(vecs[i])
	}
	return vecs, nil
}

// IsNeural returns true if the neural embedding service is available.
func (e *HTTPEmbedder) IsNeural() bool {
	return e.healthy
}

// --- Internal ---

func (e *HTTPEmbedder) decodeFirst(r io.Reader) ([]float32, error) {
	// Both Ollama and generic use {"embeddings": [[...]]}
	var result genericEmbedResponse
	if err := json.NewDecoder(io.LimitReader(r, 10<<20)).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Embeddings) == 0 || len(result.Embeddings[0]) == 0 {
		return nil, fmt.Errorf("empty embeddings response")
	}
	return result.Embeddings[0], nil
}

func (e *HTTPEmbedder) decodeAll(r io.Reader) ([][]float32, error) {
	var result genericEmbedResponse
	if err := json.NewDecoder(io.LimitReader(r, 50<<20)).Decode(&result); err != nil {
		return nil, err
	}
	return result.Embeddings, nil
}

func (e *HTTPEmbedder) fallbackBatch(texts []string) ([][]float32, error) {
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

func (e *HTTPEmbedder) ping() bool {
	var body []byte
	if e.isOllama {
		body, _ = json.Marshal(ollamaEmbedRequest{Model: e.model, Input: []string{"test"}})
	} else {
		body, _ = json.Marshal(genericEmbedRequest{Texts: []string{"test"}})
	}

	resp, err := e.client.Post(e.url, "application/json", bytes.NewReader(body))
	if err != nil {
		mode := "generic"
		if e.isOllama {
			mode = "ollama/" + e.model
		}
		slog.Warn("neural embedder: service unreachable, using TF-IDF fallback", "mode", mode, "url", e.url, "err", err)
		return false
	}
	resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		mode := "generic"
		if e.isOllama {
			mode = "ollama/" + e.model
		}
		slog.Info("neural embedder: connected", "mode", mode, "url", e.url)
		return true
	}

	slog.Warn("neural embedder: service returned error, using TF-IDF fallback",
		"url", e.url, "status", resp.StatusCode)
	return false
}

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
