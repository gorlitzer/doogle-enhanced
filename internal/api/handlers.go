package api

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/doogle/doogle-v2/internal/fleet"
	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/updater"
	"github.com/doogle/doogle-v2/internal/p2p"
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
	SetNodeName    func(name string)
	DataDir        string
	StorageFn      func() (*models.StorageInfo, error)
	LeaderboardFn      func() (*models.LeaderboardResponse, error)
	DomainOwnershipFn  func() (*models.DomainOwnership, error)

	// Build version info (for update endpoints)
	VersionInfo struct{ Version, Commit, BuildDate string }

	// Master profile
	ProfileFn         func() *models.MasterProfile
	RecordInterestsFn func(subcategoryIDs []string) error
	RecordSearchFn    func(query string)

	// Intelligence (Phase 4)
	TrendsFn func() *models.TrendsResponse
	ClickFn  func(query, url string, position int) error

	// Behavioral tracking (Phase 2)
	ImpressionFn func(query, url string, position int) error
	DwellFn      func(query, url string, dwellMs int64) error
	PogoStickFn  func(query, url string) error

	// Trust admin operations
	UnquarantineFn      func(peerID string) error
	DismissReportFn     func(reportID string) error
	ConfirmReportFn     func(reportID string) error
	UnblockDomainFn     func(domain string) error
	AuditTrailFn        func(limit int) []interface{}
	VoteDocQuarantineFn func(url string, confirm bool) error

	// Relay leaderboard (light nodes)
	RelayLeaderboardFn func() (*models.RelayLeaderboardResponse, error)

	// Resource limits
	GetLimitsFn func() *LimitsResponse
	SetLimitsFn func(*LimitsRequest) error

	// System info + low-resource mode
	SysInfoFn        func() interface{}
	SetLowResourceFn func(enabled bool) error

	// Graceful restart (update + re-exec)
	RestartFn func()

	// Fleet management (coordinator only)
	FleetSummary  func() *fleet.FleetSummary
	FleetGetNode  func(peerID string) *fleet.FleetNode
	FleetProxy    func(ctx context.Context, peerID, method, path, query string, headers map[string]string, body []byte) (*p2p.ProxyResponseHeader, []byte, error)
	FleetAPIToken string

	// Fleet upgrade orchestration (coordinator only)
	FleetUpgrade func(ctx context.Context, peerIDs []string, progressFn func(FleetUpgradeEvent)) error

	// Autocomplete suggestions
	SuggestFn func(prefix string, limit int) []string
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

		// Append peer filter operators to the query string
		if peerFilter := r.URL.Query().Get("peer"); peerFilter != "" {
			query += " peer:" + peerFilter
		}
		for _, ep := range r.URL.Query()["exclude_peer"] {
			if ep != "" {
				query += " -peer:" + ep
			}
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

		// Record search topic for profile (async, non-blocking)
		if deps.RecordSearchFn != nil {
			go deps.RecordSearchFn(query)
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

// StatusHandler handles GET /api/status
// Fleet-sensitive fields (API token, secret file) are only included for
// requests originating from localhost to prevent token leakage over the network.
func StatusHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := deps.StatusFn()
		if !isLoopback(r) {
			status.FleetAPIToken = ""
			status.FleetSecretFile = ""
			status.FleetSecretHex = ""
		}
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

		peerFilter := r.URL.Query().Get("peer")
		var docs []index.IndexDocument
		var total int
		var err error
		if peerFilter != "" {
			docs, total, err = deps.IndexStore.ListRecentByPeer(peerFilter, offset, limit)
		} else {
			docs, total, err = deps.IndexStore.ListRecent(offset, limit)
		}
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

// DumpHandler handles GET /api/admin/dump — streams a tar.gz backup of the data directory.
func DumpHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dataDir := deps.DataDir
		if dataDir == "" {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "data directory not configured"})
			return
		}

		absDir, err := filepath.Abs(dataDir)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "invalid data directory"})
			return
		}

		info, err := os.Stat(absDir)
		if err != nil || !info.IsDir() {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "data directory does not exist"})
			return
		}

		filename := fmt.Sprintf("doogle-backup-%s.tar.gz", time.Now().Format("20060102T150405"))
		w.Header().Set("Content-Type", "application/gzip")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

		gzWriter := gzip.NewWriter(w)
		defer gzWriter.Close()

		tarWriter := tar.NewWriter(gzWriter)
		defer tarWriter.Close()

		// Sensitive files to exclude from backups.
		skipFiles := map[string]bool{
			"fleet.secret": true,
		}

		filepath.Walk(absDir, func(path string, fi os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			// Skip sensitive files.
			if !fi.IsDir() && skipFiles[fi.Name()] {
				return nil
			}

			relPath, err := filepath.Rel(filepath.Dir(absDir), path)
			if err != nil {
				return err
			}

			header, err := tar.FileInfoHeader(fi, "")
			if err != nil {
				return err
			}
			header.Name = relPath

			if err := tarWriter.WriteHeader(header); err != nil {
				return err
			}

			if fi.IsDir() {
				return nil
			}

			f, err := os.Open(path)
			if err != nil {
				return err
			}
			defer f.Close()

			_, err = io.Copy(tarWriter, f)
			return err
		})
	}
}

// RestoreHandler handles POST /api/admin/restore — accepts a tar.gz upload and restores the data directory.
func RestoreHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dataDir := deps.DataDir
		if dataDir == "" {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "data directory not configured"})
			return
		}

		// Limit upload to 2GB
		r.Body = http.MaxBytesReader(w, r.Body, 2<<30)

		file, _, err := r.FormFile("archive")
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'archive' file field"})
			return
		}
		defer file.Close()

		// Save to temp file
		tmpFile, err := os.CreateTemp("", "doogle-restore-*.tar.gz")
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create temp file"})
			return
		}
		tmpPath := tmpFile.Name()
		defer os.Remove(tmpPath)

		if _, err := io.Copy(tmpFile, file); err != nil {
			tmpFile.Close()
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save upload"})
			return
		}
		tmpFile.Close()

		// Open and extract
		f, err := os.Open(tmpPath)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read archive"})
			return
		}
		defer f.Close()

		gzReader, err := gzip.NewReader(f)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "not a valid gzip archive"})
			return
		}
		defer gzReader.Close()

		absDir, _ := filepath.Abs(dataDir)
		parentDir := filepath.Dir(absDir)
		tarReader := tar.NewReader(gzReader)
		fileCount := 0

		for {
			header, err := tarReader.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "corrupt archive"})
				return
			}

			targetPath := filepath.Join(parentDir, header.Name)

			// Prevent path traversal
			if !strings.HasPrefix(filepath.Clean(targetPath), filepath.Clean(parentDir)) {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "archive contains path traversal"})
				return
			}

			switch header.Typeflag {
			case tar.TypeDir:
				os.MkdirAll(targetPath, os.FileMode(header.Mode))
			case tar.TypeReg:
				os.MkdirAll(filepath.Dir(targetPath), 0755)
				outFile, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
				if err != nil {
					continue
				}
				io.Copy(outFile, tarReader)
				outFile.Close()
				fileCount++
			}
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "restored",
			"files":   fileCount,
			"message": "Restart the node for changes to take effect.",
		})
	}
}

// DeleteDataHandler handles DELETE /api/admin/data?confirm=yes — wipes the data directory.
func DeleteDataHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dataDir := deps.DataDir
		if dataDir == "" {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "data directory not configured"})
			return
		}

		if r.URL.Query().Get("confirm") != "yes" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "must pass ?confirm=yes"})
			return
		}

		absDir, err := filepath.Abs(dataDir)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "invalid data directory"})
			return
		}

		if err := os.RemoveAll(absDir); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to delete: %v", err)})
			return
		}

		// Recreate empty dir
		os.MkdirAll(absDir, 0755)

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "deleted",
			"message": "All data has been deleted. Restart the node.",
		})
	}
}

// StorageHandler handles GET /api/admin/storage
func StorageHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.StorageFn == nil {
			writeJSON(w, http.StatusOK, map[string]string{})
			return
		}
		info, err := deps.StorageFn()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, info)
	}
}

// LeaderboardHandler handles GET /api/admin/leaderboard
func LeaderboardHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.LeaderboardFn == nil {
			writeJSON(w, http.StatusOK, map[string]string{})
			return
		}
		lb, err := deps.LeaderboardFn()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, lb)
	}
}

// RelayLeaderboardHandler handles GET /api/admin/leaderboard/relay
func RelayLeaderboardHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.RelayLeaderboardFn == nil {
			writeJSON(w, http.StatusOK, map[string]string{})
			return
		}
		lb, err := deps.RelayLeaderboardFn()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, lb)
	}
}

// DomainOwnershipHandler handles GET /api/admin/domains
func DomainOwnershipHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.DomainOwnershipFn == nil {
			writeJSON(w, http.StatusOK, &models.DomainOwnership{})
			return
		}
		ownership, err := deps.DomainOwnershipFn()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, ownership)
	}
}

// UpdateCheckHandler handles GET /api/admin/update-check (localhost-only).
func UpdateCheckHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "update check is only available from localhost"})
			return
		}

		current := deps.VersionInfo.Version

		token, err := updater.ResolveToken()
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"current":          current,
				"update_available": false,
				"error":            err.Error(),
			})
			return
		}

		release, err := updater.FetchLatestRelease(token)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"current":          current,
				"update_available": false,
				"error":            err.Error(),
			})
			return
		}

		available := release.TagName != current && current != "dev"
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"current":          current,
			"latest":           release.TagName,
			"update_available": available,
		})
	}
}

// UpdateApplyHandler handles POST /api/admin/update (localhost-only).
func UpdateApplyHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "update is only available from localhost"})
			return
		}

		current := deps.VersionInfo.Version

		newVersion, err := updater.ApplyUpdate(current)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":      "updated",
			"old_version": current,
			"new_version": newVersion,
			"message":     "Restart the node to use the new version.",
		})
	}
}

// ProfileHandler handles GET /api/admin/profile (localhost-only).
func ProfileHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ProfileFn == nil {
			writeJSON(w, http.StatusOK, map[string]string{})
			return
		}
		writeJSON(w, http.StatusOK, deps.ProfileFn())
	}
}

// ProfileInterestsHandler handles POST /api/profile/interests.
func ProfileInterestsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.RecordInterestsFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "profile not available"})
			return
		}
		var body struct {
			SubcategoryIDs []string `json:"subcategory_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.SubcategoryIDs) == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'subcategory_ids' in request body"})
			return
		}
		if err := deps.RecordInterestsFn(body.SubcategoryIDs); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "recorded", "count": strconv.Itoa(len(body.SubcategoryIDs))})
	}
}

// TrendsHandler handles GET /api/trends
func TrendsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.TrendsFn == nil {
			writeJSON(w, http.StatusOK, &models.TrendsResponse{})
			return
		}
		writeJSON(w, http.StatusOK, deps.TrendsFn())
	}
}

// ClickHandler handles POST /api/click
func ClickHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ClickFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "click tracking not available"})
			return
		}
		var body struct {
			Query    string `json:"query"`
			URL      string `json:"url"`
			Position int    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'url' in request body"})
			return
		}
		if err := deps.ClickFn(body.Query, body.URL, body.Position); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "recorded"})
	}
}

// ImpressionHandler handles POST /api/impression
func ImpressionHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ImpressionFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not available"})
			return
		}
		var body struct {
			Query    string `json:"query"`
			URL      string `json:"url"`
			Position int    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'url'"})
			return
		}
		if err := deps.ImpressionFn(body.Query, body.URL, body.Position); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "recorded"})
	}
}

// DwellHandler handles POST /api/dwell
func DwellHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.DwellFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not available"})
			return
		}
		var body struct {
			Query   string `json:"query"`
			URL     string `json:"url"`
			DwellMs int64  `json:"dwell_ms"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'url'"})
			return
		}
		if err := deps.DwellFn(body.Query, body.URL, body.DwellMs); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "recorded"})
	}
}

// PogoStickHandler handles POST /api/pogo
func PogoStickHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.PogoStickFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not available"})
			return
		}
		var body struct {
			Query string `json:"query"`
			URL   string `json:"url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'url'"})
			return
		}
		if err := deps.PogoStickFn(body.Query, body.URL); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "recorded"})
	}
}

// UnquarantineHandler handles POST /api/admin/trust/unquarantine
func UnquarantineHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.UnquarantineFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not available"})
			return
		}
		var body struct {
			PeerID string `json:"peer_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PeerID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'peer_id'"})
			return
		}
		if err := deps.UnquarantineFn(body.PeerID); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "unquarantined", "peer_id": body.PeerID})
	}
}

// DismissReportHandler handles POST /api/admin/trust/dismiss-report
func DismissReportHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.DismissReportFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not available"})
			return
		}
		var body struct {
			ReportID string `json:"report_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ReportID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'report_id'"})
			return
		}
		if err := deps.DismissReportFn(body.ReportID); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "dismissed", "report_id": body.ReportID})
	}
}

// ConfirmReportHandler handles POST /api/admin/trust/confirm-report
func ConfirmReportHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.ConfirmReportFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not available"})
			return
		}
		var body struct {
			ReportID string `json:"report_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ReportID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'report_id'"})
			return
		}
		if err := deps.ConfirmReportFn(body.ReportID); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "confirmed", "report_id": body.ReportID})
	}
}

// UnblockDomainHandler handles POST /api/admin/trust/unblock-domain
func UnblockDomainHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.UnblockDomainFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not available"})
			return
		}
		var body struct {
			Domain string `json:"domain"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Domain == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'domain'"})
			return
		}
		if err := deps.UnblockDomainFn(body.Domain); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "unblocked", "domain": body.Domain})
	}
}

// VoteDocQuarantineHandler handles POST /api/admin/trust/vote-quarantine
func VoteDocQuarantineHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.VoteDocQuarantineFn == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not available"})
			return
		}
		var body struct {
			URL     string `json:"url"`
			Confirm bool   `json:"confirm"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'url'"})
			return
		}
		if err := deps.VoteDocQuarantineFn(body.URL, body.Confirm); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		action := "confirmed"
		if !body.Confirm {
			action = "dismissed"
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": action, "url": body.URL})
	}
}

// AuditTrailHandler handles GET /api/admin/trust/audit?limit=50
func AuditTrailHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.AuditTrailFn == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"entries": []interface{}{}})
			return
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit < 1 || limit > 200 {
			limit = 50
		}
		entries := deps.AuditTrailFn(limit)
		writeJSON(w, http.StatusOK, map[string]interface{}{"entries": entries})
	}
}

// LimitsResponse is returned by GET /api/admin/limits.
type LimitsResponse struct {
	MaxStorageBytes int64 `json:"max_storage_bytes"`
	MaxDocuments    int64 `json:"max_documents"`
	MaxQueueSize    int64 `json:"max_queue_size"`
	UsedStorage     int64 `json:"used_storage"`
	UsedDocuments   int64 `json:"used_documents"`
	UsedQueue       int64 `json:"used_queue"`
	CrawlerPaused   bool  `json:"crawler_paused"`
}

// LimitsRequest is accepted by POST /api/admin/limits.
type LimitsRequest struct {
	MaxStorageBytes *int64 `json:"max_storage_bytes"`
	MaxDocuments    *int64 `json:"max_documents"`
	MaxQueueSize    *int64 `json:"max_queue_size"`
}

// GetLimitsHandler handles GET /api/admin/limits
func GetLimitsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.GetLimitsFn == nil {
			writeJSON(w, http.StatusOK, map[string]string{})
			return
		}
		writeJSON(w, http.StatusOK, deps.GetLimitsFn())
	}
}

// SetLimitsHandler handles POST /api/admin/limits
func SetLimitsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.SetLimitsFn == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "not supported"})
			return
		}
		var req LimitsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		if err := deps.SetLimitsFn(&req); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		// Return updated state
		if deps.GetLimitsFn != nil {
			writeJSON(w, http.StatusOK, deps.GetLimitsFn())
		} else {
			writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
		}
	}
}

// SystemInfoHandler handles GET /api/admin/sysinfo
func SystemInfoHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.SysInfoFn == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "not supported"})
			return
		}
		writeJSON(w, http.StatusOK, deps.SysInfoFn())
	}
}

// SetLowResourceHandler handles POST /api/admin/low-resource
func SetLowResourceHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.SetLowResourceFn == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "not supported"})
			return
		}
		var req struct {
			Enabled bool `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		if err := deps.SetLowResourceFn(req.Enabled); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if deps.SysInfoFn != nil {
			writeJSON(w, http.StatusOK, deps.SysInfoFn())
		} else {
			writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
		}
	}
}

// FleetUpgradeEvent is a progress event emitted during fleet-wide upgrades.
type FleetUpgradeEvent struct {
	PeerID    string `json:"peer_id,omitempty"`
	PeerName  string `json:"peer_name,omitempty"`
	Step      string `json:"step"`
	Message   string `json:"message"`
	Version   string `json:"version,omitempty"`
	WorkerNum int    `json:"worker_num,omitempty"`
	Total     int    `json:"total,omitempty"`
}

// UpdateAndRestartHandler handles POST /api/admin/update-restart.
// It applies the update, writes the response, flushes, then schedules a restart.
func UpdateAndRestartHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.RestartFn == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "restart not supported"})
			return
		}

		current := deps.VersionInfo.Version
		newVersion, err := updater.ApplyUpdate(current)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":      "updated",
			"old_version": current,
			"new_version": newVersion,
			"restarting":  true,
		})

		// Flush the response before restarting.
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}

		// Schedule restart after a brief delay so the HTTP response is delivered.
		go func() {
			time.Sleep(500 * time.Millisecond)
			deps.RestartFn()
		}()
	}
}

// SuggestHandler handles GET /api/suggest?q=...&limit=...
func SuggestHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		prefix := r.URL.Query().Get("q")
		if prefix == "" {
			writeJSON(w, http.StatusOK, map[string]interface{}{"suggestions": []string{}})
			return
		}
		limit := 10
		if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 50 {
			limit = l
		}
		var suggestions []string
		if deps.SuggestFn != nil {
			suggestions = deps.SuggestFn(prefix, limit)
		}
		if suggestions == nil {
			suggestions = []string{}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"suggestions": suggestions})
	}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
