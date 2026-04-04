# Configuration

Full YAML configuration with defaults:

```yaml
node_name: ""                  # Human-readable name (or use --name flag)
log_level: "info"              # debug, info, warn, error

p2p:
  port: 7001
  mdns: true
  dht_discovery: true              # auto-discover peers via IPFS public DHT
  dht_rendezvous: "doogle/network/v2"
  dht_discovery_interval: 30s
  dht_max_peers: 50

api:
  port: 7002
  bind: "0.0.0.0"

crawler:
  workers: 4
  rate_limit: 10               # requests/min/domain
  request_timeout: 30s
  max_depth: 3
  respect_robots: true
  user_agent: "DoogleBot/2.0"
  headless: false

index:
  pagerank_interval: 5m
  batch_size: 100
  flush_interval: 5s

search:
  max_results: 50
  default_page_size: 10
  peer_timeout: 5s
  max_peers: 10
  cache_size: 1000             # LRU cache entries (0 = disabled)
  cache_ttl: 5m                # cached result TTL

storage:
  data_dir: "./data/doogle"

fleet:
  role: "coordinator"            # coordinator (default), worker, standalone
  heartbeat_interval: 15s
  node_timeout: 60s

trust:
  decay_rate: 0.005              # trust lost per hour when idle
  decay_interval: 1h
  quarantine_threshold: 0.15     # auto-quarantine below this trust score
  consensus_block_threshold: 3   # peer votes needed to globally block a domain
  pow_min_difficulty: 16         # minimum proof-of-work bits (scales with trust)
  pow_max_difficulty: 24
  rate_limit_window: 30s         # per-peer gossip rate limit window
  rate_limit_max: 100            # max messages per window per peer
  rate_limit_block: 5m           # block duration for rate limit offenders

url_filter:
  allowed_domains: []            # whitelist (empty = allow all)
  blocked_domains:               # blacklist domains
    - "example-spam.com"
  blocked_prefixes:              # blacklist URL prefixes
    - "https://malware.example/"

searxng:
  enabled: true                    # enabled by default with public instances
  url: ""                        # empty = auto (public instances), or custom URL
  timeout: 5s
  max_results: 10
  fallback_only: true            # only query SearXNG when peer results are below threshold
  threshold: 3                   # min peer results before skipping SearXNG (fallback_only mode)
  score_penalty: 0.1             # score deduction applied to SearXNG results
  categories: "general"          # SearXNG search categories
```

## CLI Flags

```
Usage: doogle [flags]

Flags:
  --config FILE        Path to YAML config file
  --name STRING        Human-readable node name (e.g. "Tokyo-Relay-01")
  --port N             libp2p listen port (default: 7001)
  --api-port N         HTTP API port (default: 7002)
  --bind ADDR          API server bind address (default: 0.0.0.0)
  --data-dir PATH      Data directory (default: ./data/doogle)
  --bootstrap ADDR     Bootstrap peer multiaddr (repeatable)
  --seed URL           Seed URL(s) to crawl (comma-separated)
  --workers N          Crawler worker count (default: 4)
  --mdns               Enable mDNS LAN discovery (default: true)
  --dht-discovery      Enable DHT peer discovery via IPFS bootstrap (default: true)
  --headless           Enable headless browser rendering (default: false)
  --light              Light node mode: search + relay only, no crawl/index (default: false)
  --log-level LEVEL    Log level: debug, info, warn, error (default: info)
  --fleet-role ROLE    Fleet mode: coordinator (default), worker, standalone
  --fleet-coordinator  Coordinator multiaddr (required for workers)
  --fleet-secret HEX   Shared fleet secret (auto-generated on coordinator)
  --searxng-url URL    SearXNG instance URL (overrides auto public instances)
```

## Search CLI

```
Usage: doogle search [flags] <query>

Flags:
  --api URL            API base URL (default: http://localhost:7002)
  --json               Output raw JSON instead of formatted text
  --page N             Result page, 0-indexed (default: 0)
  --size N             Results per page (default: 10)
```

## Version & Update

```
doogle version              # show version, commit, build date, go, os/arch
doogle version --json       # JSON output
doogle update               # self-update to latest release
doogle update --check       # check without installing
```

## Backup & Restore

```
Usage: doogle dump [flags]
  --data-dir PATH      Data directory to back up (default: ./data/doogle)
  --output FILE        Output archive path (default: doogle-backup-<timestamp>.tar.gz)

Usage: doogle restore [flags] <archive.tar.gz>
  --data-dir PATH      Data directory to restore into (default: ./data/doogle)
  --force              Overwrite existing data directory
```

Dump and restore are standalone — they operate on raw data directories and do not require a running node. Stop the node first for consistency.
