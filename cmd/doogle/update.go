package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	repoOwner = "gorlitzer"
	repoName  = "doogle-enhanced"
	apiBase   = "https://api.github.com"
)

type ghRelease struct {
	TagName string    `json:"tag_name"`
	Assets  []ghAsset `json:"assets"`
}

type ghAsset struct {
	Name string `json:"name"`
	ID   int64  `json:"id"`
	Size int64  `json:"size"`
	URL  string `json:"url"` // API URL for download
}

func runUpdate(args []string) {
	checkOnly := false
	for _, a := range args {
		if a == "--check" || a == "-check" {
			checkOnly = true
		}
	}

	token, err := resolveToken()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Checking for updates...")

	release, err := fetchLatestRelease(token)
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

	// Find matching asset
	assetName := fmt.Sprintf("doogle-%s-%s", runtime.GOOS, runtime.GOARCH)
	asset, err := findAsset(release, assetName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Downloading %s (%.1f MB)...\n", asset.Name, float64(asset.Size)/(1024*1024))

	execPath, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: cannot determine executable path: %v\n", err)
		os.Exit(1)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: cannot resolve executable path: %v\n", err)
		os.Exit(1)
	}

	// Download to temp file in the same directory (for atomic rename)
	tmpPath := execPath + ".update"
	if err := downloadAsset(asset, token, tmpPath); err != nil {
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	// Make executable
	if err := os.Chmod(tmpPath, 0755); err != nil {
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	// Verify the downloaded binary
	fmt.Println("Verifying...")
	if err := verifyBinary(tmpPath); err != nil {
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "error: downloaded binary is invalid: %v\n", err)
		os.Exit(1)
	}

	// Replace the current binary
	if err := replaceBinary(tmpPath, execPath); err != nil {
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Updated to %s\n", latest)
}

// resolveToken checks GITHUB_TOKEN env, then ~/.doogle/token file.
func resolveToken() (string, error) {
	if t := os.Getenv("GITHUB_TOKEN"); t != "" {
		return strings.TrimSpace(t), nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}

	tokenPath := filepath.Join(home, ".doogle", "token")
	data, err := os.ReadFile(tokenPath)
	if err == nil {
		t := strings.TrimSpace(string(data))
		if t != "" {
			return t, nil
		}
	}

	return "", fmt.Errorf("no GitHub token found\n\nSet one of:\n  export GITHUB_TOKEN=ghp_...\n  echo 'ghp_...' > ~/.doogle/token")
}

// fetchLatestRelease gets the latest release from the GitHub API.
func fetchLatestRelease(token string) (*ghRelease, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/releases/latest", apiBase, repoOwner, repoName)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach GitHub API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return nil, fmt.Errorf("no releases found (or token lacks repo access)")
	}
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API error (%d): %s", resp.StatusCode, string(body))
	}

	var release ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to parse release: %w", err)
	}
	return &release, nil
}

// findAsset looks for an asset matching the given name.
func findAsset(release *ghRelease, name string) (*ghAsset, error) {
	for i := range release.Assets {
		if release.Assets[i].Name == name {
			return &release.Assets[i], nil
		}
	}

	available := make([]string, len(release.Assets))
	for i, a := range release.Assets {
		available[i] = a.Name
	}
	return nil, fmt.Errorf("no binary found for %s\navailable: %s", name, strings.Join(available, ", "))
}

// downloadAsset downloads a release asset using the API URL (required for private repos).
func downloadAsset(asset *ghAsset, token, destPath string) error {
	// Use the asset's API URL with octet-stream accept for private repo support
	assetURL := fmt.Sprintf("%s/repos/%s/%s/releases/assets/%d", apiBase, repoOwner, repoName, asset.ID)

	req, err := http.NewRequest("GET", assetURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/octet-stream")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("download failed (%d): %s", resp.StatusCode, string(body))
	}

	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("cannot create temp file: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, resp.Body); err != nil {
		return fmt.Errorf("download interrupted: %w", err)
	}
	return nil
}

// verifyBinary runs the downloaded binary with "version --json" to check it's valid.
func verifyBinary(path string) error {
	cmd := exec.Command(path, "version", "--json")
	out, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("binary failed to execute: %w", err)
	}

	var info map[string]string
	if err := json.Unmarshal(out, &info); err != nil {
		return fmt.Errorf("unexpected version output: %w", err)
	}
	if info["version"] == "" {
		return fmt.Errorf("binary reported empty version")
	}
	return nil
}

// replaceBinary atomically replaces the old binary with the new one.
func replaceBinary(newPath, oldPath string) error {
	if err := os.Rename(newPath, oldPath); err != nil {
		// Rename fails across filesystems — fall back to copy
		return crossDeviceReplace(newPath, oldPath)
	}
	return nil
}

// crossDeviceReplace copies new over old when they're on different filesystems.
func crossDeviceReplace(newPath, oldPath string) error {
	src, err := os.Open(newPath)
	if err != nil {
		return err
	}
	defer src.Close()

	info, err := src.Stat()
	if err != nil {
		return err
	}

	dst, err := os.OpenFile(oldPath, os.O_WRONLY|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return err
	}

	src.Close()
	os.Remove(newPath)
	return nil
}
