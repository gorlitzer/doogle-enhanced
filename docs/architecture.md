# Architecture

This document describes the internal architecture of Doogle v2 — how each subsystem works, how they connect, and how data flows through the network.

---

## Design Principles

1. **Single binary** — No external services. Everything (networking, crawling, indexing, searching, storage) runs in one process.
2. **P2P-native** — Every node is equal. There are no master nodes, coordinators, or central indexes.
3. **Embedded storage** — BadgerDB for metadata, Bleve for full-text search. No database servers to manage.
4. **Graceful degradation** — If peers are unreachable, local search still works. If rate limits hit, workers wait. If crawl fails, the URL is skipped.

---

## System Overview

```
┌─────────────────── Node ───────────────────────────────────┐
│                                                            │
│  ┌──────────┐     ┌──────────┐     ┌──────────────────┐   │
│  │ CLI/API  │────▶│ Crawler  │────▶│     Indexer      │   │
│  │  seeds   │     │ workers  │     │ score → dedup →  │   │
│  └──────────┘     └─────┬────┘     │ Bleve write      │   │
│                         │          └──────────────────┘   │
│                         ▼                                  │
│                   ┌───────────┐                            │
│                   │ GossipSub │◀──────── Peer nodes        │
│                   │  publish  │                            │
│                   └───────────┘                            │
│                                                            │
│  ┌──────────┐     ┌───────────────────────────────────┐   │
│  │ HTTP API │────▶│       Distributed Search          │   │
│  │ /search  │     │  local Bleve + fan-out to peers   │   │
│  └──────────┘     └───────────────────────────────────┘   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │                  Local Storage                      │   │
│  │   BadgerDB (URL queue, seen set, metadata)         │   │
│  │   Bleve     (full-text index, BM25)                │   │
│  └────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

---

## Node Lifecycle

### Initialization (`node.New()`)

The node orchestrator creates subsystems in this exact order:

```
1.  LoadOrCreateIdentity()     Ed25519 keypair → persistent in data_dir/node.key
2.  p2p.NewHost()              libp2p host on TCP + QUIC
3.  p2p.NewDiscovery()         Kademlia DHT + IPFS DHT routing discovery + optional mDNS
4.  p2p.NewGossip()            GossipSub → join "doogle/url-frontier"
5.  store.NewBadgerStore()     Open BadgerDB at data_dir/badger/
6.  index.NewBleveStore()      Open/create Bleve index at data_dir/bleve/
7.  index.NewShardManager()    Consistent hash ring (self as first node)
8.  indexer.New()              Scoring + dedup pipeline
9.  crawler.NewScheduler()     URL frontier (10K in-memory + BadgerDB overflow)
10. crawler.New()              Worker pool with onCrawled callback
11. search.NewEngine()         Local BM25 search
12. search.NewDistributedSearch()  Fan-out + merge
13. Register P2P handlers      Search, Crawl, Index stream protocols
14. api.NewServer()            HTTP API + embedded web UI
```

### Runtime (`node.Run()`)

```
1. crawler.Start()              → launches N worker goroutines
2. discovery.StartAdvertising() → advertises on DHT (re-advertises at 7/8 * TTL)
3. go discovery.StartFindingPeers() → periodic DHT peer search (every 30s)
4. go gossipLoop()              → listens for URL announcements from peers
5. crawler.AddSeed()            → queues each seed URL
6. apiServer.Start()            → blocks, serving HTTP
```

### Shutdown (`node.Shutdown()`)

```
1. cancel context           → signals all goroutines to stop
2. apiServer.Shutdown()     → drains HTTP connections (10s timeout)
3. crawler.Stop()           → waits for workers to finish
4. gossip.Close()           → unsubscribe from topic
5. discovery.Close()        → close DHT + mDNS
6. host.Close()             → close all libp2p connections
7. bleveIdx.Close()         → flush and close index
8. badger.Close()           → flush and close database
```

---

## P2P Network Layer

### Transport & Security

| Layer | Implementation |
|-------|----------------|
| Transport | TCP + QUIC-v1 (UDP) on the same port |
| Encryption | Noise protocol (primary), TLS 1.3 (fallback) |
| NAT | Automatic port mapping (UPnP/NAT-PMP) + hole punching |
| Identity | Ed25519 keypair, persisted to disk |

### Peer Discovery

**Kademlia DHT** — Nodes maintain a distributed hash table. When bootstrapping, the node connects to known peers and populates its routing table. The DHT runs in `AutoServer` mode (acts as both client and server).

**IPFS DHT Routing Discovery** — Enabled by default. On startup, the node connects to the IPFS public bootstrap peers (5 well-known nodes maintained by Protocol Labs) to join the global Kademlia DHT. It then uses `RoutingDiscovery` to advertise itself under the rendezvous namespace `doogle/network/v2` and periodically searches for other Doogle nodes. Discovery queries are wrapped in `BackoffDiscovery` (exponential backoff: 1s–5min, full jitter) to avoid overloading the DHT. New peers are found within 30–60 seconds — no manual `--bootstrap` needed for internet-wide discovery. Disable with `--dht-discovery=false`.

**mDNS** — For local/dev networks, nodes broadcast on the LAN using the service name `doogle-p2p`. No bootstrap peers needed on the same network.

### Custom Stream Protocols

Three request/response protocols using JSON over libp2p streams:

#### `/doogle/search/1.0.0`

Handles peer-to-peer search queries.

```
→ Requester sends:  SearchRequest JSON + \n
← Responder sends:  SearchResponse JSON + \n
```

**SearchRequest:**
```json
{
  "query": "distributed systems",
  "page": 1,
  "page_size": 10
}
```

**SearchResponse:**
```json
{
  "query": "distributed systems",
  "results": [
    {
      "url": "https://example.com/distributed",
      "title": "Distributed Systems Guide",
      "description": "A comprehensive guide...",
      "domain": "example.com",
      "score": 2.45,
      "quality_score": 0.82
    }
  ],
  "total": 3,
  "page": 1,
  "page_size": 10,
  "took_ms": 12
}
```

#### `/doogle/crawl/1.0.0`

Forwards crawl tasks between nodes.

```
→ Sender sends:    CrawlTask JSON + \n
← Receiver sends:  {"status": "ok"} or {"status": "error"}
```

#### `/doogle/index/1.0.0`

Forwards documents for indexing (used for shard replication in Phase 2).

```
→ Sender sends:    Document JSON + \n
← Receiver sends:  {"status": "ok"} or {"status": "error"}
```

### GossipSub — URL Frontier

**Topic:** `doogle/url-frontier`

When a node crawls a page and discovers new URLs, it publishes a `URLAnnouncement`:

```json
{
  "urls": ["https://example.com/page1", "https://example.com/page2"],
  "source_url": "https://example.com",
  "depth": 1,
  "peer_id": "12D3KooWAbc..."
}
```

All subscribed peers receive this and schedule the URLs for crawling (if not already seen). This is how the crawl frontier propagates across the network.

---

## Crawl Pipeline

```
Seed URL → Scheduler → Worker → Fetch → Extract → Callback
                ▲                                      │
                │         ┌────────────────────────────┘
                │         ▼
                │    Index document locally
                │    Schedule discovered URLs ──────────▶ Scheduler
                │    Broadcast via GossipSub ──────────▶ Peers
                │
           Gossip loop receives URLs from peers ───────┘
```

### Scheduler

The scheduler is a two-tier queue:

1. **In-memory channel** (capacity: 10,000) — Fast path for most URLs
2. **BadgerDB persistent queue** — Overflow when the channel is full

URLs are normalized and deduplicated before enqueue. The seen set is an in-memory hash map checked on every `Schedule()` call.

### Worker Pool

Each worker loops independently:

1. Poll `scheduler.TryNext()` (non-blocking)
2. If no task, sleep 1 second and retry
3. Check `maxDepth` (skip if exceeded)
4. Check `robots.txt` (cached 24 hours per domain)
5. Rate limit: wait if domain is throttled
6. HTTP GET with timeout, redirect tracking (max 10), User-Agent
7. Validate Content-Type (must be HTML)
8. Read body (10MB limit)
9. Parse with goquery, extract title/description/content/links
10. Invoke `onDocumentCrawled` callback

### Rate Limiter

Per-domain sliding window:

- **Window size:** configurable (default: 10 requests per minute per domain)
- **Global delay:** 500ms between any two requests
- **Cleanup:** Every 5 minutes, remove domains inactive for 1+ hour

### robots.txt

- Fetched on first request to a domain
- Cached for 24 hours
- Parses `User-Agent` and `Disallow` directives
- Falls back to "allow all" if unreachable

### Content Extraction

**Removed elements:** `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, `<noscript>`, `<iframe>`

**Extracted:**
- Title from `<title>`
- Description from `<meta name="description">`
- Body text (whitespace collapsed)
- All `<a href>` links (resolved to absolute, categorized internal/external)

**URL filtering:** Non-crawlable extensions (`.pdf`, `.jpg`, `.css`, `.js`, etc.) are excluded from the discovered URLs list.

---

## Indexing Pipeline

```
Document
  │
  ▼
Empty check ──── skip if no title AND no content
  │
  ▼
Duplicate detection ──── fingerprint match → skip
  │
  ▼
Quality scoring ──── 0.0 to 1.0
  │
  ▼
Spam scoring ──── 0.0 to 1.0 (reject if > 0.7)
  │
  ▼
Bleve index write
```

### Quality Scoring

Five factors, averaged:

| Factor | Score 1.0 | Score 0.5 | Score 0.2 |
|--------|-----------|-----------|-----------|
| Title length | 10-70 chars | Any title | — |
| Word count | 300-5000 | 100+ | 1+ |
| Description | 50+ chars | Any description | — |
| Semantic density | 0.2-0.6 | Any > 0 | — |
| Depth penalty | `1/(1+depth*0.2)` | — | — |

### Spam Detection

Additive scoring (capped at 1.0):

| Signal | Score |
|--------|-------|
| Each spam keyword match | +0.15 (max 0.6) |
| Excessive caps in title (>50%) | +0.2 |
| Thin content (<50 words) | +0.3 |

Spam keywords: "buy now", "free money", "click here", "act now", "limited time", "no obligation", "winner", "congratulations", "earn money", "work from home", "make money", "get rich", "casino"

### Duplicate Detection

Content fingerprinting using shingling:

1. Split content into 5-word shingles (sliding window)
2. Sort and take top 20 shingles
3. SHA-256 hash of the concatenated shingles
4. Store fingerprint → document ID in memory
5. If fingerprint already exists for a different document, it's a duplicate

### Bleve Index

Custom English analyzer pipeline (default):
```
Unicode tokenizer → lowercase → stop word removal → Snowball stemmer
```

**Multi-language support:** 15 languages registered via Bleve's built-in analyzers (en, de, fr, es, it, pt, nl, ru, sv, da, fi, hu, ro, tr, no). Language-specific analysis is applied at query time when `lang:xx` is used.

**Indexed fields (analyzed):** title, description, content, anchor_text, keywords, categories
**Stored fields (exact):** url, domain, content_hash, language
**Numeric fields:** content_size, quality_score, spam_score, depth, pagerank_score, and 10+ scoring signals

---

## Search Pipeline

### Query Understanding

Raw queries are parsed into a structured `ParsedQuery` before execution:

| Syntax | Example | Effect |
|--------|---------|--------|
| Plain terms | `golang tutorial` | AND match across title, description, content |
| Quoted phrase | `"machine learning"` | Exact phrase match (boosted) |
| Exclude (`-`) | `golang -tutorial` | MustNot clause across all text fields |
| OR (uppercase) | `python OR ruby` | Disjunction group (min 1 match) |
| `site:` | `site:docs.python.org` | Restrict to domain |
| `lang:` | `lang:de` | Restrict to language + use language-specific analyzer |
| Synonyms | `js` → `javascript` | Automatic synonym expansion (boost tier) |
| Fuzzy | short queries (≤3 terms) | Edit-distance matching |

Lowercase `or` is treated as a stop word. `-` prefix works on any term.

### Local Search

1. Parse query into `ParsedQuery` (phrases, excludes, OR groups, site/lang filters, synonyms)
2. Build Bleve query tree: Must(AND terms) + MustNot(excludes) + Must(OR groups) + Should(fuzzy/synonyms)
3. Apply language-specific analyzer if `lang:` is set
4. BM25 relevance scoring
5. Return hits with all stored fields

### Search Cache

An LRU cache with TTL sits in front of distributed search:

- **Key:** SHA-256 of `query|page|pageSize` (first 16 hex chars)
- **Hit:** Return cached response immediately (no peer fan-out)
- **Miss:** Execute search, store result before returning
- **Eviction:** LRU when cache reaches `cache_size` (default 1000)
- **Expiry:** Entries older than `cache_ttl` (default 5m) are treated as misses

### Distributed Search

```
          ┌─── Cache hit? ──────── return ─────────────────────────────┐
          │                                                            │
          │    ┌─── Local Bleve ───────── results ──┐                  │
          │    │                                     │                  │
 Query ───┤    ├─── Peer 1 (stream) ──── results ──├──▶ Merge ──▶ Re-rank ──▶ Dedup ──▶ Cache ──▶ Response
          │    │─── Peer 2 (stream) ──── results ──│
          │    │─── Peer N (stream) ──── results ──│
          │    └────────────────────────────────────┘
          │              (parallel, 5s timeout)
          └────────────────────────────────────────────────────────────┘
```

1. **Cache check:** If cached and not expired, return immediately
2. **Local search:** Query the node's own Bleve index
3. **Peer selection:** Take up to `maxPeers` (default 10) connected peers
4. **Fan-out:** Open a libp2p stream to each peer (in parallel goroutines)
5. **Timeout:** Each peer has `peerTimeout` (default 5s) to respond
6. **Merge:** Combine all results into a single list
7. **Re-rank:** Multi-signal scoring (BM25, quality, PageRank, freshness, spam penalty)
8. **Deduplicate:** Keep first occurrence of each URL
9. **Cache store:** Save response for future queries
10. **Paginate:** Return `pageSize` results

Failed peer connections are logged but don't block the response.

---

## Shard Assignment (Phase 2)

The consistent hash ring maps domains to nodes:

```
Hash ring:  [0 ────────── Node A ─── Node B ─── Node C ─── 2^32]
                            │            │            │
Domain hash lands here ─────┘            │            │
                                         │            │
     This domain goes to Node B ─────────┘            │
                                                      │
          This domain goes to Node C ─────────────────┘
```

Each node has 64 virtual nodes on the ring for even distribution. `ShardManager.Owners(domain, 2)` returns the primary and one replica node.

In Phase 2, when a node crawls a page for a domain it doesn't own, it will forward the document to the owner via `/doogle/index/1.0.0`.

---

## Storage Layout

```
data_dir/
├── node.key           # Ed25519 private key (persistent identity)
├── badger/            # BadgerDB
│   ├── *.vlog         # Value log files
│   └── *.sst          # Sorted string tables
└── bleve/             # Bleve full-text index
    └── store/         # Index segments
```

**BadgerDB stores:**
- URL queue (`queue:{timestamp}:{url}` → CrawlTask JSON)
- General KV operations for metadata

**Bleve stores:**
- Full-text index with custom English analyzer
- All indexed document fields

---

## Package Dependency Graph

```
cmd/doogle/main.go
  └─ internal/node
       ├─ internal/p2p
       │    ├─ libp2p (host, dht, pubsub, mdns, routing discovery, backoff)
       │    └─ internal/models
       ├─ internal/crawler
       │    ├─ goquery
       │    ├─ internal/store
       │    ├─ internal/models
       │    └─ pkg/urlutil
       ├─ internal/indexer
       │    ├─ internal/index
       │    └─ internal/models
       ├─ internal/index
       │    ├─ bleve/v2
       │    └─ pkg/consistent
       ├─ internal/search
       │    ├─ internal/index
       │    ├─ internal/p2p
       │    └─ internal/models
       ├─ internal/api
       │    ├─ chi/v5
       │    ├─ internal/search
       │    └─ web (embedded static files)
       └─ internal/store
            ├─ badger/v4
            └─ internal/models
```
