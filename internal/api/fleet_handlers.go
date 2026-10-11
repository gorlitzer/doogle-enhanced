package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/doogle/doogle-v2/internal/updater"
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

// FleetVersionsHandler handles GET /api/fleet/versions.
// Returns coordinator version, latest GitHub release, and per-worker versions.
func FleetVersionsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.FleetSummary == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "fleet not available"})
			return
		}

		coordVersion := deps.VersionInfo.Version
		summary := deps.FleetSummary()

		type workerVersion struct {
			PeerID  string `json:"peer_id"`
			Name    string `json:"name"`
			Version string `json:"version"`
			Status  string `json:"status"`
		}

		workers := make([]workerVersion, 0, len(summary.Nodes))
		for _, n := range summary.Nodes {
			workers = append(workers, workerVersion{
				PeerID:  n.PeerID,
				Name:    n.Name,
				Version: n.Stats.Version,
				Status:  n.Status,
			})
		}

		// Fetch latest release version from GitHub.
		latestVersion := ""
		updateAvailable := false
		token, err := updater.ResolveToken()
		if err == nil {
			release, err := updater.FetchLatestRelease(token)
			if err == nil {
				latestVersion = release.TagName
				updateAvailable = latestVersion != coordVersion && coordVersion != "dev"
			}
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"coordinator_version": coordVersion,
			"latest_version":      latestVersion,
			"update_available":    updateAvailable,
			"workers":             workers,
		})
	}
}

// FleetUpgradeHandler handles POST /api/fleet/upgrade.
// Accepts optional {"peer_ids": [...]} — empty means all online workers.
// Streams SSE events as each worker is processed.
func FleetUpgradeHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.FleetUpgrade == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "fleet upgrade not available"})
			return
		}

		var body struct {
			PeerIDs []string `json:"peer_ids"`
		}
		if r.Body != nil && r.ContentLength > 0 {
			_ = json.NewDecoder(r.Body).Decode(&body)
		}

		// Set up SSE streaming.
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		flusher, ok := w.(http.Flusher)
		if !ok {
			return
		}

		// Extend write deadline for long-running upgrades (10 minutes).
		rc := http.NewResponseController(w)
		_ = rc.SetWriteDeadline(time.Now().Add(10 * time.Minute))

		err := deps.FleetUpgrade(r.Context(), body.PeerIDs, func(evt FleetUpgradeEvent) {
			data, _ := json.Marshal(evt)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		})
		if err != nil {
			evt, _ := json.Marshal(FleetUpgradeEvent{Step: "error", Message: err.Error()})
			fmt.Fprintf(w, "data: %s\n\n", evt)
			flusher.Flush()
		}
	}
}
