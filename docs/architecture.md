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
14. initFleet()                Fleet coordinator/worker setup (if fleet role != standalone)
15. api.NewServer()            HTTP API + embedded web UI
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
1.  cancel context           → signals all goroutines to stop
2.  apiServer.Shutdown()     → drains HTTP connections (10s timeout)
3.  scheduler.Drain()        → save queued crawl tasks to BadgerDB
4.  urlStore.FlushCrawledCount() → persist crawled count
5.  crawler.Stop()           → waits for workers to finish
6.  batchIndexer.Stop()      → final Bleve batch flush
7.  indexer.FlushStats()     → persist indexer stats
8.  gossip.Close()           → unsubscribe from topic
9.  discovery.Close()        → close DHT + mDNS
10. host.Close()             → close all libp2p connections
11. bleveIdx.Close()         → flush and close index
12. badger.Close()           → flush and close database (last, all stores depend on it)
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

**IPFS DHT Routing Discovery** — Enabled by default. On startup, the node connects to the IPFS public bootstrap peers (5 well-known nodes maintained by Protocol Labs) to join the global Kademlia DHT. It then uses raw `RoutingDiscovery` to advertise itself under the rendezvous namespace `doogle/network/v2` and periodically searches for other Doogle nodes with a 30-second polling interval. No `BackoffDiscovery` wrapper is used — the fixed polling interval already provides reasonable rate-limiting, and backoff's result caching would delay discovery of new peers. New peers are found within 30–60 seconds — no manual `--bootstrap` needed for internet-wide discovery. Disable with `--dht-discovery=false`.

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

#### `/doogle/fleet/heartbeat/1.0.0`

Workers send heartbeats to the coordinator every 15 seconds with their stats. All messages are HMAC-SHA256 signed with the shared fleet secret.

```
→ Worker sends:    {peer_id, node_name, stats, timestamp, signature} + \n
← Coordinator:    {status: "ok"|"rejected", reason?} + \n
```

The coordinator verifies: (1) peer ID matches the stream sender, (2) peer is in the allowlist (if configured), (3) HMAC signature is valid, (4) timestamp is within ±60s.

#### `/doogle/fleet/proxy/1.0.0`

The coordinator tunnels HTTP requests to workers through encrypted libp2p streams. Workers only bind their API to `127.0.0.1` — this tunnel is the only remote access path.

```
Phase 1 (coord → worker):  {method, path, query, headers, body, timestamp, signature} + \n  <CloseWrite>
Phase 2 (worker → coord):  {status_code, headers, content_length} + \n  <raw body bytes until EOF>
```

Limits: 5MB request, 100MB response, 60s timeout.

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

All subscribed peers receive this and check domain ownership via the shard ring. Each peer only crawls URLs for domains it owns. URLs for other domains are forwarded to the responsible peer via `/doogle/crawl/1.0.0`. This is how the crawl frontier propagates across the network without duplicating work.

---

## Crawl Pipeline

```
Seed URL → Domain check ─── owned? ─── Scheduler → Worker → Fetch → Extract → Callback
               │                            ▲                                      │
               │ not owned?                 │         ┌────────────────────────────┘
               │                            │         ▼
               ▼                            │    Index document locally
          Forward to owner                  │    Replicate to shard owners
          via /doogle/crawl/1.0.0           │    Schedule discovered URLs ──▶ Domain check
                                            │    Broadcast via GossipSub ──▶ Peers
                                            │
                                       Gossip loop receives URLs from peers ─┘
                                       (also routed through domain check)
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

**Removed elements:** `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, `<noscript>`, `<iframe>`, `<svg>`

**Readability-style main content extraction (Arc90 algorithm):**
1. Score each block element (`div`, `article`, `section`, `main`, `td`):
   - +1 per `<p>` tag, +1 per comma in text, +text_length/100
   - +25 for class/ID containing: "article", "content", "post", "entry", "main", "text", "body", "story"
   - -25 for class/ID containing: "sidebar", "nav", "footer", "comment", "ad", "widget", "banner", "menu", "social", "share", "related"
   - +30 for `<article>` or `<main>` tags
2. Select highest-scoring block (threshold: score ≥ 50)
3. Fall back to full `<body>` text if no candidate meets threshold

**Extracted:**
- Title from `<title>`
- Description from `<meta name="description">`
- Main content (Readability extraction with whitespace collapsed)
- Headings (H1-H6 with level tracking)
- All `<a href>` links (resolved to absolute, categorized internal/external, nofollow detection)
- Images with alt text and title
- Open Graph tags (`og:title`, `og:description`)
- Canonical URL
- Meta keywords

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

12 weighted signals combined into a StaticScore at index time:

| Signal | Weight | Description |
|--------|--------|-------------|
| E-E-A-T | 15% | Expertise, experience, authority, trustworthiness |
| PageRank | 15% | Graph-based link authority (damping=0.85, 15 iterations) |
| Quality | 10% | Content depth, heading structure, media richness |
| Domain Authority | 10% | Site-level reputation: avg PageRank, avg quality, backlink domains |
| Readability | 8% | Flesch-Kincaid readability score |
| Citation | 8% | References to/from other sources |
| Freshness | 8% | Graduated decay: time-sensitive (7d half-life), evergreen (365d) |
| Relevance | 6% | Composite of E-E-A-T, Quality, Link, SEO, URL Quality |
| URL Quality | 5% | Path depth, slug readability, tracking param detection |
| SEO | 5% | Meta tags, heading structure, canonical URLs |
| Link | 5% | Inbound/outbound link structure and quality |
| Author Credibility | 5% | Author expertise signals |

**StaticScore formula:** `(0.5 + weightedSignals * 2.0) * (1.0 - spamScore * 0.8)` — range [0.1, 2.5]

Basic quality factors (averaged into Quality signal):

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

**Indexed fields (analyzed):** title (5x boost), url_text (3x), headings_text (2x), description (1.5x), content (1x), anchor_text, keywords, categories
**Stored fields (exact):** url, domain, content_hash, language
**Numeric fields:** content_size, quality_score, spam_score, depth, pagerank_score, domain_authority_score, url_quality_score, and 10+ scoring signals

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
| Synonyms | `js` → `javascript` | Automatic synonym expansion (100+ pairs, boost tier) |
| Fuzzy | short queries (≤3 terms) | Edit-distance matching |

Lowercase `or` is treated as a stop word. `-` prefix works on any term.

### Query Intent Classification

Every query is classified into one of 4 intents, adjusting ranking weights:

| Intent | Detection | Ranking Adjustment |
|--------|-----------|-------------------|
| **Navigational** | Single known domain/brand, "login", URL-like | Boost exact domain match (+5x), reduce diversity |
| **Informational** | Question words (how/what/why), multi-word queries | Boost content quality, readability |
| **Transactional** | Action words (buy/download/price) | Boost commercial pages |
| **Local** | "near me", city names | Boost geo-tagged content |

### Spelling Correction

Built from Bleve index term frequencies (top terms by doc frequency). For each query token not in the dictionary, candidates within Damerau-Levenshtein distance ≤ 2 are generated and ranked by document frequency. Dictionary refreshes every 30 minutes in the background.

### Local Search

1. Parse query into `ParsedQuery` (phrases, excludes, OR groups, site/lang filters)
2. Expand synonyms (100+ bidirectional pairs added as low-boost clauses)
3. Classify intent (navigational, informational, transactional, local)
4. Build Bleve query tree: Must(AND terms) + MustNot(excludes) + Must(OR groups) + Should(fuzzy/synonyms)
5. Apply language-specific analyzer if `lang:` is set
6. BM25 relevance scoring with field boosts (title 5x, url_text 3x, headings 2x, desc 1.5x)
7. Extract passage-based snippets with term highlight positions
8. Re-rank with intent-aware multipliers
9. Generate spelling suggestion if applicable
10. Return hits with all stored fields

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
7. **Intent classification:** Classify query intent (navigational/informational/transactional/local)
8. **Re-rank:** Intent-aware 12-signal scoring (BM25, quality, PageRank, domain authority, URL quality, freshness, etc.)
9. **Deduplicate:** Keep first occurrence of each URL
10. **Domain diversity:** Max 2 results per domain in top 10 positions (excess demoted, not removed)
11. **Spelling suggestion:** "Did you mean?" if query terms are not in index dictionary
12. **Cache store:** Save response for future queries
13. **Paginate:** Return `pageSize` results

Failed peer connections are logged but don't block the response.

---

## Shard Assignment & Crawl Coordination

The consistent hash ring maps domains to nodes for both **storage** and **crawl coordination**:

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

### Domain-Aware Crawl Routing

When a URL is about to be crawled (from gossip, discovered links, API seeds, or wizard), the node checks:

1. `shards.IsOwner(myPeerID, domain, replicationFactor)` — am I responsible?
2. **Yes** → schedule locally (existing crawl pipeline)
3. **No** → forward the `CrawlTask` to the primary owner via `/doogle/crawl/1.0.0`
4. **Fallback** — if the owner is not connected, crawl locally

This prevents two nodes from crawling the same domain even if they both seed the same category.

```
Seed URL → Domain check:
             owned? ──yes──▶ Scheduler → Worker → Fetch → Callback
             not owned? ──▶ Forward to owner via /doogle/crawl/1.0.0
```

### Categories vs. Shard Assignment

The wizard categories (Technology, Science, News, etc.) are **seed suggestions** — they help new nodes discover starting URLs. The shard ring handles actual domain assignment automatically. Two nodes picking the same category will discover the same seed URLs, but the shard ring ensures each domain is crawled by only its assigned owner(s).

### Replication

When a node crawls a page for a domain it owns, it replicates the resulting document to the other shard owners via `/doogle/replicate/1.0.0`.

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
       │    ├─ libp2p (host, dht, pubsub, mdns, routing discovery)
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
       ├─ internal/fleet
       │    ├─ internal/p2p
       │    └─ internal/store
       ├─ internal/api
       │    ├─ chi/v5
       │    ├─ internal/search
       │    ├─ internal/fleet (fleet handlers)
       │    ├─ internal/updater (update-check + update-apply)
       │    └─ web (embedded static files)
       └─ internal/store
            ├─ badger/v4
            └─ internal/models
```
