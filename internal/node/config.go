package node

import (
	"flag"
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Config holds all node configuration.
type Config struct {
	NodeName string        `yaml:"node_name"`
	LogLevel string        `yaml:"log_level"`
	P2P      P2PConfig     `yaml:"p2p"`
	API      APIConfig     `yaml:"api"`
	Crawler  CrawlerConfig `yaml:"crawler"`
	Index    IndexConfig   `yaml:"index"`
	Storage  StorageConfig `yaml:"storage"`
	Search   SearchConfig  `yaml:"search"`

	Fleet FleetConfig `yaml:"fleet"`

	// Seed URLs provided via CLI
	SeedURLs []string `yaml:"-"`

	// Build info (set by main, not persisted)
	Version   string `yaml:"-"`
	Commit    string `yaml:"-"`
	BuildDate string `yaml:"-"`
}

type FleetConfig struct {
	Role              string        `yaml:"role"`               // "standalone", "coordinator", "worker"
	CoordinatorPeer   string        `yaml:"coordinator_peer"`   // multiaddr (workers only)
	FleetSecret       string        `yaml:"fleet_secret"`       // hex override
	HeartbeatInterval time.Duration `yaml:"heartbeat_interval"` // default 15s
	NodeTimeout       time.Duration `yaml:"node_timeout"`       // default 60s
	Allowlist         []string      `yaml:"allowlist"`          // coordinator only
}

type P2PConfig struct {
	Port                 int           `yaml:"port"`
	BootstrapPeers       []string      `yaml:"bootstrap_peers"`
	MDNS                 bool          `yaml:"mdns"`
	DHTDiscovery         bool          `yaml:"dht_discovery"`
	DHTRendezvous        string        `yaml:"dht_rendezvous"`
	DHTDiscoveryInterval time.Duration `yaml:"dht_discovery_interval"`
	DHTMaxPeers          int           `yaml:"dht_max_peers"`
}

type APIConfig struct {
	Port int    `yaml:"port"`
	Bind string `yaml:"bind"`
}

type CrawlerConfig struct {
	Workers           int           `yaml:"workers"`
	UserAgent         string        `yaml:"user_agent"`
	RequestTimeout    time.Duration `yaml:"request_timeout"`
	RateLimit         int           `yaml:"rate_limit"`
	MaxDepth          int           `yaml:"max_depth"`
	RespectRobots     bool          `yaml:"respect_robots"`
	EnableHeadless    bool          `yaml:"enable_headless"`
	HeadlessThreshold int           `yaml:"headless_threshold"`
	HeadlessTimeout   time.Duration `yaml:"headless_timeout"`
}

type IndexConfig struct {
	BleveDir             string        `yaml:"bleve_dir"`
	PageRankInterval     time.Duration `yaml:"pagerank_interval"`
	BatchSize            int           `yaml:"batch_size"`
	BatchFlushInterval   time.Duration `yaml:"batch_flush_interval"`
	IncrementalInterval  time.Duration `yaml:"incremental_interval"`
	ReplicationFactor    int           `yaml:"replication_factor"`
	AntiEntropyInterval  time.Duration `yaml:"anti_entropy_interval"`
}

type StorageConfig struct {
	DataDir   string `yaml:"data_dir"`
	BadgerDir string `yaml:"badger_dir"`
}

type SearchConfig struct {
	MaxResults      int           `yaml:"max_results"`
	DefaultPageSize int           `yaml:"default_page_size"`
	PeerTimeout     time.Duration `yaml:"peer_timeout"`
	MaxPeers        int           `yaml:"max_peers"`
	CacheSize       int           `yaml:"cache_size"`
	CacheTTL        time.Duration `yaml:"cache_ttl"`
}

// DefaultConfig returns sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		LogLevel: "info",
		P2P: P2PConfig{
			Port:                 7001,
			MDNS:                 true,
			DHTDiscovery:         true,
			DHTRendezvous:        "doogle/network/v2",
			DHTDiscoveryInterval: 30 * time.Second,
			DHTMaxPeers:          50,
		},
		API: APIConfig{
			Port: 7002,
			Bind: "0.0.0.0",
		},
		Crawler: CrawlerConfig{
			Workers:           4,
			UserAgent:         "DoogleBot/2.0 (+https://github.com/doogle/doogle-v2)",
			RequestTimeout:    30 * time.Second,
			RateLimit:         10,
			MaxDepth:          3,
			RespectRobots:     true,
			EnableHeadless:    false,
			HeadlessThreshold: 500,
			HeadlessTimeout:   30 * time.Second,
		},
		Index: IndexConfig{
			BleveDir:            "bleve",
			PageRankInterval:    5 * time.Minute,
			BatchSize:           100,
			BatchFlushInterval:  5 * time.Second,
			IncrementalInterval: 10 * time.Minute,
			ReplicationFactor:   3,
			AntiEntropyInterval: 2 * time.Minute,
		},
		Storage: StorageConfig{
			DataDir:   "./data/doogle",
			BadgerDir: "badger",
		},
		Search: SearchConfig{
			MaxResults:      50,
			DefaultPageSize: 10,
			PeerTimeout:     5 * time.Second,
			MaxPeers:        10,
			CacheSize:       1000,
			CacheTTL:        5 * time.Minute,
		},
		Fleet: FleetConfig{
			Role:              "coordinator",
			HeartbeatInterval: 15 * time.Second,
			NodeTimeout:       60 * time.Second,
		},
	}
}

// LoadConfig loads config from a YAML file, then applies CLI flag overrides.
func LoadConfig(configPath string) (*Config, error) {
	cfg := DefaultConfig()

	if configPath != "" {
		data, err := os.ReadFile(configPath)
		if err != nil {
			return nil, fmt.Errorf("read config: %w", err)
		}
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("parse config: %w", err)
		}
	}

	return cfg, nil
}

// ParseFlags applies CLI flags on top of the config.
func ParseFlags(cfg *Config) {
	var (
		configFile string
		bootstrap  string
		seed       string
	)

	flag.StringVar(&configFile, "config", "", "Path to config YAML file")
	flag.StringVar(&cfg.NodeName, "name", cfg.NodeName, "Human-readable node name")
	flag.IntVar(&cfg.P2P.Port, "port", cfg.P2P.Port, "libp2p listen port")
	flag.IntVar(&cfg.API.Port, "api-port", cfg.API.Port, "HTTP API port")
	flag.StringVar(&cfg.API.Bind, "bind", cfg.API.Bind, "API server bind address (default 127.0.0.1, use 0.0.0.0 for Docker)")
	flag.StringVar(&cfg.Storage.DataDir, "data-dir", cfg.Storage.DataDir, "Data directory")
	flag.StringVar(&bootstrap, "bootstrap", "", "Bootstrap peer multiaddr")
	flag.StringVar(&seed, "seed", "", "Seed URL(s) to crawl (comma-separated)")
	flag.IntVar(&cfg.Crawler.Workers, "workers", cfg.Crawler.Workers, "Crawler worker count")
	flag.BoolVar(&cfg.P2P.MDNS, "mdns", cfg.P2P.MDNS, "Enable mDNS discovery")
	flag.BoolVar(&cfg.P2P.DHTDiscovery, "dht-discovery", cfg.P2P.DHTDiscovery, "Enable DHT-based peer discovery via IPFS bootstrap nodes")
	flag.BoolVar(&cfg.Crawler.EnableHeadless, "headless", cfg.Crawler.EnableHeadless, "Enable headless browser rendering for JS-heavy pages")
	flag.StringVar(&cfg.LogLevel, "log-level", cfg.LogLevel, "Log level: debug, info, warn, error")
	flag.StringVar(&cfg.Fleet.Role, "fleet-role", cfg.Fleet.Role, "Fleet role: coordinator (default), worker, standalone")
	flag.StringVar(&cfg.Fleet.CoordinatorPeer, "fleet-coordinator", cfg.Fleet.CoordinatorPeer, "Coordinator multiaddr (worker mode)")
	flag.StringVar(&cfg.Fleet.FleetSecret, "fleet-secret", cfg.Fleet.FleetSecret, "Fleet secret (hex, 64 chars)")
	flag.Parse()

	// If a config file was specified, reload
	if configFile != "" {
		if loaded, err := LoadConfig(configFile); err == nil {
			*cfg = *loaded
		}
	}

	if bootstrap != "" {
		cfg.P2P.BootstrapPeers = append(cfg.P2P.BootstrapPeers, bootstrap)
	}

	if seed != "" {
		for _, s := range splitAndTrim(seed) {
			if s != "" {
				cfg.SeedURLs = append(cfg.SeedURLs, s)
			}
		}
	}
}

func splitAndTrim(s string) []string {
	var result []string
	for _, part := range splitString(s, ',') {
		trimmed := trimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func splitString(s string, sep byte) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
