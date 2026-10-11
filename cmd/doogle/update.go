package main

import (
	"fmt"
	"os"

	"github.com/doogle/doogle-v2/internal/updater"
)

func runUpdate(args []string) {
	checkOnly := false
	for _, a := range args {
		if a == "--check" || a == "-check" {
			checkOnly = true
		}
	}

	token, err := updater.ResolveToken()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Checking for updates...")

	release, err := updater.FetchLatestRelease(token)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	latest := release.TagName
	current := version

	if latest == current && current != "dev" {
		fmt.Printf("Already up to date (%s)\n", current)
		return
	}

	fmt.Printf("Current: %s → Latest: %s\n", current, latest)

	if checkOnly {
		fmt.Println("Update available. Run 'doogle update' to install.")
		return
	}

	newVer, err := updater.ApplyUpdate(current)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Updated to %s\n", newVer)
}
