# Doogle v2

**A fully decentralized peer-to-peer search engine.** Every node crawls, indexes, and searches — no central servers, no tracking, no single point of failure.

Doogle v2 ships as a **single Go binary**. Run it, connect to peers, and you become part of a distributed search network. Nodes discover URLs via GossipSub, crawl web pages with a built-in crawler, index content locally using Bleve full-text search, and answer queries by fanning out to connected peers and merging results.

---

## Quick Start

### Prerequisites

- [Go 1.22+](https://go.dev/dl/)

### Build

```bash
git clone https://github.com/doogle/doogle-v2.git
cd doogle-v2
go mod tidy
make build
```

This produces `bin/doogle`.

### Run Your First Node

```bash
./bin/doogle --api-port 8080 --seed "https://example.com"
```

Open [http://localhost:8080](http://localhost:8080) in your browser to search.

### Connect a Second Node

In a second terminal:

```bash
./bin/doogle --port 4002 --api-port 8081 \
  --bootstrap /ip4/127.0.0.1/tcp/4001/p2p/<PEER_ID> \
  --data-dir ./data/node2
```

Replace `<PEER_ID>` with the peer ID printed by node 1 at startup. Node 2 will discover URLs from node 1 via GossipSub and start crawling. Search on either node returns results from both.

---

## How It Works

```
                ┌─────────────────────────────────┐
                │          Single Binary           │
                │                                  │
                │  ┌─── libp2p Host ────────────┐  │
                │  │  TCP + QUIC transports     │  │
                │  │  Kademlia DHT + mDNS       │  │
                │  │  GossipSub (URL frontier)  │  │
                │  └────────────────────────────┘  │
                │                                  │
                │  ┌─── Crawler ────────────────┐  │
                │  │  Worker pool (goroutines)  │  │
                │  │  robots.txt, rate limiting  │  │
                │  │  goquery HTML extraction   │  │
                │  └────────────────────────────┘  │
                │                                  │
                │  ┌─── Indexer ────────────────┐  │
                │  │  Quality + spam scoring    │  │
                │  │  Duplicate detection       │  │
                │  │  Bleve BM25 full-text      │  │
                │  └────────────────────────────┘  │
                │                                  │
                │  ┌─── Search Engine ──────────┐  │
                │  │  Local Bleve queries       │  │
                │  │  Fan-out to peers          │  │
                │  │  Merge + re-rank results   │  │
                │  └────────────────────────────┘  │
                │                                  │
                │  ┌─── HTTP API + Web UI ──────┐  │
                │  │  /api/search, /api/status  │  │
                │  │  Embedded search frontend  │  │
                │  └────────────────────────────┘  │
                │                                  │
                │  ┌─── Local Storage ──────────┐  │
                │  │  BadgerDB (metadata, queue)│  │
                │  │  Bleve (full-text index)   │  │
                │  └────────────────────────────┘  │
                └─────────────────────────────────┘
```

**Data flow:** Seed URLs are broadcast via GossipSub. Nodes crawl pages, extract content, score quality, detect spam and duplicates, then index locally. Search queries fan out to connected peers over libp2p streams, results are merged, re-ranked, and deduplicated before being returned.

No PostgreSQL. No Redis. No Elasticsearch. Everything is embedded.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, data flow, P2P protocols |
| [Running a Node](docs/running-a-node.md) | Installation, configuration, deployment |
| [API Reference](docs/api-reference.md) | HTTP endpoints, request/response formats |
| [Developer Guide](docs/developer-guide.md) | Code structure, building, testing, contributing |

---

## CLI Reference

```
Usage: doogle [flags]

Flags:
  --config FILE        Path to YAML config file
  --port N             libp2p listen port (default: 4001)
  --api-port N         HTTP API port (default: 8080)
  --data-dir PATH      Data directory (default: ./data/doogle)
  --bootstrap ADDR     Bootstrap peer multiaddr
  --seed URL           Seed URL(s) to crawl (comma-separated)
  --workers N          Crawler worker count (default: 4)
  --mdns               Enable mDNS LAN discovery (default: true)
```

### Examples

```bash
# Basic single node
./bin/doogle --seed "https://example.com"

# Custom ports
./bin/doogle --port 5001 --api-port 9090

# Join an existing network
./bin/doogle --bootstrap /ip4/203.0.113.10/tcp/4001/p2p/12D3KooW...

# Multiple seeds
./bin/doogle --seed "https://example.com,https://golang.org,https://wikipedia.org"

# With config file
./bin/doogle --config ./configs/default.yaml
```

---

## Project Structure

```
doogle-v2/
├── cmd/doogle/main.go          # Binary entry point
├── internal/
│   ├── node/                   # Orchestrator, config, identity
│   ├── p2p/                    # libp2p host, DHT, GossipSub, protocols
│   ├── crawler/                # Worker pool, scheduler, rate limiter
│   ├── indexer/                # Quality scoring, dedup, indexing pipeline
│   ├── index/                  # Bleve store, shard manager
│   ├── search/                 # Local + distributed search, ranking
│   ├── api/                    # HTTP server, handlers, middleware
│   ├── store/                  # BadgerDB wrapper, URL queue
│   └── models/                 # Document, CrawlTask, SearchResult
├── pkg/
│   ├── consistent/             # Consistent hash ring
│   └── urlutil/                # URL normalization utilities
├── web/static/                 # Embedded search UI
├── configs/default.yaml        # Default configuration
├── docs/                       # Documentation
├── Makefile                    # Build targets
└── go.mod                      # Dependencies
```

---

## Tech Stack

| Component | Library | Purpose |
|-----------|---------|---------|
| P2P networking | `go-libp2p` v0.38 | TCP+QUIC transports, Noise encryption, NAT traversal |
| Peer discovery | `go-libp2p-kad-dht` | Kademlia DHT for finding peers |
| URL broadcast | `go-libp2p-pubsub` | GossipSub for URL frontier |
| Full-text search | `bleve/v2` | Embedded BM25 index with stemming |
| Metadata storage | `badger/v4` | Embedded KV store, SSD-optimized |
| HTML parsing | `goquery` | Content and link extraction |
| HTTP routing | `chi/v5` | Lightweight, idiomatic Go router |
| Serialization | JSON over libp2p streams | P2P message format |

---

## Roadmap

### Phase 1 — MVP (current)
- [x] P2P networking (libp2p, DHT, mDNS, GossipSub)
- [x] Crawler (worker pool, rate limiting, robots.txt)
- [x] Indexer (quality scoring, spam detection, deduplication)
- [x] Local + distributed search (BM25, fan-out, re-ranking)
- [x] HTTP API + embedded web UI

### Phase 2 — Quality & Sharding
- [ ] Cross-node index shard forwarding via `/doogle/index/1.0.0`
- [ ] Consistent hash ring rebalancing on peer join/leave
- [ ] Full E-E-A-T scoring pipeline (ported from v1)
- [ ] NAT traversal (AutoNAT, relay)

### Phase 3 — Advanced Features
- [ ] NLP pipeline (readability, freshness, entity extraction)
- [ ] Peer reputation system
- [ ] Tor integration for .onion crawling
- [ ] CLI query tool (`doogle search "query"`)

### Phase 4 — Ecosystem
- [ ] Browser extension for query obfuscation (David's noise injection idea)
- [ ] Incentive layer for node operators
- [ ] Multi-platform binary releases (goreleaser)
- [ ] Advanced query syntax (filters, operators)

---

## License

MIT
