package node

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

const limitsFile = "limits.yaml"
const lowResourceFile = "low_resource.yaml"

// ResourceLimits holds configurable resource caps persisted to disk.
type ResourceLimits struct {
	MaxStorageBytes int64 `yaml:"max_storage_bytes"`
	MaxDocuments    int64 `yaml:"max_documents"`
	MaxQueueSize    int64 `yaml:"max_queue_size"`
}

// LoadLimits reads persisted limits from {dataDir}/limits.yaml.
// Returns nil if the file doesn't exist or can't be parsed.
func LoadLimits(dataDir string) *ResourceLimits {
	data, err := os.ReadFile(filepath.Join(dataDir, limitsFile))
	if err != nil {
		return nil
	}
	var lim ResourceLimits
	if err := yaml.Unmarshal(data, &lim); err != nil {
		return nil
	}
	return &lim
}

// SaveLimits persists resource limits to {dataDir}/limits.yaml.
func SaveLimits(dataDir string, lim *ResourceLimits) error {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return err
	}
	data, err := yaml.Marshal(lim)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dataDir, limitsFile), data, 0600)
}

type lowResourceSetting struct {
	Enabled bool `yaml:"enabled"`
}

// LoadLowResource reads persisted low-resource setting from {dataDir}/low_resource.yaml.
func LoadLowResource(dataDir string) bool {
	data, err := os.ReadFile(filepath.Join(dataDir, lowResourceFile))
	if err != nil {
		return false
	}
	var s lowResourceSetting
	if err := yaml.Unmarshal(data, &s); err != nil {
		return false
	}
	return s.Enabled
}

// SaveLowResource persists low-resource setting to {dataDir}/low_resource.yaml.
func SaveLowResource(dataDir string, enabled bool) error {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return err
	}
	data, err := yaml.Marshal(&lowResourceSetting{Enabled: enabled})
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dataDir, lowResourceFile), data, 0600)
}
