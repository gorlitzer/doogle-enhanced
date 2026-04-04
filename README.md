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

## Quick Start

```bash
git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
make setup    # checks/installs Go, Docker, all prereqs
make run      # build + launch node
```

Open [http://localhost:7002](http://localhost:7002) — the setup wizard guides you through seeding and configuration.

### Connect a second node

Nodes find each other **automatically** via the IPFS public DHT — no manual bootstrap needed:

```bash
./bin/doogle --port 7003 --api-port 7004 --data-dir ./data/node2
```

### Docker

```bash
docker compose up -d          # single node
docker compose up -d node1 node2 node3   # 3-node cluster
```

## Project Status

> **Alpha** — core features work, needs community testing at scale.

**Production-ready:** P2P networking, crawler (robots.txt, headless JS, rate limiting), full-text search (BM25, phrases, fuzzy, boolean, filters), 12-stage indexer pipeline, trust & safety (peer reputation, Sybil PoW, consensus blocklist), admin dashboard, fleet management, backup & restore, Docker.

**WIP / needs testing:**
- Search quality at scale — 14+ ranking signals and 28-feature LTR model, but no large-scale relevance benchmarks yet
- Neural/semantic search — hybrid BM25+vector works via TF-IDF embeddings, no neural encoder yet
- LTR model — trains automatically after 200+ click pairs, untested in production
- Click models — CTR/dwell/pogo signals collected but not fully integrated into ranking
- Result diversity — domain cap only, no MMR or subtopic diversification
- Large-scale P2P — needs stress testing with 50+ peers

**Planned:** Browser extension, mobile client, incentive layer, governance, plugin system. See [full roadmap](docs/roadmap.md).

## Features

| Area | Highlights |
|------|-----------|
| **Search** | BM25 + vector hybrid (RRF), 28-feature LTR, intent classification, spelling correction, synonym expansion, search dorks (`site:`, `lang:`, `intitle:`, `filetype:`, etc.), domain diversity, passage snippets |
| **Crawling** | Concurrent workers, per-domain rate limiting, robots.txt + sitemaps, headless JS rendering, Schema.org extraction, PDF/CSV/markdown, Core Web Vitals, mobile-friendliness, priority re-crawl |
| **P2P** | libp2p (TCP+QUIC), Kademlia DHT, IPFS auto-discovery, GossipSub, 7 custom protocols, shard routing, replication N=3, NAT traversal, light node mode |
| **Indexer** | 12-signal quality scoring, PageRank, domain authority, spam detection, content dedup, Ed25519 verification, horizontal sharding, batch indexing |
| **Intelligence** | Knowledge graph (NER), trend detection, click-through tracking, topic clustering, extractive summarization, multilingual semantic search (9 languages) |
| **Trust** | Peer reputation, Sybil PoW, consensus domain blocklist, trust decay, audit trail, gossip-level filtering, operator allowlist/denylist |
| **UI** | Setup wizard, 6 themes, network topology graph, live crawl feed, fleet dashboard, roadmap page, keyboard shortcuts |
| **Fleet** | Coordinator/worker, secure proxy tunnel, HMAC auth, worker dashboard. [Details](docs/fleet.md) |

## Architecture

```
          ┌───────────────────────────────────────┐
          │          Single Go Binary              │
          │                                        │
          │  libp2p Host (TCP+QUIC, DHT, GossipSub)│
          │          ↕                              │
          │  Crawler → Indexer → Bleve (BM25)       │
          │          ↕                              │
          │  Search Engine (LTR + fan-out to peers) │
          │          ↕                              │
          │  HTTP API + Embedded Web UI             │
          │          ↕                              │
          │  Trust & Safety / Fleet Management      │
          │          ↕                              │
          │  BadgerDB (metadata, queue, links)      │
          └───────────────────────────────────────┘
```

See [full architecture](docs/architecture.md) for detailed diagrams and data flow.

## Tech Stack

| Component | Library |
|-----------|---------|
| P2P | `go-libp2p` v0.38 (TCP+QUIC, Noise, NAT traversal) |
| Discovery | `go-libp2p-kad-dht` (Kademlia + IPFS routing) |
| Search | `bleve/v2` (BM25, stemming, fuzzy) |
| Storage | `badger/v4` (embedded KV, crash-safe WAL) |
| HTML | `goquery` + `go-rod` (headless fallback) |
| HTTP | `chi/v5` |

## Tested On

| Platform | Status |
|----------|--------|
| macOS (Apple Silicon + Intel) | Verified |
| Linux (amd64 / arm64) | Planned |
| Windows 10/11 | Planned |
| Android (Termux, arm64) | Untested |

## Docs

- [Architecture](docs/architecture.md) — system design, data flow, protocols
- [API Reference](docs/api-reference.md) — all HTTP endpoints
- [Running a Node](docs/running-a-node.md) — deployment, tuning, troubleshooting
- [Fleet Management](docs/fleet.md) — multi-node coordination
- [Developer Guide](docs/developer-guide.md) — contributing, building, testing
- [Roadmap](docs/roadmap.md) — full phase-by-phase feature tracker

## Third-Party Data

This product includes GeoLite2 data created by MaxMind, available from [maxmind.com](https://www.maxmind.com). The database is not included — run `make geoip` to download it. Usage is subject to the [MaxMind EULA](https://www.maxmind.com/en/geolite2/eula).

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md) for responsible disclosure.

## License

[MIT](LICENSE)
