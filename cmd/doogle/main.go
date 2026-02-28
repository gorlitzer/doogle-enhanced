package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/doogle/doogle-v2/internal/node"
)

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

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
