<p align="center">
  <img src="web/static/img/owl.svg" width="180" alt="Doogle logo" />
</p>

<h1 align="center">Doogle</h1>

<p align="center">
  <strong>The search engine for the entire web — surface, deep, and dark.</strong><br>
  Open source. Zero tracking. Censorship-resistant. Every corner of the internet, indexed by the people.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/go-1.22+-00ADD8?logo=go&logoColor=white" alt="Go 1.22+" />
  <img src="https://img.shields.io/badge/libp2p-v0.38-blue" alt="libp2p" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Alpha" />
</p>

---

Single Go binary. Run it, connect to peers, become part of a distributed search network. Nodes discover URLs via GossipSub, crawl pages, index locally with Bleve, and answer queries by fanning out to peers and merging results. No external databases — everything is embedded.

---

## Quick Start

### Install (binary)

```bash
GITHUB_TOKEN=ghp_... sh install.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for token setup and detailed instructions.

### Build from source

```bash
git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
make setup                      # checks/installs Go, Docker, all prereqs
make run                        # build + launch node
```

Open [http://localhost:7002](http://localhost:7002) — the setup wizard guides you through seeding and configuration.

### Connect a second node

Nodes find each other **automatically** via the IPFS public DHT — no manual bootstrap needed:

```bash
./bin/doogle --port 7003 --api-port 7004 --data-dir ./data/node2
```

Both nodes advertise on the DHT under a shared rendezvous namespace and discover each other within 30–60 seconds. Search on either node returns results from both.

**Manual bootstrap** (optional, for faster or private connections):

```bash
./bin/doogle --port 7003 --api-port 7004 \
  --bootstrap /ip4/127.0.0.1/tcp/7001/p2p/<PEER_ID> \
  --data-dir ./data/node2
```

Replace `<PEER_ID>` with the peer ID printed by node 1 at startup.

### Docker (alternative)

```bash
# Single node
docker compose up -d node1

# Full 3-node cluster
docker compose up -d
```

Three nodes on ports 7002, 7004, 7006 — auto-connected via mDNS.

---

## Features

**Search & Indexing**
- BM25 full-text search via Bleve with stemming, phrase matching, fuzzy queries
- Hybrid search: BM25 + TF-IDF vector similarity via Reciprocal Rank Fusion (RRF)
- Boolean query operators: `AND`, `OR`, `NOT` (`-term` exclusion, `python OR ruby`)
- Multi-language stemmers: 15 languages (English + DE, FR, ES, IT, PT, NL, RU, SV, DA, FI, HU, RO, TR, NO)
- PageRank computation on the backlink graph
- Domain authority scoring (aggregated PageRank, quality, backlink domains per site)
- Query intent classification (navigational, informational, transactional, local) with ranking adjustments
- Spelling correction ("Did you mean?") with dictionary from index term frequencies
- Synonym expansion (100+ bidirectional pairs, acronyms, compound splitting)
- Domain diversity: max 2 results per domain in top 10 to prevent monopolization
- Passage-based snippets with term highlight positions for `<mark>` rendering
- Search dorks: `intitle:`, `inurl:`, `intext:`, `filetype:`, `before:`/`after:`, `has:https`
- Query understanding: `site:` filter, `lang:` filter, quoted phrases
- URL quality signals (path depth, readability, tracking param detection)
- Graduated freshness scoring with configurable half-lives (time-sensitive vs evergreen)
- Readability-style main content extraction (Arc90 algorithm) for cleaner indexing
- 12-signal ranking: E-E-A-T, Quality, PageRank, Domain Authority, URL Quality, Readability, Citation, Link, SEO, Author Credibility, Relevance, Freshness
- Knowledge graph entity cards in search results (NER-extracted entities with related topics)
- Paginated results with prev/next navigation
- Keyboard shortcuts: `/` and `Ctrl+K`/`Cmd+K` to focus search
- LRU search result cache with TTL (configurable size and expiry)
- Distributed fan-out search across connected peers with merge + re-rank
- CLI search tool: `doogle search "query"` with JSON output and remote node support

**Crawling**
- Concurrent worker pool with per-domain rate limiting
- Domain-aware crawl coordination: shard ring assigns each domain to an owner node — non-owners forward tasks automatically via `/doogle/crawl/1.0.0`, with fallback to local crawl if the owner is offline
- `robots.txt` compliance with 24h TTL cache
- Rich content extraction: title, meta, headings, OG tags, canonical URLs
- Schema.org structured data extraction (JSON-LD `<script>` blocks + microdata `[itemscope]`/`[itemprop]`)
- Image context enrichment: alt text, figcaption, width/height, surrounding content
- PDF & document indexing: binary text extraction for PDF, plain text, CSV, markdown, XML
- Headless browser fallback for JavaScript-heavy pages (via `go-rod`)
- Live crawl feed with real-time FIFO animation

**P2P Network**
- libp2p transport (TCP + QUIC) with Noise encryption
- Kademlia DHT for internet-wide peer routing
- Automatic peer discovery via IPFS public DHT — zero config, no manual bootstrap needed
- mDNS for zero-config LAN discovery
- GossipSub for URL frontier broadcast — peers check domain ownership before crawling, forwarding non-owned URLs to the responsible node
- NAT traversal via UPnP/NAT-PMP and hole punching
- Custom protocols: `/doogle/search/1.0.0`, `/doogle/crawl/1.0.0`, `/doogle/index/1.0.0`, `/doogle/replicate/1.0.0`, `/doogle/antientropy/1.0.0`, `/doogle/fleet/heartbeat/1.0.0`, `/doogle/fleet/proxy/1.0.0`

**Indexer Pipeline**
- Quality scoring (12 weighted signals), spam detection, duplicate filtering
- Persistent content fingerprint dedup (BadgerDB-backed, survives restarts, Jaccard similarity)
- Domain authority computation (site-level reputation from PageRank, quality, backlinks)
- URL quality scoring (path depth, query params, slug readability, tracking detection)
- Readability-style main content extraction for cleaner body text
- Structured data extraction (Schema.org JSON-LD + microdata → type classification)
- Named entity extraction (pattern-based NER → knowledge graph in BadgerDB)
- Extractive summarization (TextRank-inspired sentence ranking)
- TF-IDF document embeddings (384-dim feature hashing, pure Go)
- Content verification (Ed25519 document signing for tamper detection)
- Horizontal index sharding (domain-based FNV hash splitting across local Bleve shards)
- Hash ring rebalancing (background topology change detection, automatic document transfer)
- Batch indexing with configurable flush interval
- Content-size and depth-based filtering

**Intelligence**
- Knowledge graph: NER-extracted entities with co-occurrence relationships, entity cards in search
- Trend detection: hourly-bucketed crawl/query counters, velocity-based spike detection
- Click tracking: records query/URL/position for future learn-to-rank
- Topic clustering: document grouping by topic with keyword labels
- Vector search: BadgerDB-backed embedding store with brute-force cosine similarity

**Trust & Safety**
- Spam reporting: flag URLs as spam, malware, phishing, or low quality
- Peer reputation tracking: trust scores evolve with behavior (good docs boost, spam docs penalize)
- Trust decay: idle peers slowly lose reputation; active peers maintain or gain trust
- Automatic quarantine: peers with trust below threshold are blocked from search and gossip
- Domain flagging: domains reported by multiple peers are filtered
- Consensus-based domain blocklist: N-of-M peer agreement to globally block a domain
- Sybil resistance: hashcash proof-of-work on URL announcements (difficulty scales with trust)
- Malicious crawl defense: per-peer gossip rate limiting with automatic blocking
- Report audit trail: Ed25519-signed, hash-chained tamper-proof log of all spam reports
- Reputation-weighted search: results from high-trust peers ranked higher, low-trust penalized
- Operator allowlist/denylist: per-node domain and URL prefix filtering (YAML config)
- P2P report propagation: spam reports broadcast via GossipSub
- Gossip-level filtering: URLs from quarantined peers and flagged domains are dropped

**Web UI**
- Setup wizard with 16 topic categories across 4 groups (Knowledge, Lifestyle, Creative, Tech)
- Network topology graph (interactive canvas)
- Crawler management with live feed, analytics, seed URLs
- Indexer stats, document browser
- Keyboard shortcuts: `/` and `Ctrl+K` to focus search from anywhere
- 6 themes: Dracula, CRT Terminal, Modern, Light, Pride, Storm — each with animated logos and backgrounds
- Update notification banner on Node Overview with "Update Now" button (auto-checks GitHub releases, localhost-only)
- Comprehensive docs, troubleshooting, and FAQ built in

**Storage**
- BadgerDB for metadata, URL queue, and backlink graph (crash-safe WAL)
- Bleve for full-text index (self-repairs on restart)
- Everything in a single `--data-dir`, survives machine sleep and power loss

**Fleet Management**
- Coordinator/worker architecture for managing multiple nodes from a single dashboard
- Secure proxy tunnel: coordinator tunnels into worker admin APIs over encrypted libp2p streams
- Workers never expose HTTP ports to the network — only reachable via the coordinator
- 5-layer security: HMAC-SHA256 fleet secret, derived API bearer token, libp2p Noise encryption, peer ID verification, localhost binding
- Heartbeat monitoring with automatic staleness detection (online → stale → offline)
- Fleet dashboard in admin UI with token-gated access

---

## Fleet Management

Every Doogle node is **fleet-ready by default** — it runs as a coordinator out of the box with zero extra config. If you never add workers, it behaves exactly like a normal standalone node with no overhead. When you're ready to scale, just point workers at it.

**Why?** If you're running multiple nodes across different servers, you don't want to SSH into each one to check status. Your node's built-in fleet dashboard shows all workers, their stats, and lets you access each worker's full admin UI through a secure tunnel.

**How it works:** Your node acts as a secure reverse proxy into each worker's local API. Workers bind their HTTP port to `127.0.0.1` (not reachable from the network). The only way to reach a worker remotely is through the coordinator's encrypted libp2p tunnel. All communication is signed with a shared fleet secret using HMAC-SHA256.

### Adding Workers

```bash
# 1. Start your node (fleet secret is in the logs + data/fleet.secret)
make run

# 2. On another machine, start a worker (use the secret from step 1)
make run ARGS='--fleet-role worker --fleet-coordinator /ip4/<YOUR_IP>/tcp/7001/p2p/<PEER_ID> --fleet-secret <hex> --port 7003 --api-port 7004 --data-dir ./data/worker1'

# 3. Open your node's UI → Admin → Actions → Fleet section for credentials
#    Or Admin → Fleet for the live worker dashboard
```

### CLI Flags

| Flag | Description |
|------|-------------|
| `--fleet-role` | `coordinator` (default), `worker`, or `standalone` (disables fleet) |
| `--fleet-coordinator` | Coordinator multiaddr (required for workers) |
| `--fleet-secret` | Shared secret hex (auto-generated if omitted) |

### Security

| Layer | Protection |
|-------|-----------|
| Fleet Secret | 256-bit HMAC-SHA256 signs all fleet messages |
| API Token | Derived bearer token required on all `/api/fleet/*` endpoints |
| Localhost Token | Fleet API token is only returned to localhost requests — never exposed over the network |
| Transport | End-to-end encrypted libp2p streams (Noise/TLS) |
| Identity | Coordinator and workers verify each other's peer IDs |
| Binding | Workers auto-bind API to `127.0.0.1` in fleet mode |
| Backup Safety | `fleet.secret` is excluded from `/api/admin/dump` backups |

---

## Tested On

| Platform | Chip | Status |
|----------|------|--------|
| macOS Sequoia 15.x | Apple M3 (arm64) | Verified |
| macOS Sequoia 15.x | Apple M4 (arm64) | Verified |
| macOS | Intel x64 | Verified |
| Linux (Ubuntu/Debian) | x64 / arm64 | Planned |
| Windows 10/11 | x64 | Planned |

---

## Architecture

```
              ┌──────────────────────────────────────┐
              │           Single Go Binary            │
              │                                       │
              │  ┌──── libp2p Host ────────────────┐  │
              │  │  TCP + QUIC transports          │  │
              │  │  Kademlia DHT + mDNS            │  │
              │  │  IPFS DHT auto-discovery        │  │
              │  │  GossipSub (URL frontier)       │  │
              │  │  NAT traversal (UPnP, holepunch)│  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── Crawler ────────────────────┐  │
              │  │  Worker pool (goroutines)       │  │
              │  │  robots.txt, rate limiting       │  │
              │  │  goquery + headless fallback     │  │
              │  │  Schema.org + PDF extraction     │  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── Indexer ────────────────────┐  │
              │  │  12-signal quality scoring       │  │
              │  │  Domain authority + URL quality  │  │
              │  │  Persistent dedup (BadgerDB)    │  │
              │  │  PageRank on backlink graph      │  │
              │  │  Content verification (Ed25519) │  │
              │  │  Horizontal sharding + rebalance│  │
              │  │  Bleve BM25 full-text            │  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── Search Engine ──────────────┐  │
              │  │  Intent classification          │  │
              │  │  Synonym expansion + spelling    │  │
              │  │  Local Bleve + fan-out to peers  │  │
              │  │  Re-rank + diversity + dedup     │  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── HTTP API + Web UI ──────────┐  │
              │  │  REST API (chi router)           │  │
              │  │  Embedded SPA dashboard          │  │
              │  │  Setup wizard, live feed, graphs │  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── Trust & Safety ────────────┐  │
              │  │  Peer trust scores + decay      │  │
              │  │  PoW Sybil resistance           │  │
              │  │  Rate limiting + audit trail     │  │
              │  │  Consensus domain blocklist     │  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── Storage ────────────────────┐  │
              │  │  BadgerDB (metadata, queue, links)│ │
              │  │  Bleve (full-text index)         │  │
              │  └─────────────────────────────────┘  │
              └──────────────────────────────────────┘
```

**Data flow:** Seed URLs → domain ownership check (shard ring) → own domain? crawl locally / not owned? forward to owner via `/doogle/crawl/1.0.0` → GossipSub broadcast discovered URLs → Readability content extraction → quality scoring (12 signals) → domain authority → URL quality → detect duplicates → index in Bleve (title 5x, URL 3x, headings 2x, desc 1.5x) → replicate to shard owners → search queries: parse → classify intent → expand synonyms → BM25 match → fan out to peers → merge → intent-aware re-rank → domain diversity → spelling suggestion → return results.

---

## CLI Reference

### Node Mode

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
  --log-level LEVEL    Log level: debug, info, warn, error (default: info)
  --fleet-role ROLE    Fleet mode: coordinator (default), worker, standalone
  --fleet-coordinator  Coordinator multiaddr (required for workers)
  --fleet-secret HEX   Shared fleet secret (auto-generated on coordinator)
```

### Search Mode (CLI)

```
Usage: doogle search [flags] <query>

Flags:
  --api URL            API base URL (default: http://localhost:7002)
  --json               Output raw JSON instead of formatted text
  --page N             Result page, 0-indexed (default: 0)
  --size N             Results per page (default: 10)
```

### Version & Update

```
doogle version              # show version, commit, build date, go, os/arch
doogle version --json       # JSON output
doogle update               # self-update to latest release
doogle update --check       # check without installing
```

### Backup & Restore

```
Usage: doogle dump [flags]
  --data-dir PATH      Data directory to back up (default: ./data/doogle)
  --output FILE        Output archive path (default: doogle-backup-<timestamp>.tar.gz)

Usage: doogle restore [flags] <archive.tar.gz>
  --data-dir PATH      Data directory to restore into (default: ./data/doogle)
  --force              Overwrite existing data directory
```

Dump and restore are **standalone** — they operate on raw data directories and do not require a running node. Stop the node first for consistency.

### Makefile Reference

```bash
make setup                      # install Go, Docker checks, all prerequisites
make build                      # compile binary to bin/
make run                        # build + stop old process + launch node detached
make run ARGS='--seed ...'      # pass extra flags
make upgrade                    # pull latest + rebuild + restart
make stop                       # gracefully stop running node (SIGTERM, 15s timeout)
make status                     # check if the node is running
make test                       # run all tests
make dev                        # Docker foreground on :7002 (Ctrl+C to stop)
make clean                      # remove build artifacts (bin/, dist/, logs, pid)
make nuke                       # full reset: clean + delete crawl data + Go runtime
make release                    # cross-compile for all platforms to dist/
make checksums                  # generate SHA-256 checksums
make patch                      # tag + release: v0.1.0 → v0.1.1
make minor                      # tag + release: v0.1.0 → v0.2.0
make major                      # tag + release: v0.1.0 → v1.0.0
```

### Examples

```bash
# Basic single node
./bin/doogle --seed "https://example.com"

# Named node with custom ports
./bin/doogle --name "My Node" --port 5001 --api-port 9090

# Join an existing network
./bin/doogle --bootstrap /ip4/203.0.113.10/tcp/7001/p2p/12D3KooW...

# Multiple seeds
./bin/doogle --seed "https://example.com,https://golang.org,https://wikipedia.org"

# With config file
./bin/doogle --config ./configs/default.yaml

# CLI search (requires a running node)
./bin/doogle search "golang tutorial"
./bin/doogle search --json "python OR ruby"
./bin/doogle search --api http://remote:7002 "distributed systems"
./bin/doogle search "golang -tutorial"           # exclude "tutorial"
./bin/doogle search "python OR ruby"             # OR operator
./bin/doogle search '"machine learning" basics'  # quoted phrase

# Backup and restore
./bin/doogle dump --output my-backup.tar.gz
./bin/doogle restore --force my-backup.tar.gz
```

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/search?q=&page=&size=` | Search the index |
| `GET` | `/api/status` | Node status, peer count, uptime |
| `POST` | `/api/crawl` | Queue a single URL `{"url": "..."}` |
| `POST` | `/api/crawl/batch` | Queue up to 200 URLs `{"urls": [...]}` |
| `POST` | `/api/report` | Report spam/malware `{"url": "...", "reason": "spam"}` |
| `GET` | `/api/admin/crawler` | Crawler stats and config |
| `GET` | `/api/admin/crawler/feed?after=N` | Live crawl event stream |
| `GET` | `/api/admin/indexer` | Indexer statistics |
| `GET` | `/api/admin/peers` | Connected peer list |
| `GET` | `/api/admin/documents?offset=&limit=` | Recently indexed documents |
| `GET` | `/api/admin/documents/{id}` | Document detail by ID |
| `GET` | `/api/admin/trust` | Trust system: reports, quarantined peers, flagged domains |
| `GET` | `/api/admin/storage` | Disk usage stats (Bleve, BadgerDB, free space) |
| `GET` | `/api/trends` | Trending queries and domains (velocity-based) |
| `POST` | `/api/click` | Record search result click `{"query", "url", "position"}` |
| `GET` | `/api/admin/leaderboard` | Peer contribution rankings |
| `GET` | `/api/admin/domains` | Domain ownership map (shard assignments, local vs remote) |
| `GET` | `/api/admin/profile` | Master profile data |
| `GET` | `/api/admin/update-check` | Check for new release (localhost-only) |
| `POST` | `/api/admin/update` | Download and apply update (localhost-only) |
| `GET` | `/api/fleet/nodes` | Fleet summary and worker list (bearer token required) |
| `GET` | `/api/fleet/nodes/{peerID}` | Single worker detail |
| `ANY` | `/api/fleet/nodes/{peerID}/proxy/*` | Proxy request to worker's local API |

---

## Project Structure

```
doogle-v2/
├── cmd/doogle/main.go             Entry point + CLI search subcommand
├── internal/
│   ├── node/                      Orchestrator, config, identity, rate limiter, audit trail, URL filter
│   ├── p2p/                       libp2p host, DHT, GossipSub, protocols, proof-of-work
│   ├── crawler/                   Worker pool, scheduler, rate limiter, structured data, PDF extraction
│   ├── indexer/                   Quality scoring, dedup, PageRank, domain authority, content verification, NER, summarization
│   ├── index/                     Bleve store, query builder, multi-lang, shard manager, horizontal sharding, embedder, vector store, hybrid search
│   ├── search/                    Local + distributed search, ranking, intent, spelling, diversity, snippets, entity cards
│   ├── fleet/                     Coordinator, worker, HMAC auth, fleet models
│   ├── api/                       HTTP server, handlers, middleware
│   ├── updater/                   Shared GitHub release/update logic
│   ├── store/                     BadgerDB wrapper, URL queue, link store, trust store, fleet store, entity store, trend store, click store, cluster store
│   └── models/                    Document, CrawlTask, SearchResult, CrawlEvent
├── pkg/
│   ├── consistent/                Consistent hash ring
│   └── urlutil/                   URL normalization
├── web/static/                    Embedded SPA (JS, CSS, themes, logo)
├── configs/default.yaml           Default configuration
├── docs/                          Architecture, API, developer guide
├── Makefile                       Build targets
└── go.mod
```

---

## Tech Stack

| Component | Library | Purpose |
|-----------|---------|---------|
| P2P networking | `go-libp2p` v0.38 | TCP + QUIC, Noise encryption, NAT traversal |
| Peer discovery | `go-libp2p-kad-dht` | Kademlia DHT + IPFS routing discovery for automatic peer finding |
| URL broadcast | `go-libp2p-pubsub` | GossipSub for URL frontier |
| Full-text search | `bleve/v2` | BM25 index with stemming and fuzzy matching |
| Metadata storage | `badger/v4` | Embedded KV store, SSD-optimized, crash-safe WAL |
| HTML parsing | `goquery` | Content and link extraction |
| Headless browser | `go-rod` | JS rendering fallback for SPAs |
| HTTP routing | `chi/v5` | Lightweight Go router |
| Config | `yaml.v3` | YAML config parsing |

---

## Configuration

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
```

---

## Roadmap

### Phase 1 — Foundation ✅
- [x] P2P networking (libp2p TCP+QUIC, Kademlia DHT, IPFS DHT discovery, mDNS, GossipSub, NAT traversal)
- [x] Crawler (workers, rate limiting, robots.txt, headless browser, live feed)
- [x] Indexer (10+ quality signals, E-E-A-T, spam, PageRank, readability, freshness)
- [x] BM25 search (phrases, fuzzy, site: filter, distributed fan-out)
- [x] 6 P2P protocols, shard routing, replication N=3, Merkle anti-entropy
- [x] Admin dashboard (6 themes, wizard, live feed, network graph)
- [x] Docker + Compose support

### Phase 2 — Quality & Scale
- [x] Boolean query operators (`AND`, `OR`, `NOT` / `-term` exclusion)
- [x] Multi-language search (15 language stemmers via Bleve analyzers, `lang:` filter)
- [x] Search result caching (LRU with TTL invalidation, configurable size/TTL)
- [x] CLI search tool (`doogle search "query"`, `--json`, `--api`, remote node support)
- [x] Spam reporting and peer trust system (report URLs, peer reputation, auto-quarantine)
- [x] Domain flagging (multi-peer report consensus, gossip-level filtering)
- [x] Backup & restore (`doogle dump`/`doogle restore`, Makefile targets)
- [x] Production build target (`make build` with stripped binary, `make run`)
- [x] Fleet management (coordinator/worker, secure proxy tunnel, HMAC auth, fleet dashboard)
- [x] Domain-aware crawl coordination (shard ring gates crawl decisions, auto-forwarding to owners, fallback to local)
- [x] Horizontal index sharding (domain-based FNV hash splitting across local Bleve shards)
- [x] Hash ring rebalancing on peer join/leave (background topology change detection, document transfer)
- [x] Persistent content fingerprint dedup (BadgerDB-backed, survives restarts)
- [x] Structured data extraction (Schema.org JSON-LD + microdata → rich snippets)
- [x] PDF & document indexing (PDF binary text extraction, plain text, CSV, markdown, XML)
- [x] Content verification (Ed25519-signed documents for tamper detection)
- [x] Image search by alt text, caption, figcaption, surrounding context

### Phase 2.5 — Trust & Safety ✅
- [x] Sybil resistance (hashcash proof-of-work on URL announcements, difficulty scales with trust)
- [x] Consensus-based domain blocklist (N-of-M peer agreement to global-block a domain)
- [x] Trust decay (idle peers lose 0.005/hour, active peers maintain or gain trust)
- [x] Reputation-weighted search (trust [0,1] maps to ranking multiplier [0.85, 1.15])
- [x] Malicious crawl defense (per-peer gossip rate limiting with automatic blocking)
- [x] Report audit trail (Ed25519-signed, hash-chained tamper-proof log of all reports)
- [x] Admin UI for trust dashboard (visualize peer trust, manage quarantine, review reports)
- [x] Allowlist/denylist per node (operator-defined URL/domain prefix filtering via YAML)

### Phase 3 — Dark Web & Privacy ⏸️ (on hold — pending legal review)
- [ ] SOCKS5 proxy support in crawler (configurable per-transport)
- [ ] Tor integration (bundled/sidecar daemon, automatic SOCKS5 routing for .onion)
- [ ] .onion crawling (frontier accepts .onion URLs, Tor-routed fetches, per-hidden-service rate limiting)
- [ ] I2P support (SAM bridge for .i2p eepsite crawling)
- [ ] Privacy-preserving P2P (optional libp2p-over-Tor transport, peers never expose IPs)
- [ ] Encrypted search queries (end-to-end encrypted peer queries, relays can't read them)
- [ ] .onion seed directories (ahmia.fi, Haystak, Torch as built-in wizard seed categories)
- [ ] Content safety layer (CSAM hash matching, configurable blocklists, on by default)
- [ ] Network source tagging (clearnet/tor/i2p label on every doc, filterable in search UI)
- [ ] Tor circuit management (connection pooling, circuit rotation, bandwidth-aware scheduling)

### Phase 4 — Intelligence
- [x] Query intent classification (navigational, informational, transactional, local) with ranking adjustments
- [x] Spelling correction ("Did you mean?") via index term dictionary + Damerau-Levenshtein
- [x] Synonym expansion (100+ bidirectional pairs, acronyms, compound words)
- [x] Domain diversity (max 2 per domain in top 10, demote excess)
- [x] Passage-based snippets with term highlight positions
- [x] Domain authority scoring (aggregated site-level reputation signal)
- [x] URL quality signals (path depth, readability, tracking params)
- [x] Readability-style content extraction (Arc90 algorithm, boilerplate removal)
- [x] Graduated freshness scoring (time-sensitive vs evergreen half-lives)
- [x] 12-signal ranking model (E-E-A-T, Quality, PageRank, Domain Authority, URL Quality, Readability, Citation, Link, SEO, Author Credibility, Relevance, Freshness)
- [x] Semantic search (TF-IDF 384-dim embeddings, hybrid BM25 + vector RRF scoring)
- [x] Knowledge graph (NER → entity graph in BadgerDB, entity cards in search results)
- [x] Click tracking for learn-to-rank (local-only click signals: query, URL, position)
- [x] Automatic summarization (extractive TextRank-inspired sentence ranking)
- [x] Topic clustering (document grouping with keyword labels, related topics in results)
- [x] Trend detection (hourly-bucketed crawl velocity + query frequency, spike detection)
- [x] ML-based ranking (gradient-boosted decision stumps, pairwise RankNet loss, auto-trains from click data every 6h)
- [ ] Multilingual semantic search (cross-language retrieval via multilingual embeddings)

### Phase 5 — Ecosystem
- [ ] Browser extension (address bar search, optional query obfuscation via P2P)
- [ ] Mobile client (read-only, connects to remote Doogle node)
- [ ] Light nodes (~50 MB RAM, relay-only, proxy queries, optional single crawl worker)
- [ ] Incentive layer (reputation + credit for uptime/crawl contribution — not a blockchain)
- [ ] Governance (community proposals, node operator voting on network parameters)
- [ ] Plugin system (pluggable analyzers, scorers, content extractors)
- [ ] Multi-platform releases (goreleaser: Linux, macOS, Windows, amd64 + arm64)
- [x] Automatic peer discovery via IPFS public DHT (zero-config onboarding)
- [ ] Public bootstrap network (maintained Doogle-specific entry nodes)

---

## License

MIT
