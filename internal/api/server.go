package api

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/http/pprof"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"

	"github.com/doogle/doogle-v2/web"
)

// Server is the HTTP API server.
type Server struct {
	router *chi.Mux
	server *http.Server
}

// NewServer creates the HTTP server with all routes.
func NewServer(bind string, port int, deps *Deps) *Server {
	r := chi.NewRouter()

	// Middleware — restrict CORS to localhost origins only
	r.Use(cors.Handler(cors.Options{
		AllowOriginFunc: func(_ *http.Request, origin string) bool {
			return strings.HasPrefix(origin, "http://localhost:") ||
				strings.HasPrefix(origin, "http://127.0.0.1:") ||
				strings.HasPrefix(origin, "https://localhost:") ||
				strings.HasPrefix(origin, "https://127.0.0.1:")
		},
		AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: false,
		MaxAge:           3600,
	}))
	r.Use(SecurityHeaders)
	// Reject requests whose Host header isn't an allowed value. This defeats
	// DNS-rebinding attacks, where a malicious web page rebinds its own domain
	// to 127.0.0.1 to reach the loopback-gated admin API from the victim's
	// browser. When bound to a wildcard/public address we can't enumerate valid
	// hosts, so validation is limited to the loopback default.
	r.Use(HostAllowlist(bind))
	r.Use(Logger)
	r.Use(RateLimiter(20, 40)) // 20 req/s per IP, burst of 40

	// API routes
	r.Route("/api", func(r chi.Router) {
		r.Get("/search", SearchHandler(deps))
		r.Get("/suggest", SuggestHandler(deps))
		r.Get("/status", StatusHandler(deps))
		r.Post("/crawl", CrawlHandler(deps))
		r.Post("/crawl/batch", BatchCrawlHandler(deps))
		r.Post("/report", ReportHandler(deps))
		r.Post("/config/name", SetNodeNameHandler(deps))
		r.Post("/profile/interests", ProfileInterestsHandler(deps))
		r.Get("/trends", TrendsHandler(deps))
		r.Post("/click", ClickHandler(deps))
		r.Post("/impression", ImpressionHandler(deps))
		r.Post("/dwell", DwellHandler(deps))
		r.Post("/pogo", PogoStickHandler(deps))

		// Admin endpoints (localhost-only)
		r.Route("/admin", func(r chi.Router) {
			r.Use(LoopbackOnly)
			r.Get("/crawler", CrawlerInfoHandler(deps))
			r.Get("/crawler/feed", CrawlerFeedHandler(deps))
			r.Get("/indexer", IndexerStatsHandler(deps))
			r.Get("/peers", PeersHandler(deps))
			r.Get("/documents", DocumentsHandler(deps))
			r.Get("/documents/{id}", DocumentDetailHandler(deps))
			r.Get("/trust", TrustHandler(deps))
			r.Post("/trust/unquarantine", UnquarantineHandler(deps))
			r.Post("/trust/dismiss-report", DismissReportHandler(deps))
			r.Post("/trust/confirm-report", ConfirmReportHandler(deps))
			r.Post("/trust/unblock-domain", UnblockDomainHandler(deps))
			r.Post("/trust/vote-quarantine", VoteDocQuarantineHandler(deps))
			r.Get("/trust/audit", AuditTrailHandler(deps))
			r.Get("/storage", StorageHandler(deps))
			r.Get("/limits", GetLimitsHandler(deps))
			r.Post("/limits", SetLimitsHandler(deps))
			r.Get("/leaderboard", LeaderboardHandler(deps))
			r.Get("/leaderboard/relay", RelayLeaderboardHandler(deps))
			r.Get("/domains", DomainOwnershipHandler(deps))
			r.Get("/profile", ProfileHandler(deps))
			r.Get("/sysinfo", SystemInfoHandler(deps))
			r.Post("/low-resource", SetLowResourceHandler(deps))
			r.Get("/searxng", GetSearXNGHandler(deps))
			r.Post("/searxng", SetSearXNGHandler(deps))
			r.Get("/embeddings", GetEmbeddingsHandler(deps))
			r.Post("/embeddings", SetEmbeddingsHandler(deps))
			r.Get("/dump", DumpHandler(deps))
			r.Post("/restore", RestoreHandler(deps))
			r.Delete("/data", DeleteDataHandler(deps))
			r.Get("/update-check", UpdateCheckHandler(deps))
			r.Post("/update", UpdateApplyHandler(deps))
			r.Post("/update-restart", UpdateAndRestartHandler(deps))
		})

		// Fleet endpoints (only if coordinator)
		if deps.FleetAPIToken != "" {
			r.Route("/fleet", func(r chi.Router) {
				r.Use(BearerAuth(deps.FleetAPIToken))
				r.Get("/nodes", FleetNodesHandler(deps))
				r.Get("/nodes/{peerID}", FleetNodeDetailHandler(deps))
				r.HandleFunc("/nodes/{peerID}/proxy/*", FleetProxyHandler(deps))
				r.Get("/versions", FleetVersionsHandler(deps))
				r.Post("/upgrade", FleetUpgradeHandler(deps))
			})
		}
	})

	// Debug profiling — loopback only. These endpoints dump process memory
	// (heap/goroutine profiles can leak secrets such as the fleet token and key
	// material) and can be used for CPU/trace DoS, so they must never be exposed
	// to the network. CORS does not gate non-browser clients, so gate explicitly.
	r.Group(func(r chi.Router) {
		r.Use(LoopbackOnly)
		r.HandleFunc("/debug/pprof/*", pprof.Index)
		r.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
		r.HandleFunc("/debug/pprof/profile", pprof.Profile)
		r.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
		r.HandleFunc("/debug/pprof/trace", pprof.Trace)
	})

	// Serve embedded static files
	staticContent, err := fs.Sub(web.StaticFS, "static")
	if err != nil {
		log.Printf("api: static files not available: %v", err)
	} else {
		fileServer := http.FileServer(http.FS(staticContent))
		r.Handle("/*", fileServer)
	}

	addr := fmt.Sprintf("%s:%d", bind, port)
	if !isLoopbackHost(bind) {
		log.Printf("api: WARNING — binding to %q exposes the API to the network. "+
			"The admin surface (data wipe, restore, binary update) is only protected "+
			"by loopback + Host checks, and public /api write endpoints are "+
			"unauthenticated over plaintext HTTP. Only do this behind an "+
			"authenticating TLS reverse proxy. See docs/running-a-node.md.", bind)
	}
	return &Server{
		router: r,
		server: &http.Server{
			Addr:         addr,
			Handler:      r,
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 30 * time.Second,
		},
	}
}

// Start begins listening.
func (s *Server) Start() error {
	log.Printf("api: listening on %s", s.server.Addr)
	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// Shutdown gracefully stops the server.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}
