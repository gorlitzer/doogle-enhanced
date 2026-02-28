package api

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"net/http"
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

	// Middleware
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: false,
		MaxAge:           3600,
	}))
	r.Use(Logger)

	// API routes
	r.Route("/api", func(r chi.Router) {
		r.Get("/search", SearchHandler(deps))
		r.Get("/status", StatusHandler(deps))
		r.Post("/crawl", CrawlHandler(deps))

		// Admin endpoints
		r.Route("/admin", func(r chi.Router) {
			r.Get("/crawler", CrawlerInfoHandler(deps))
			r.Get("/indexer", IndexerStatsHandler(deps))
			r.Get("/peers", PeersHandler(deps))
			r.Get("/documents", DocumentsHandler(deps))
			r.Get("/documents/{id}", DocumentDetailHandler(deps))
		})
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
