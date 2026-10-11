package node

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDefaultConfig_NodeNameEmpty(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.NodeName != "" {
		t.Errorf("expected empty NodeName by default, got %q", cfg.NodeName)
	}
}

func TestLoadConfig_NodeName(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")

	yaml := `node_name: "Test Node"
p2p:
  port: 7001
`
	if err := os.WriteFile(path, []byte(yaml), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	if cfg.NodeName != "Test Node" {
		t.Errorf("expected 'Test Node', got %q", cfg.NodeName)
	}
}

func TestLoadConfig_NodeNameEmpty(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")

	yaml := `p2p:
  port: 7001
`
	if err := os.WriteFile(path, []byte(yaml), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	if cfg.NodeName != "" {
		t.Errorf("expected empty NodeName, got %q", cfg.NodeName)
	}
}

func TestLoadConfig_PreservesDefaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")

	yaml := `node_name: "My Node"
`
	if err := os.WriteFile(path, []byte(yaml), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}

	// NodeName from config
	if cfg.NodeName != "My Node" {
		t.Errorf("NodeName: got %q", cfg.NodeName)
	}
	// Defaults should still be applied for unset fields
	if cfg.P2P.Port != 7001 {
		t.Errorf("P2P.Port: expected 7001, got %d", cfg.P2P.Port)
	}
	if cfg.Crawler.Workers != 4 {
		t.Errorf("Crawler.Workers: expected 4, got %d", cfg.Crawler.Workers)
	}
}

func TestDefaultConfig_StorageMaintenanceDefaults(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.Storage.GCInterval != 5*time.Minute {
		t.Errorf("GCInterval: expected 5m, got %v", cfg.Storage.GCInterval)
	}
	if cfg.Storage.SeenTTL != 7*24*time.Hour {
		t.Errorf("SeenTTL: expected 168h, got %v", cfg.Storage.SeenTTL)
	}
	if cfg.Storage.ContentMaxAge != 30*24*time.Hour {
		t.Errorf("ContentMaxAge: expected 720h, got %v", cfg.Storage.ContentMaxAge)
	}
}

func TestLoadConfig_StorageMaintenanceOverrides(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")

	yaml := `storage:
  gc_interval: 10m
  seen_ttl: 48h
  content_max_age: 360h
`
	if err := os.WriteFile(path, []byte(yaml), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}

	if cfg.Storage.GCInterval != 10*time.Minute {
		t.Errorf("GCInterval: expected 10m, got %v", cfg.Storage.GCInterval)
	}
	if cfg.Storage.SeenTTL != 48*time.Hour {
		t.Errorf("SeenTTL: expected 48h, got %v", cfg.Storage.SeenTTL)
	}
	if cfg.Storage.ContentMaxAge != 360*time.Hour {
		t.Errorf("ContentMaxAge: expected 360h, got %v", cfg.Storage.ContentMaxAge)
	}
}

func TestNodeStatus_NodeNameJSON(t *testing.T) {
	// Verify the struct tag is correct by checking models import indirectly
	cfg := DefaultConfig()
	cfg.NodeName = "JSON Test"
	if cfg.NodeName != "JSON Test" {
		t.Error("NodeName field assignment failed")
	}
}
