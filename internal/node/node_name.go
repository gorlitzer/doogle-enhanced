package node

import (
	"os"
	"path/filepath"
	"strings"
)

const nodeNameFile = "node_name"

// LoadNodeName reads the persisted node name from disk.
// Returns empty string if no name has been saved.
func LoadNodeName(dataDir string) string {
	data, err := os.ReadFile(filepath.Join(dataDir, nodeNameFile))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// SaveNodeName persists the node name to disk.
func SaveNodeName(dataDir, name string) error {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dataDir, nodeNameFile), []byte(name), 0600)
}
