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

Google indexes 5% of the web and decides what you see. Doogle's mission is to index the other 95%. Surface web, `.onion` hidden services, I2P eepsites, academic archives, government datasets — every corner of the internet that people need access to. Doogle is not a product. It is infrastructure for information freedom: censorship-resistant by design, privacy-preserving by default, and community-owned forever. Your searches never leave your machine. Your node, your index, your rules.

Ships as a **single Go binary**. Run it, connect to peers, and you become part of a distributed search network. Nodes discover URLs via GossipSub, crawl web pages with a built-in crawler, index content locally using Bleve full-text search, and answer queries by fanning out to connected peers and merging results. No PostgreSQL. No Redis. No Elasticsearch. Everything is embedded.

---

## Vision

> Google indexes 5% of the web and decides what you see. Doogle's mission is to index the other 95%. Surface web, .onion hidden services, I2P eepsites, academic archives, government datasets — every corner of the internet that people need access to.
>
> Doogle is not a product. It is infrastructure for information freedom: censorship-resistant by design, privacy-preserving by default, and community-owned forever. Your searches never leave your machine. Your node, your index, your rules.

---

## Your Role

Doogle works because different people care about different things. No sign-up, no commitment — you contribute just by being yourself.

**The Explorer** — Pick the topics that interest you in the setup wizard. Your node crawls and indexes those corners of the web. You build a specialized index just by following your curiosity.

**The Guardian** — When you spot spam, phishing, or junk in search results, flag it. Reports propagate across the network and bad actors get quarantined. The more people who flag, the cleaner the index for everyone.

**The Connector** — Keep your node running. The longer it stays online, the more peers it serves. Just leave it on and the network gets stronger.

**The Specialist** — Over time your node becomes an expert in your topics. Other nodes route queries your way when they need answers in your domain. Stale nodes get replaced by fresh ones — people who care about a topic keep that corner alive.

**The Curator** — Your browsing patterns, flags, and topic choices train the network's quality signals. Good pages rise, junk fades. You shape relevance without writing a single rule.

**The Amplifier** — You share seeds with friends, tell communities about Doogle, and help people set up their first node. Every person you bring in adds new topics and new corners of the web to the collective index.

**The Archivist** — You keep your node running for months, years. Pages that disappear from the live web still live in your index. Your node becomes a time capsule — preserving knowledge that would otherwise be lost.

**The Builder** — You see what's missing and build it. A better crawler, a new ranking signal, a browser extension. Doogle is open source — the people who use it are the same people who improve it.

These roles aren't assigned — they emerge. Some don't exist yet and will take shape as the network grows. You might invent a role we never imagined. That's the point.

---

## Quick Start

### 1. Build & Run

```bash
git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
make start                      # production build + run
```

Open [http://localhost:8080](http://localhost:8080) — the setup wizard guides you through seeding and configuration.

### 2. Connect a Second Node

```bash
./bin/doogle --port 4002 --api-port 8081 \
  --bootstrap /ip4/127.0.0.1/tcp/4001/p2p/<PEER_ID> \
  --data-dir ./data/node2
```

Replace `<PEER_ID>` with the peer ID printed by node 1 at startup. Node 2 discovers URLs via GossipSub and starts crawling. Search on either node returns results from both.

### Docker (alternative)

```bash
# Single node
docker compose up -d node1

# Full 3-node cluster
docker compose up -d
```

Three nodes on ports 8080, 8081, 8082 — auto-connected via mDNS.

### Build from Source (manual)

**Prerequisites:** [Go 1.22+](https://go.dev/dl/)

```bash
make build
./bin/doogle --seed "https://example.com"
```

---

## Features

**Search & Indexing**
- BM25 full-text search via Bleve with stemming, phrase matching, fuzzy queries
- Boolean query operators: `AND`, `OR`, `NOT` (`-term` exclusion, `python OR ruby`)
- Multi-language stemmers: 15 languages (English + DE, FR, ES, IT, PT, NL, RU, SV, DA, FI, HU, RO, TR, NO)
- PageRank computation on the backlink graph
- Search dorks: `intitle:`, `inurl:`, `intext:`, `filetype:`, `before:`/`after:`, `has:https`
- Query understanding: synonyms, `site:` filter, `lang:` filter, quoted phrases
- Snippet highlighting — matched query terms highlighted in search results
- Paginated results with prev/next navigation
- Keyboard shortcuts: `/` and `Ctrl+K`/`Cmd+K` to focus search
- LRU search result cache with TTL (configurable size and expiry)
- Distributed fan-out search across connected peers with merge + re-rank
- CLI search tool: `doogle search "query"` with JSON output and remote node support

**Crawling**
- Concurrent worker pool with per-domain rate limiting
- `robots.txt` compliance with 24h TTL cache
- Rich content extraction: title, meta, headings, OG tags, canonical URLs
- Headless browser fallback for JavaScript-heavy pages (via `go-rod`)
- Live crawl feed with real-time FIFO animation

**P2P Network**
- libp2p transport (TCP + QUIC) with Noise encryption
- Kademlia DHT for internet-wide peer routing
- mDNS for zero-config LAN discovery
- GossipSub for URL frontier broadcast
- NAT traversal via UPnP/NAT-PMP and hole punching
- Custom protocols: `/doogle/search/1.0.0`, `/doogle/crawl/1.0.0`, `/doogle/index/1.0.0`

**Indexer Pipeline**
- Quality scoring, spam detection, duplicate filtering
- Batch indexing with configurable flush interval
- Content-size and depth-based filtering

**Trust & Safety**
- Spam reporting: flag URLs as spam, malware, phishing, or low quality
- Peer reputation tracking: trust scores evolve with behavior
- Automatic quarantine: peers with too many spam reports are blocked
- Domain flagging: domains reported by multiple peers are filtered
- P2P report propagation: spam reports broadcast via GossipSub
- Gossip-level filtering: URLs from quarantined peers and flagged domains are dropped

**Web UI**
- Setup wizard with 16 topic categories across 4 groups (Knowledge, Lifestyle, Creative, Tech)
- Network topology graph (interactive canvas)
- Crawler management with live feed, analytics, seed URLs
- Indexer stats, document browser
- Keyboard shortcuts: `/` and `Ctrl+K` to focus search from anywhere
- 5 themes: Dracula, CRT Terminal, Modern, Light, Pride — each with animated logos and backgrounds
- Comprehensive docs, troubleshooting, and FAQ built in

**Storage**
- BadgerDB for metadata, URL queue, and backlink graph (crash-safe WAL)
- Bleve for full-text index (self-repairs on restart)
- Everything in a single `--data-dir`, survives machine sleep and power loss

**Coming Soon**
- `.onion` crawling via Tor SOCKS5 proxy
- I2P eepsite support via SAM bridge
- Privacy-preserving P2P (libp2p-over-Tor transport)
- Encrypted search queries (end-to-end encrypted peer queries)
- Semantic search (sentence embeddings, hybrid BM25 + vector scoring)
- Knowledge graph with entity cards
- Browser extension, mobile client

---

## Tested On

| Platform | Chip | Status |
|----------|------|--------|
| macOS Sequoia 15.x | Apple M3 (arm64) | Verified |
| macOS Sequoia 15.x | Apple M4 (arm64) | Verified |
| macOS | Intel x64 | Planned |
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
              │  │  GossipSub (URL frontier)       │  │
              │  │  NAT traversal (UPnP, holepunch)│  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── Crawler ────────────────────┐  │
              │  │  Worker pool (goroutines)       │  │
              │  │  robots.txt, rate limiting       │  │
              │  │  goquery + headless fallback     │  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── Indexer ────────────────────┐  │
              │  │  Quality + spam scoring         │  │
              │  │  Duplicate detection            │  │
              │  │  PageRank on backlink graph      │  │
              │  │  Bleve BM25 full-text            │  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── Search Engine ──────────────┐  │
              │  │  Local Bleve queries            │  │
              │  │  Fan-out to peers               │  │
              │  │  Merge + re-rank + dedup         │  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── HTTP API + Web UI ──────────┐  │
              │  │  REST API (chi router)           │  │
              │  │  Embedded SPA dashboard          │  │
              │  │  Setup wizard, live feed, graphs │  │
              │  └─────────────────────────────────┘  │
              │                                       │
              │  ┌──── Storage ────────────────────┐  │
              │  │  BadgerDB (metadata, queue, links)│ │
              │  │  Bleve (full-text index)         │  │
              │  └─────────────────────────────────┘  │
              └──────────────────────────────────────┘
```

**Data flow:** Seed URLs → GossipSub broadcast → crawl → extract content → score quality → detect duplicates → index in Bleve → search queries fan out to peers → merge, re-rank, deduplicate → return results.

---

## CLI Reference

### Node Mode

```
Usage: doogle [flags]

Flags:
  --config FILE        Path to YAML config file
  --name STRING        Human-readable node name (e.g. "Tokyo-Relay-01")
  --port N             libp2p listen port (default: 4001)
  --api-port N         HTTP API port (default: 8080)
  --data-dir PATH      Data directory (default: ./data/doogle)
  --bootstrap ADDR     Bootstrap peer multiaddr (repeatable)
  --seed URL           Seed URL(s) to crawl (comma-separated)
  --workers N          Crawler worker count (default: 4)
  --mdns               Enable mDNS LAN discovery (default: true)
  --headless           Enable headless browser rendering (default: false)
```

### Search Mode (CLI)

```
Usage: doogle search [flags] <query>

Flags:
  --api URL            API base URL (default: http://localhost:8080)
  --json               Output raw JSON instead of formatted text
  --page N             Result page, 0-indexed (default: 0)
  --size N             Results per page (default: 10)
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
make help                       # show all commands
make start                      # production build + run
make prod                       # optimized binary (stripped, trimpath)
make build                      # development build
make test                       # run all tests
make backup                     # snapshot data to timestamped archive
make restore BACKUP=<file>      # restore from backup
make status                     # check running node health
make dev-node1                  # local node 1 (port 4001/8080)
make dev-node2                  # local node 2 (port 4002/8081)
```

### Examples

```bash
# Basic single node
./bin/doogle --seed "https://example.com"

# Named node with custom ports
./bin/doogle --name "My Node" --port 5001 --api-port 9090

# Join an existing network
./bin/doogle --bootstrap /ip4/203.0.113.10/tcp/4001/p2p/12D3KooW...

# Multiple seeds
./bin/doogle --seed "https://example.com,https://golang.org,https://wikipedia.org"

# With config file
./bin/doogle --config ./configs/default.yaml

# CLI search (requires a running node)
./bin/doogle search "golang tutorial"
./bin/doogle search --json "python OR ruby"
./bin/doogle search --api http://remote:8080 "distributed systems"
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

---

## Project Structure

```
doogle-v2/
├── cmd/doogle/main.go             Entry point + CLI search subcommand
├── internal/
│   ├── node/                      Orchestrator, config, identity
│   ├── p2p/                       libp2p host, DHT, GossipSub, protocols
│   ├── crawler/                   Worker pool, scheduler, rate limiter
│   ├── indexer/                   Quality scoring, dedup, PageRank, pipeline
│   ├── index/                     Bleve store, query builder, multi-lang, shard manager
│   ├── search/                    Local + distributed search, ranking, LRU cache
│   ├── api/                       HTTP server, handlers, middleware
│   ├── store/                     BadgerDB wrapper, URL queue, link store
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
| Peer discovery | `go-libp2p-kad-dht` | Kademlia DHT for internet-wide routing |
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

p2p:
  port: 4001
  mdns: true

api:
  port: 8080
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
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, data flow, P2P protocols |
| [Running a Node](docs/running-a-node.md) | Installation, configuration, deployment |
| [API Reference](docs/api-reference.md) | HTTP endpoints, request/response formats |
| [Developer Guide](docs/developer-guide.md) | Code structure, building, testing |

The admin dashboard at `http://localhost:8080` also has built-in docs covering configuration, troubleshooting, VPN/NAT behavior, and shutdown/recovery semantics.

---

## Roadmap

### Phase 1 — Foundation ✅
- [x] P2P networking (libp2p TCP+QUIC, Kademlia DHT, mDNS, GossipSub, NAT traversal)
- [x] Crawler (workers, rate limiting, robots.txt, headless browser, live feed)
- [x] Indexer (10+ quality signals, E-E-A-T, spam, PageRank, readability, freshness)
- [x] BM25 search (synonyms, phrases, fuzzy, site: filter, distributed fan-out)
- [x] 6 P2P protocols, shard routing, replication N=3, Merkle anti-entropy
- [x] Admin dashboard (5 themes, wizard, live feed, network graph)
- [x] Docker + Compose support

### Phase 2 — Quality & Scale
- [x] Boolean query operators (`AND`, `OR`, `NOT` / `-term` exclusion)
- [x] Multi-language search (15 language stemmers via Bleve analyzers, `lang:` filter)
- [x] Search result caching (LRU with TTL invalidation, configurable size/TTL)
- [x] CLI search tool (`doogle search "query"`, `--json`, `--api`, remote node support)
- [x] Spam reporting and peer trust system (report URLs, peer reputation, auto-quarantine)
- [x] Domain flagging (multi-peer report consensus, gossip-level filtering)
- [x] Backup & restore (`doogle dump`/`doogle restore`, Makefile targets)
- [x] Production build target (`make prod` with stripped binary, `make start`)
- [ ] Horizontal index sharding (Bleve split by shard, distributed via `/doogle/index/1.0.0`)
- [ ] Hash ring rebalancing on peer join/leave
- [ ] Persistent content fingerprint dedup (BadgerDB-backed, survives restarts)
- [ ] Structured data extraction (Schema.org, JSON-LD, microdata → rich snippets)
- [ ] PDF & document indexing (PDF, DOCX, EPUB via tika/pdftotext)
- [ ] Content verification (Ed25519-signed documents for tamper detection)
- [ ] Image search by alt text, caption, surrounding context

### Phase 2.5 — Trust & Safety (next)
- [ ] Sybil resistance (proof-of-work challenge for new peers, rate-limited trust escalation)
- [ ] Consensus-based domain blocklist (N-of-M peer agreement to global-block a domain)
- [ ] Trust decay (idle peers slowly lose trust, active peers maintain or gain it)
- [ ] Reputation-weighted search (results from high-trust peers ranked higher)
- [ ] Malicious crawl defense (detect and reject poisoned index documents)
- [ ] Report audit trail (tamper-proof log of all reports with cryptographic signatures)
- [ ] Admin UI for trust dashboard (visualize peer trust, manage quarantine, review reports)
- [ ] Allowlist/denylist per node (operator-defined URL/domain overrides)

### Phase 3 — Dark Web & Privacy
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
- [ ] Semantic search (sentence embeddings via ONNX, hybrid BM25 + vector scoring)
- [ ] Knowledge graph (NER → entity graph in BadgerDB, entity cards in search results)
- [ ] ML-based ranking (learn-to-rank from local-only click signals, XGBoost/ONNX)
- [ ] Query intent classification (navigational / informational / transactional)
- [ ] Automatic summarization (extractive or local LLM via llama.cpp bindings)
- [ ] Topic clustering (group documents, surface related topics in results)
- [ ] Trend detection (crawl velocity + query frequency across network)
- [ ] Multilingual semantic search (cross-language retrieval via multilingual embeddings)

### Phase 5 — Ecosystem
- [ ] Browser extension (address bar search, optional query obfuscation via P2P)
- [ ] Mobile client (read-only, connects to remote Doogle node)
- [ ] Light nodes (~50 MB RAM, relay-only, proxy queries, optional single crawl worker)
- [ ] Incentive layer (reputation + credit for uptime/crawl contribution — not a blockchain)
- [ ] Governance (community proposals, node operator voting on network parameters)
- [ ] Plugin system (pluggable analyzers, scorers, content extractors)
- [ ] Multi-platform releases (goreleaser: Linux, macOS, Windows, amd64 + arm64)
- [ ] Public bootstrap network (maintained entry nodes for zero-config onboarding)

---

## License

MIT
