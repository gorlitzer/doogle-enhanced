<p align="center">
  <img src="web/static/img/banner.png" alt="Doogle — Search everything. Own the network." width="100%" />
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

### Neural search (optional)

If you have [Ollama](https://ollama.com) installed, enable neural semantic search:

```bash
ollama pull all-minilm
./bin/doogle --ollama
```

This gives you true semantic understanding ("automobile" matches "car"). Without `--ollama`, search still works using TF-IDF — no quality loss for keyword queries.

### Docker

```bash
docker compose up -d          # single node
docker compose up -d node1 node2 node3   # 3-node cluster
```

## Heads Up

Let's be real: this entire thing was vibe-coded. Us and Claude, going full send on features until we ran out of time and decided to just ship it. Zero regrets.

There are bugs. Some features are half-baked. Some are three-quarters-baked. A couple might make you raise an eyebrow if you look too closely. **The core pipeline works** — crawl → index → search → P2P all function — but we are not going to pretend we crossed every t and dotted every i before open-sourcing, because we didn't.

We're shipping it now because the idea is solid and it's more useful in your hands than sitting on a hard drive waiting to be "finished" (it was never going to be finished, that's not how this works).

If you break something, open an issue. If you fix something, you're a legend. If you find something embarrassingly incomplete, that's on us — but the PR queue is open and we won't judge.

## Calling All Coders (and Bots)

Here's the situation: we built a decentralized search engine fast, with AI, with big ambitions, and with full awareness that some of it isn't done. Then we ran out of time. So instead of letting it rot, we're doing the responsible thing and throwing it over the fence to the open-source community.

**The idea is good. The foundation is real. We just need more hands.**

You're welcome here whether you're a seasoned Go engineer, a first-time contributor, a vibe-coder who learned to code last week with an LLM, or literally a bot. We don't care. If you make it better, you're in.

### Current state: what works, what doesn't

| Area | State | Notes |
|------|-------|-------|
| Crawl → index → search pipeline | ✅ Works | Core path is solid |
| P2P discovery + DHT | ✅ Works | Auto-discovers peers via IPFS public DHT |
| BM25 hybrid search | ✅ Works | Benchmarked on synthetic test suite (20 queries) |
| Trust & safety system | ✅ Code complete | Zero adversarial testing done |
| LTR ranking model | ⚠️ Code complete | Needs real click data — blind without production traffic |
| Neural search (Ollama) | ⚠️ Works | Quality vs TF-IDF unvalidated at scale |
| P2P at 50+ nodes | ❌ Untested | Never run beyond a handful of peers |
| Crawl stability (days-long runs) | ❌ Untested | Headless Chrome is finicky under sustained load |
| Integration tests | ❌ Missing | Only unit tests exist — no full pipeline test |
| Dark web / Tor | ❌ Not started | Design-only, blocked on legal review |
| Linux / Windows / Android | ⚠️ Unverified | Builds cross-compile fine, not confirmed running |

### Where the community can help most

**High impact, hard:**
- Run 50+ nodes and stress-test DHT routing, shard distribution, gossip propagation
- Simulate a Sybil attack against the trust system — does the PoW gate actually hold?
- Write an integration test for the full crawl→index→search pipeline
- Validate LTR ranking quality with a real click dataset

**Medium impact, doable:**
- Run it on Linux (amd64 / arm64) and report what breaks — open an issue with your findings
- Run it on Windows and help write a Windows-compatible Makefile
- Add HTTPS/TLS support to the API server (port 7002 is plain HTTP, that's a problem for public deployments)
- Add a `systemd` service file for Linux deployments

**Good first issues (lower effort):**
- Write a seed URL list useful for bootstrapping a fresh node
- Test the `doogle dump` / `doogle restore` backup cycle end-to-end
- Test the fleet coordinator+worker setup and document any pain points
- Run the node for 24h+ and report memory/CPU profile

Open an issue for any of the above, or just send a PR. No gatekeeping here.

---

## Project Status

> **Alpha. Shipped before it was "finished". That's the point.**

**Works today:**
- Single binary deployment — `make run` and you're crawling
- P2P discovery (IPFS DHT, mDNS), GossipSub URL propagation, shard routing, replication
- BM25 + TF-IDF vector hybrid search with RRF fusion
- 12-signal quality indexer (PageRank, E-E-A-T, freshness, spam, readability, Core Web Vitals…)
- Trust & safety system (peer reputation, Sybil PoW, consensus blocklist, audit trail)
- Admin dashboard, fleet management, backup & restore, Docker

**Works but unvalidated at scale:**
- LTR ranking — trains from real clicks, but has never seen real production traffic
- Neural search — Ollama integration works, quality vs TF-IDF unknown on a real corpus
- Benchmarks are NDCG@10=0.971 / MRR=1.000 across a **20-query synthetic test suite** — not real-world validation
- Trust/Sybil resistance — implemented but zero adversarial testing done

**Not started:**
- Dark web / Tor (blocked on legal review — see [roadmap](docs/roadmap.md))
- Browser extension, mobile client, incentive layer, governance, plugin system

## Features

| Area | Highlights |
|------|-----------|
| **Search** | BM25 + vector hybrid (RRF), neural embeddings via Ollama, 28-feature LTR, intent classification, query relaxation, spelling correction, synonym expansion, search dorks (`site:`, `lang:`, `intitle:`, `filetype:`, etc.), domain diversity, passage snippets |
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
