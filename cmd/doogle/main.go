package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/node"
)

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	// Check for "search" subcommand before flag.Parse()
	if len(os.Args) > 1 && os.Args[1] == "search" {
		runSearch(os.Args[2:])
		return
	}

	// Load config with defaults, then apply CLI flags
	cfg := node.DefaultConfig()
	node.ParseFlags(cfg)

	log.Println("=== Doogle v2 — P2P Decentralized Search Engine ===")
	log.Printf("P2P port: %d | API port: %d | Data dir: %s", cfg.P2P.Port, cfg.API.Port, cfg.Storage.DataDir)

	// Create and initialize the node
	n, err := node.New(cfg)
	if err != nil {
		log.Fatalf("failed to create node: %v", err)
	}

	// Graceful shutdown on SIGINT/SIGTERM
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		log.Printf("received signal: %v", sig)
		n.Shutdown()
		os.Exit(0)
	}()

	// Run the node (blocks on HTTP server)
	if err := n.Run(); err != nil {
		log.Fatalf("node error: %v", err)
	}
}

func runSearch(args []string) {
	fs := flag.NewFlagSet("search", flag.ExitOnError)
	apiURL := fs.String("api", "http://localhost:8080", "API base URL")
	jsonOut := fs.Bool("json", false, "Output raw JSON")
	page := fs.Int("page", 0, "Result page (0-indexed)")
	size := fs.Int("size", 10, "Results per page")
	fs.Parse(args)

	query := strings.Join(fs.Args(), " ")
	if query == "" {
		fmt.Fprintln(os.Stderr, "usage: doogle search [--api URL] [--json] [--page N] [--size N] <query>")
		os.Exit(1)
	}

	// Build request URL
	u := fmt.Sprintf("%s/api/search?q=%s&page=%d&page_size=%d",
		strings.TrimRight(*apiURL, "/"),
		url.QueryEscape(query),
		*page,
		*size,
	)

	resp, err := http.Get(u)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error reading response: %v\n", err)
		os.Exit(1)
	}

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "API error (%d): %s\n", resp.StatusCode, string(body))
		os.Exit(1)
	}

	if *jsonOut {
		fmt.Println(string(body))
		return
	}

	var sr models.SearchResponse
	if err := json.Unmarshal(body, &sr); err != nil {
		fmt.Fprintf(os.Stderr, "error parsing response: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Query: %s | %d results (%.0fms)\n\n", sr.Query, sr.Total, float64(sr.TookMs))

	for i, r := range sr.Results {
		num := *page*(*size) + i + 1
		fmt.Printf("%d. %s\n", num, r.Title)
		fmt.Printf("   %s\n", r.URL)
		if r.Description != "" {
			fmt.Printf("   %s\n", truncateCLI(r.Description, 120))
		}
		fmt.Printf("   score=%.4f\n\n", r.Score)
	}
}

// truncateCLI truncates a string to maxLen, adding "..." if truncated.
func truncateCLI(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	if maxLen <= 3 {
		return s[:maxLen]
	}
	return s[:maxLen-3] + "..."
}
