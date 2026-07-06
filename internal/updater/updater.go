package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

const (
	RepoOwner = "gorlitzer"
	RepoName  = "doogle-enhanced"
	APIBase   = "https://api.github.com"
)

// GHRelease represents a GitHub release.
type GHRelease struct {
	TagName string    `json:"tag_name"`
	Assets  []GHAsset `json:"assets"`
}

// GHAsset represents a GitHub release asset.
type GHAsset struct {
	Name string `json:"name"`
	ID   int64  `json:"id"`
	Size int64  `json:"size"`
	URL  string `json:"url"`
}

// ResolveToken checks GITHUB_TOKEN env, ~/.doogle/token file, then gh CLI auth.
func ResolveToken() (string, error) {
	// 1. Environment variable
	if t := os.Getenv("GITHUB_TOKEN"); t != "" {
		return strings.TrimSpace(t), nil
	}

	// 2. Token file
	home, err := os.UserHomeDir()
	if err == nil {
		tokenPath := filepath.Join(home, ".doogle", "token")
		data, err := os.ReadFile(tokenPath)
		if err == nil {
			t := strings.TrimSpace(string(data))
			if t != "" {
				return t, nil
			}
		}
	}

	// 3. gh CLI (if installed and authenticated)
	if out, err := exec.Command("gh", "auth", "token").Output(); err == nil {
		t := strings.TrimSpace(string(out))
		if t != "" {
			return t, nil
		}
	}

	return "", fmt.Errorf("no GitHub token found\n\nSet one of:\n  export GITHUB_TOKEN=ghp_...\n  echo 'ghp_...' > ~/.doogle/token\n  gh auth login")
}

// FetchLatestRelease gets the latest release from the GitHub API.
func FetchLatestRelease(token string) (*GHRelease, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/releases/latest", APIBase, RepoOwner, RepoName)

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

	var release GHRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to parse release: %w", err)
	}
	return &release, nil
}

// FindAsset looks for an asset matching the given name.
func FindAsset(release *GHRelease, name string) (*GHAsset, error) {
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

// AssetName returns the expected asset name for the current OS/arch.
func AssetName() string {
	return fmt.Sprintf("doogle-%s-%s", runtime.GOOS, runtime.GOARCH)
}

// DownloadAsset downloads a release asset to destPath.
func DownloadAsset(asset *GHAsset, token, destPath string) error {
	assetURL := fmt.Sprintf("%s/repos/%s/%s/releases/assets/%d", APIBase, RepoOwner, RepoName, asset.ID)

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

// ChecksumFileName is the release asset that lists SHA-256 sums of each binary.
const ChecksumFileName = "checksums.txt"

// FetchChecksums downloads and parses the release's checksums.txt into a map of
// filename -> lowercase hex SHA-256.
func FetchChecksums(release *GHRelease, token string) (map[string]string, error) {
	asset, err := FindAsset(release, ChecksumFileName)
	if err != nil {
		return nil, fmt.Errorf("release is missing %s, cannot verify integrity: %w", ChecksumFileName, err)
	}

	assetURL := fmt.Sprintf("%s/repos/%s/%s/releases/assets/%d", APIBase, RepoOwner, RepoName, asset.ID)
	req, err := http.NewRequest("GET", assetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/octet-stream")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download checksums: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("download checksums (%d): %s", resp.StatusCode, string(body))
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	sums := make(map[string]string)
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 {
			continue
		}
		// sha256sum format is "<hex>  <name>"; name may carry a leading '*'.
		name := strings.TrimPrefix(fields[1], "*")
		sums[name] = strings.ToLower(fields[0])
	}
	return sums, nil
}

// VerifyChecksum computes the SHA-256 of the file at path and compares it to the
// expected hex digest. This is the integrity gate for auto-update: it ensures
// the downloaded binary is exactly what the release published.
func VerifyChecksum(path, expectedHex string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	got := hex.EncodeToString(h.Sum(nil))
	if !strings.EqualFold(got, expectedHex) {
		return fmt.Errorf("checksum mismatch: got %s, expected %s", got, expectedHex)
	}
	return nil
}

// VerifyBinary runs the downloaded binary with "version --json" as a basic
// sanity check that it executes. NOTE: this is NOT an integrity check — a
// malicious replacement would also run fine. Integrity is enforced separately
// by VerifyChecksum against the release's signed-in-transit checksums.txt.
func VerifyBinary(path string) error {
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

// ReplaceBinary atomically replaces the old binary with the new one.
func ReplaceBinary(newPath, oldPath string) error {
	if err := os.Rename(newPath, oldPath); err != nil {
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

// SelfRestart re-executes the current binary with the same arguments.
// It resolves symlinks to find the real path, then calls syscall.Exec
// which replaces the current process (does not return on success).
func SelfRestart() error {
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot determine executable: %w", err)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("cannot resolve executable: %w", err)
	}
	return syscall.Exec(execPath, os.Args, os.Environ())
}

// ApplyUpdate runs the full update pipeline: fetch → find → download → verify → replace.
// Returns the new version tag on success.
func ApplyUpdate(currentVersion string) (newVersion string, err error) {
	token, err := ResolveToken()
	if err != nil {
		return "", err
	}

	release, err := FetchLatestRelease(token)
	if err != nil {
		return "", err
	}

	if release.TagName == currentVersion && currentVersion != "dev" {
		return "", fmt.Errorf("already up to date (%s)", currentVersion)
	}

	asset, err := FindAsset(release, AssetName())
	if err != nil {
		return "", err
	}

	execPath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("cannot determine executable path: %w", err)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return "", fmt.Errorf("cannot resolve executable path: %w", err)
	}

	tmpPath := execPath + ".update"
	if err := DownloadAsset(asset, token, tmpPath); err != nil {
		os.Remove(tmpPath)
		return "", err
	}

	if err := os.Chmod(tmpPath, 0755); err != nil {
		os.Remove(tmpPath)
		return "", err
	}

	// Integrity check: the downloaded binary must match the SHA-256 published in
	// the release's checksums.txt before we ever execute or install it.
	sums, err := FetchChecksums(release, token)
	if err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("cannot verify update integrity: %w", err)
	}
	expected, ok := sums[AssetName()]
	if !ok {
		os.Remove(tmpPath)
		return "", fmt.Errorf("no checksum published for %s, refusing to update", AssetName())
	}
	if err := VerifyChecksum(tmpPath, expected); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("update integrity check failed: %w", err)
	}

	if err := VerifyBinary(tmpPath); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("downloaded binary is invalid: %w", err)
	}

	if err := ReplaceBinary(tmpPath, execPath); err != nil {
		os.Remove(tmpPath)
		return "", err
	}

	return release.TagName, nil
}
