package api

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/search"
)

// Deps holds handler dependencies.
type Deps struct {
	Search       *search.DistributedSearch
	StatusFn     func() *models.NodeStatus
	CrawlSeed    func(url string)
	CrawlerInfo  func() *models.CrawlerInfo
	CrawlerFeed  func(afterSeq uint64) []models.CrawlEvent
	IndexerStats func() *models.IndexerInfo
	PeersInfo    func() []models.PeerInfo
	IndexStore   index.Store
	ReportURL    func(url, reason, detail string) error
	TrustSummary func() *models.TrustSummary
	SetNodeName  func(name string)
}

// SearchHandler handles GET /api/search?q=...&page=...&size=...
func SearchHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query().Get("q")
		if query == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing query parameter 'q'"})
			return
		}

		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		size, _ := strconv.Atoi(r.URL.Query().Get("size"))
		if size < 1 {
			size = 10
		}

		req := &models.SearchRequest{
			Query:    query,
			Page:     page,
			PageSize: size,
		}

		resp, err := deps.Search.Search(context.Background(), req)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

// StatusHandler handles GET /api/status
func StatusHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := deps.StatusFn()
		writeJSON(w, http.StatusOK, status)
	}
}

// CrawlHandler handles POST /api/crawl with JSON body {"url": "..."}
func CrawlHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'url' in request body"})
			return
		}

		if !strings.HasPrefix(body.URL, "http://") && !strings.HasPrefix(body.URL, "https://") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "URL must use http or https scheme"})
			return
		}
		if !isSafeURL(body.URL) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "URL targets a private or reserved address"})
			return
		}

		deps.CrawlSeed(body.URL)
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "queued", "url": body.URL})
	}
}

// CrawlerInfoHandler handles GET /api/admin/crawler
func CrawlerInfoHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.CrawlerInfo == nil {
			writeJSON(w, http.StatusOK, map[string]string{})
			return
		}
		writeJSON(w, http.StatusOK, deps.CrawlerInfo())
	}
}

// CrawlerFeedHandler handles GET /api/admin/crawler/feed?after=N
func CrawlerFeedHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.CrawlerFeed == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"events": []interface{}{}})
			return
		}
		afterSeq, _ := strconv.ParseUint(r.URL.Query().Get("after"), 10, 64)
		events := deps.CrawlerFeed(afterSeq)
		writeJSON(w, http.StatusOK, map[string]interface{}{"events": events})
	}
}

// IndexerStatsHandler handles GET /api/admin/indexer
func IndexerStatsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.IndexerStats == nil {
			writeJSON(w, http.StatusOK, map[string]string{})
			return
		}
		writeJSON(w, http.StatusOK, deps.IndexerStats())
	}
}

// PeersHandler handles GET /api/admin/peers
func PeersHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.PeersInfo == nil {
			writeJSON(w, http.StatusOK, []interface{}{})
			return
		}
		writeJSON(w, http.StatusOK, deps.PeersInfo())
	}
}

// DocumentsHandler handles GET /api/admin/documents?offset=0&limit=20
func DocumentsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.IndexStore == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"documents": []interface{}{}, "total": 0})
			return
		}

		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit < 1 || limit > 100 {
			limit = 20
		}
		if offset < 0 {
			offset = 0
		}

		docs, total, err := deps.IndexStore.ListRecent(offset, limit)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"documents": docs,
			"total":     total,
			"offset":    offset,
			"limit":     limit,
		})
	}
}

// DocumentDetailHandler handles GET /api/admin/documents/{id}
func DocumentDetailHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.IndexStore == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "index not available"})
			return
		}

		id := chi.URLParam(r, "id")
		if id == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing document id"})
			return
		}

		doc, err := deps.IndexStore.Get(id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, doc)
	}
}

// BatchCrawlHandler handles POST /api/crawl/batch with JSON body {"urls": [...]}
func BatchCrawlHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			URLs []string `json:"urls"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}

		if len(body.URLs) == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no URLs provided"})
			return
		}

		if len(body.URLs) > 200 {
			body.URLs = body.URLs[:200]
		}

		queued := 0
		for _, u := range body.URLs {
			u = strings.TrimSpace(u)
			if (strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://")) && isSafeURL(u) {
				deps.CrawlSeed(u)
				queued++
			}
		}

		writeJSON(w, http.StatusAccepted, map[string]interface{}{
			"status": "queued",
			"queued": queued,
			"total":  len(body.URLs),
		})
	}
}

// isSafeURL checks that a URL targets a public host (not private/internal IPs).
func isSafeURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := u.Hostname()
	if host == "" {
		return false
	}

	// Reject localhost variants.
	lower := strings.ToLower(host)
	if lower == "localhost" || lower == "0.0.0.0" || strings.HasSuffix(lower, ".local") {
		return false
	}

	ip := net.ParseIP(host)
	if ip == nil {
		// hostname, not IP — allow (DNS resolution happens at crawl time).
		return true
	}

	// Reject private, loopback, link-local, and reserved ranges.
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return false
	}

	// Reject cloud metadata IPs (169.254.169.254).
	if ip.Equal(net.ParseIP("169.254.169.254")) {
		return false
	}

	return true
}

// ReportHandler handles POST /api/report with JSON body {"url": "...", "reason": "...", "detail": "..."}
func ReportHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ReportURL == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "trust system not available"})
			return
		}

		var body struct {
			URL    string `json:"url"`
			Reason string `json:"reason"`
			Detail string `json:"detail"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" || body.Reason == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error":           "missing 'url' and 'reason' in request body",
				"valid_reasons":   "spam, malware, phishing, illegal, low_quality",
			})
			return
		}

		// Validate reason
		valid := false
		for _, r := range models.ValidReportReasons() {
			if body.Reason == r {
				valid = true
				break
			}
		}
		if !valid {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error":         "invalid reason",
				"valid_reasons": "spam, malware, phishing, illegal, low_quality",
			})
			return
		}

		if err := deps.ReportURL(body.URL, body.Reason, body.Detail); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusAccepted, map[string]string{"status": "reported", "url": body.URL, "reason": body.Reason})
	}
}

// TrustHandler handles GET /api/admin/trust
func TrustHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.TrustSummary == nil {
			writeJSON(w, http.StatusOK, map[string]string{})
			return
		}
		writeJSON(w, http.StatusOK, deps.TrustSummary())
	}
}

// SetNodeNameHandler handles POST /api/config/name
func SetNodeNameHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.SetNodeName == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "not supported"})
			return
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
			return
		}
		if len(body.Name) > 64 {
			body.Name = body.Name[:64]
		}
		deps.SetNodeName(body.Name)
		writeJSON(w, http.StatusOK, map[string]string{"name": body.Name})
	}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
