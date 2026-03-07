package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/doogle/doogle-v2/internal/node"
)

func runSetup(args []string) {
	fs := flag.NewFlagSet("setup", flag.ExitOnError)
	dataDir := fs.String("data-dir", "./data/doogle", "Data directory")
	fs.Parse(args)

	reader := bufio.NewReader(os.Stdin)

	fmt.Println("=== Doogle Setup Wizard ===")
	fmt.Println()

	// 1. Node name
	currentName := node.LoadNodeName(*dataDir)
	if currentName != "" {
		fmt.Printf("Node Name [%s]: ", currentName)
	} else {
		fmt.Print("Node Name [My Doogle Node]: ")
	}
	name := readLine(reader)
	if name == "" {
		if currentName != "" {
			name = currentName
		} else {
			name = "My Doogle Node"
		}
	}

	// 2. Max storage
	fmt.Print("Max Storage GB [2.0]: ")
	storageStr := readLine(reader)
	storageGB := 2.0
	if storageStr != "" {
		if v, err := strconv.ParseFloat(storageStr, 64); err == nil && v >= 0 {
			storageGB = v
		}
	}

	// 3. Max documents
	fmt.Print("Max Documents (thousands) [50]: ")
	docsStr := readLine(reader)
	docsK := 50
	if docsStr != "" {
		if v, err := strconv.Atoi(docsStr); err == nil && v >= 0 {
			docsK = v
		}
	}

	// 4. Max queue
	fmt.Print("Max Queue Size (thousands) [100]: ")
	queueStr := readLine(reader)
	queueK := 100
	if queueStr != "" {
		if v, err := strconv.Atoi(queueStr); err == nil && v >= 0 {
			queueK = v
		}
	}

	// 5. Workers
	fmt.Print("Crawler Workers [4]: ")
	workersStr := readLine(reader)
	workers := 4
	if workersStr != "" {
		if v, err := strconv.Atoi(workersStr); err == nil && v >= 1 {
			workers = v
		}
	}

	// 6. Seed URLs
	fmt.Println("Seed URLs (one per line, empty line to finish):")
	var seeds []string
	for {
		fmt.Print("  > ")
		line := readLine(reader)
		if line == "" {
			break
		}
		if strings.HasPrefix(line, "http://") || strings.HasPrefix(line, "https://") {
			seeds = append(seeds, line)
		} else {
			fmt.Println("    (skipped — must start with http:// or https://)")
		}
	}

	// Save node name
	if err := node.SaveNodeName(*dataDir, name); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to save node name: %v\n", err)
	}

	// Save limits
	limits := &node.ResourceLimits{
		MaxStorageBytes: int64(storageGB * 1024 * 1024 * 1024),
		MaxDocuments:    int64(docsK) * 1000,
		MaxQueueSize:    int64(queueK) * 1000,
	}
	if err := node.SaveLimits(*dataDir, limits); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to save limits: %v\n", err)
	}

	// Summary
	fmt.Println()
	fmt.Println("=== Setup Complete ===")
	fmt.Printf("  Node Name:    %s\n", name)
	fmt.Printf("  Data Dir:     %s\n", *dataDir)
	fmt.Printf("  Max Storage:  %.1f GB\n", storageGB)
	fmt.Printf("  Max Docs:     %dK\n", docsK)
	fmt.Printf("  Max Queue:    %dK\n", queueK)
	fmt.Printf("  Workers:      %d\n", workers)
	if len(seeds) > 0 {
		fmt.Printf("  Seeds:        %d URLs\n", len(seeds))
	}
	fmt.Println()

	// Build recommended start command
	cmd := fmt.Sprintf("./bin/doogle --data-dir %s --workers %d", *dataDir, workers)
	if len(seeds) > 0 {
		cmd += " --seed " + strings.Join(seeds, ",")
	}
	fmt.Printf("Start with:\n  %s\n", cmd)
}

func readLine(reader *bufio.Reader) string {
	line, _ := reader.ReadString('\n')
	return strings.TrimSpace(line)
}
