package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/node"
	"github.com/lmittmann/tint"
)

func main() {
	// Check for subcommands before flag.Parse()
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "search":
			runSearch(os.Args[2:])
			return
		case "dump":
			runDump(os.Args[2:])
			return
		case "restore":
			runRestore(os.Args[2:])
			return
		}
	}

	// Load config with defaults, then apply CLI flags
	cfg := node.DefaultConfig()
	node.ParseFlags(cfg)

	// Set up structured logging
	var level slog.Level
	switch strings.ToLower(cfg.LogLevel) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	handler := tint.NewHandler(os.Stderr, &tint.Options{
		Level:      level,
		TimeFormat: time.TimeOnly,
	})
	slog.SetDefault(slog.New(handler))

	slog.Info("Doogle v2 — P2P Decentralized Search Engine")
	slog.Info("config summary", "p2p_port", cfg.P2P.Port, "api_port", cfg.API.Port, "data_dir", cfg.Storage.DataDir, "log_level", cfg.LogLevel)

	// Create and initialize the node
	n, err := node.New(cfg)
	if err != nil {
		slog.Error("failed to create node", "err", err)
		os.Exit(1)
	}

	// Graceful shutdown on SIGINT/SIGTERM — second signal or 20s timeout forces exit
	sigCh := make(chan os.Signal, 2)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		slog.Info("received signal, shutting down", "signal", sig)
		go func() {
			select {
			case <-time.After(20 * time.Second):
				slog.Error("shutdown timed out — forcing exit")
			case sig2 := <-sigCh:
				slog.Warn("second signal — forcing exit", "signal", sig2)
			}
			os.Exit(1)
		}()
		n.Shutdown()
		os.Exit(0)
	}()

	// Run the node (blocks on HTTP server)
	if err := n.Run(); err != nil {
		slog.Error("node error", "err", err)
		os.Exit(1)
	}
}

func runSearch(args []string) {
	fs := flag.NewFlagSet("search", flag.ExitOnError)
	apiURL := fs.String("api", "http://localhost:7002", "API base URL")
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

// runDump creates a tar.gz archive of the data directory.
func runDump(args []string) {
	fs := flag.NewFlagSet("dump", flag.ExitOnError)
	dataDir := fs.String("data-dir", "./data/doogle", "Data directory to back up")
	output := fs.String("output", "", "Output archive path (default: doogle-backup-<timestamp>.tar.gz)")
	fs.Parse(args)

	// Resolve data directory
	absDir, err := filepath.Abs(*dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error resolving path: %v\n", err)
		os.Exit(1)
	}

	info, err := os.Stat(absDir)
	if err != nil || !info.IsDir() {
		fmt.Fprintf(os.Stderr, "error: data directory %s does not exist\n", absDir)
		os.Exit(1)
	}

	// Determine output path
	outPath := *output
	if outPath == "" {
		outPath = fmt.Sprintf("doogle-backup-%s.tar.gz", time.Now().Format("20060102T150405"))
	}

	// Create the archive
	outFile, err := os.Create(outPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error creating archive: %v\n", err)
		os.Exit(1)
	}
	defer outFile.Close()

	gzWriter := gzip.NewWriter(outFile)
	defer gzWriter.Close()

	tarWriter := tar.NewWriter(gzWriter)
	defer tarWriter.Close()

	fileCount := 0
	baseName := filepath.Base(absDir)

	err = filepath.Walk(absDir, func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Build archive path relative to parent of data dir
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

		if _, err := io.Copy(tarWriter, f); err != nil {
			return err
		}

		fileCount++
		return nil
	})

	if err != nil {
		fmt.Fprintf(os.Stderr, "error creating archive: %v\n", err)
		os.Exit(1)
	}

	// Close writers to flush
	tarWriter.Close()
	gzWriter.Close()
	outFile.Close()

	// Report
	archiveInfo, _ := os.Stat(outPath)
	size := archiveInfo.Size()
	sizeStr := formatBytes(size)

	fmt.Printf("Dump complete\n")
	fmt.Printf("  Source:  %s (%s)\n", absDir, baseName)
	fmt.Printf("  Archive: %s (%s)\n", outPath, sizeStr)
	fmt.Printf("  Files:   %d\n", fileCount)
}

// runRestore extracts a tar.gz archive to the data directory.
func runRestore(args []string) {
	fs := flag.NewFlagSet("restore", flag.ExitOnError)
	dataDir := fs.String("data-dir", "./data/doogle", "Data directory to restore into")
	force := fs.Bool("force", false, "Overwrite existing data directory")
	fs.Parse(args)

	if fs.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "usage: doogle restore [--data-dir PATH] [--force] <archive.tar.gz>")
		os.Exit(1)
	}

	archivePath := fs.Arg(0)

	// Verify archive exists
	if _, err := os.Stat(archivePath); err != nil {
		fmt.Fprintf(os.Stderr, "error: archive %s not found\n", archivePath)
		os.Exit(1)
	}

	absDir, err := filepath.Abs(*dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error resolving path: %v\n", err)
		os.Exit(1)
	}

	// Check if data dir exists
	if info, err := os.Stat(absDir); err == nil && info.IsDir() {
		if !*force {
			fmt.Fprintf(os.Stderr, "error: %s already exists (use --force to overwrite)\n", absDir)
			os.Exit(1)
		}
		fmt.Printf("Removing existing %s...\n", absDir)
		if err := os.RemoveAll(absDir); err != nil {
			fmt.Fprintf(os.Stderr, "error removing directory: %v\n", err)
			os.Exit(1)
		}
	}

	// Open archive
	f, err := os.Open(archivePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error opening archive: %v\n", err)
		os.Exit(1)
	}
	defer f.Close()

	gzReader, err := gzip.NewReader(f)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %s is not a valid gzip archive\n", archivePath)
		os.Exit(1)
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)
	parentDir := filepath.Dir(absDir)
	fileCount := 0

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			fmt.Fprintf(os.Stderr, "error reading archive: %v\n", err)
			os.Exit(1)
		}

		targetPath := filepath.Join(parentDir, header.Name)

		// Prevent path traversal
		if !strings.HasPrefix(filepath.Clean(targetPath), filepath.Clean(parentDir)) {
			fmt.Fprintf(os.Stderr, "error: archive contains path traversal: %s\n", header.Name)
			os.Exit(1)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, os.FileMode(header.Mode)); err != nil {
				fmt.Fprintf(os.Stderr, "error creating directory: %v\n", err)
				os.Exit(1)
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
				fmt.Fprintf(os.Stderr, "error creating directory: %v\n", err)
				os.Exit(1)
			}
			outFile, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				fmt.Fprintf(os.Stderr, "error creating file: %v\n", err)
				os.Exit(1)
			}
			if _, err := io.Copy(outFile, tarReader); err != nil {
				outFile.Close()
				fmt.Fprintf(os.Stderr, "error writing file: %v\n", err)
				os.Exit(1)
			}
			outFile.Close()
			fileCount++
		}
	}

	fmt.Printf("Restore complete\n")
	fmt.Printf("  Archive: %s\n", archivePath)
	fmt.Printf("  Target:  %s\n", absDir)
	fmt.Printf("  Files:   %d\n", fileCount)
}

// formatBytes formats a byte count as a human-readable string.
func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
