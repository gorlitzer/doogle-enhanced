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

	// 2. Node type
	fmt.Println("Node Type:")
	fmt.Println("  1. Full Node (crawl + index + search)")
	fmt.Println("  2. Light Node (search + relay only)")
	fmt.Print("Choice [1]: ")
	nodeTypeStr := readLine(reader)
	isLight := nodeTypeStr == "2"

	// Defaults depend on node type
	defaultStorageGB := 2.0
	defaultDocsK := 50
	defaultQueueK := 100
	defaultWorkers := 4
	if isLight {
		defaultStorageGB = 0.5
		defaultDocsK = 10
		defaultQueueK = 0
		defaultWorkers = 0
	}

	// 3. Max storage
	fmt.Printf("Max Storage GB [%.1f]: ", defaultStorageGB)
	storageStr := readLine(reader)
	storageGB := defaultStorageGB
	if storageStr != "" {
		if v, err := strconv.ParseFloat(storageStr, 64); err == nil && v >= 0 {
			storageGB = v
		}
	}

	// 4. Max documents
	fmt.Printf("Max Documents (thousands) [%d]: ", defaultDocsK)
	docsStr := readLine(reader)
	docsK := defaultDocsK
	if docsStr != "" {
		if v, err := strconv.Atoi(docsStr); err == nil && v >= 0 {
			docsK = v
		}
	}

	var queueK int
	var workers int
	var seeds []string

	if isLight {
		queueK = 0
		workers = 0
	} else {
		// 5. Max queue (full nodes only)
		fmt.Printf("Max Queue Size (thousands) [%d]: ", defaultQueueK)
		queueStr := readLine(reader)
		queueK = defaultQueueK
		if queueStr != "" {
			if v, err := strconv.Atoi(queueStr); err == nil && v >= 0 {
				queueK = v
			}
		}

		// 6. Workers (full nodes only)
		fmt.Printf("Crawler Workers [%d]: ", defaultWorkers)
		workersStr := readLine(reader)
		workers = defaultWorkers
		if workersStr != "" {
			if v, err := strconv.Atoi(workersStr); err == nil && v >= 1 {
				workers = v
			}
		}

		// 7. Seed URLs (full nodes only)
		fmt.Println("Seed URLs (one per line, empty line to finish):")
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
	}

	// Save node name
	if err := node.SaveNodeName(*dataDir, name); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to save node name: %v\n", err)
	}

	// Save light node setting
	if err := node.SaveLightNode(*dataDir, isLight); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to save light node setting: %v\n", err)
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
	nodeTypeLabel := "Full Node"
	if isLight {
		nodeTypeLabel = "Light Node"
	}
	fmt.Println()
	fmt.Println("=== Setup Complete ===")
	fmt.Printf("  Node Name:    %s\n", name)
	fmt.Printf("  Node Type:    %s\n", nodeTypeLabel)
	fmt.Printf("  Data Dir:     %s\n", *dataDir)
	fmt.Printf("  Max Storage:  %.1f GB\n", storageGB)
	fmt.Printf("  Max Docs:     %dK\n", docsK)
	if !isLight {
		fmt.Printf("  Max Queue:    %dK\n", queueK)
		fmt.Printf("  Workers:      %d\n", workers)
	}
	if len(seeds) > 0 {
		fmt.Printf("  Seeds:        %d URLs\n", len(seeds))
	}
	fmt.Println()

	// Build recommended start command
	cmd := fmt.Sprintf("./bin/doogle --data-dir %s", *dataDir)
	if isLight {
		cmd += " --light"
	} else {
		cmd += fmt.Sprintf(" --workers %d", workers)
	}
	if len(seeds) > 0 {
		cmd += " --seed " + strings.Join(seeds, ",")
	}
	fmt.Printf("Start with:\n  %s\n", cmd)
}

func readLine(reader *bufio.Reader) string {
	line, _ := reader.ReadString('\n')
	return strings.TrimSpace(line)
}
