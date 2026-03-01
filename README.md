<p align="center">
  <img src="web/static/img/owl.svg" width="180" alt="Doogle logo" />
</p>

<h1 align="center">Doogle</h1>

<p align="center">
  <strong>A fully decentralized peer-to-peer search engine.</strong><br>
  Every node crawls, indexes, and searches — no central servers, no tracking, no single point of failure.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/go-1.22+-00ADD8?logo=go&logoColor=white" alt="Go 1.22+" />
  <img src="https://img.shields.io/badge/libp2p-v0.38-blue" alt="libp2p" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Alpha" />
</p>

---

Doogle ships as a **single Go binary**. Run it, connect to peers, and you become part of a distributed search network. Nodes discover URLs via GossipSub, crawl web pages with a built-in crawler, index content locally using Bleve full-text search, and answer queries by fanning out to connected peers and merging results.

No PostgreSQL. No Redis. No Elasticsearch. Everything is embedded.

---

## Quick Start

### Prerequisites

- [Go 1.22+](https://go.dev/dl/)

### Build

```bash
git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
go mod tidy
make build
```

This produces `bin/doogle`.

### Run Your First Node

```bash
./bin/doogle --api-port 8080 --seed "https://example.com"
```

Open [http://localhost:8080](http://localhost:8080) — the admin dashboard and search UI are built in.

### Connect a Second Node

```bash
./bin/doogle --port 4002 --api-port 8081 \
  --bootstrap /ip4/127.0.0.1/tcp/4001/p2p/<PEER_ID> \
  --data-dir ./data/node2
```

Replace `<PEER_ID>` with the peer ID printed by node 1 at startup. Node 2 discovers URLs via GossipSub and starts crawling. Search on either node returns results from both.

---

## Features

**Search & Indexing**
- BM25 full-text search via Bleve with stemming, phrase matching, fuzzy queries
- PageRank computation on the backlink graph
- Query understanding: synonyms, `site:` filter, quoted phrases
- Distributed fan-out search across connected peers with merge + re-rank

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

**Admin Dashboard**
- Setup wizard with guided onboarding
- Network topology graph (interactive canvas)
- Crawler management with live feed, analytics, seed URLs
- Indexer stats, document browser
- 5 themes: Dracula, CRT Terminal, Modern, Light, Pride — each with animated logos and backgrounds
- Comprehensive docs, troubleshooting, and FAQ built in

**Storage**
- BadgerDB for metadata, URL queue, and backlink graph (crash-safe WAL)
- Bleve for full-text index (self-repairs on restart)
- Everything in a single `--data-dir`, survives machine sleep and power loss

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
```

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/search?q=&page=&size=` | Search the index |
| `GET` | `/api/status` | Node status, peer count, uptime |
| `POST` | `/api/crawl` | Queue a single URL `{"url": "..."}` |
| `POST` | `/api/crawl/batch` | Queue up to 200 URLs `{"urls": [...]}` |
| `GET` | `/api/admin/crawler` | Crawler stats and config |
| `GET` | `/api/admin/crawler/feed?after=N` | Live crawl event stream |
| `GET` | `/api/admin/indexer` | Indexer statistics |
| `GET` | `/api/admin/peers` | Connected peer list |
| `GET` | `/api/admin/documents?offset=&limit=` | Recently indexed documents |
| `GET` | `/api/admin/documents/{id}` | Document detail by ID |

---

## Project Structure

```
doogle-v2/
├── cmd/doogle/main.go             Entry point
├── internal/
│   ├── node/                      Orchestrator, config, identity
│   ├── p2p/                       libp2p host, DHT, GossipSub, protocols
│   ├── crawler/                   Worker pool, scheduler, rate limiter
│   ├── indexer/                   Quality scoring, dedup, PageRank, pipeline
│   ├── index/                     Bleve store, query builder, shard manager
│   ├── search/                    Local + distributed search, ranking
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

### Done
- [x] P2P networking (libp2p, DHT, mDNS, GossipSub, NAT traversal)
- [x] Crawler (worker pool, rate limiting, robots.txt, headless fallback)
- [x] Indexer (quality scoring, spam detection, deduplication, PageRank)
- [x] Local + distributed search (BM25, fan-out, re-ranking, query understanding)
- [x] HTTP API + embedded admin dashboard with setup wizard
- [x] Live crawl feed with FIFO animation
- [x] 5 themes with animated logos and backgrounds
- [x] Node naming (`--name` flag)
- [x] VPN/NAT documentation and troubleshooting

### Next
- [ ] Cross-node index shard forwarding via `/doogle/index/1.0.0`
- [ ] Consistent hash ring rebalancing on peer join/leave
- [ ] Peer reputation system
- [ ] NLP pipeline (readability, freshness, entity extraction)
- [ ] CLI query tool (`doogle search "query"`)
- [ ] Multi-platform binary releases (goreleaser)
- [ ] Browser extension for query obfuscation
- [ ] Tor integration for .onion crawling

---

## License

MIT
