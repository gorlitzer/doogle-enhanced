package api

import (
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// FleetNodesHandler handles GET /api/fleet/nodes → FleetSummary
func FleetNodesHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.FleetSummary == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "fleet not available"})
			return
		}
		writeJSON(w, http.StatusOK, deps.FleetSummary())
	}
}

// FleetNodeDetailHandler handles GET /api/fleet/nodes/{peerID} → FleetNode
func FleetNodeDetailHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.FleetGetNode == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "fleet not available"})
			return
		}

		peerID := chi.URLParam(r, "peerID")
		node := deps.FleetGetNode(peerID)
		if node == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "node not found"})
			return
		}
		writeJSON(w, http.StatusOK, node)
	}
}

// FleetProxyHandler handles ANY /api/fleet/nodes/{peerID}/proxy/* → forwards to worker
func FleetProxyHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.FleetProxy == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "fleet proxy not available"})
			return
		}

		peerID := chi.URLParam(r, "peerID")

		// Extract the target path: everything after /proxy
		rctx := chi.RouteContext(r.Context())
		routePath := rctx.RoutePattern()
		_ = routePath

		// Build target path from the wildcard
		fullPath := r.URL.Path
		prefix := "/api/fleet/nodes/" + peerID + "/proxy"
		targetPath := strings.TrimPrefix(fullPath, prefix)
		if targetPath == "" {
			targetPath = "/"
		}

		// Read request body (limit 10 MB)
		var body []byte
		if r.Body != nil {
			var err error
			body, err = io.ReadAll(io.LimitReader(r.Body, 10<<20))
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "failed to read body"})
				return
			}
		}

		// Forward relevant headers.
		headers := make(map[string]string)
		if ct := r.Header.Get("Content-Type"); ct != "" {
			headers["Content-Type"] = ct
		}
		if accept := r.Header.Get("Accept"); accept != "" {
			headers["Accept"] = accept
		}

		respHeader, respBody, err := deps.FleetProxy(r.Context(), peerID, r.Method, targetPath, r.URL.RawQuery, headers, body)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}

		// Write response headers.
		for k, v := range respHeader.Headers {
			w.Header().Set(k, v)
		}
		w.WriteHeader(respHeader.StatusCode)
		w.Write(respBody)
	}
}
