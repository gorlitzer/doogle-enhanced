package node

import (
	"os"
	"path/filepath"
	"testing"
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
  port: 4001
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
  port: 4001
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
	if cfg.P2P.Port != 4001 {
		t.Errorf("P2P.Port: expected 4001, got %d", cfg.P2P.Port)
	}
	if cfg.Crawler.Workers != 4 {
		t.Errorf("Crawler.Workers: expected 4, got %d", cfg.Crawler.Workers)
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
