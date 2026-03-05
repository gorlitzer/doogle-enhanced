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
┌─────────────────── Node ───────────────────────────────────────────┐
│                                                                     │
│  ┌──────────┐     ┌──────────┐     ┌──────────────────┐            │
│  │ CLI/API  │────▶│ Crawler  │────▶│     Indexer      │            │
│  │  seeds   │     │ workers  │     │ score → dedup →  │            │
│  └──────────┘     └─────┬────┘     │ entity → embed → │            │
│                         │          │ Bleve write      │            │
│                         ▼          └──────────────────┘            │
│                   ┌───────────┐                                     │
│                   │ GossipSub │◀──────── Peer nodes                 │
│                   │  publish  │                                     │
│                   └───────────┘                                     │
│                                                                     │
│  ┌──────────┐     ┌───────────────────────────────────┐            │
│  │ HTTP API │────▶│       Distributed Search          │            │
│  │ /search  │     │  hybrid (BM25 + vector) + peers   │            │
│  └──────────┘     └───────────────────────────────────┘            │
│                                                                     │
│  ┌─────────────────── Intelligence ──────────────────────────────┐ │
│  │  Entity Store (knowledge graph)  │  Trend Detection (spikes)  │ │
│  │  Hybrid Search (BM25 + cosine)   │  Click Tracking (L2R)     │ │
│  │  TF-IDF Embedder (384-dim)       │  Topic Clusters           │ │
│  │  Multilingual Search (9 langs)  │  Learn-to-Rank (GBDT)     │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                       Local Storage                           │ │
│  │   BadgerDB (URL queue, seen set, metadata, entities, vectors) │ │
│  │   Bleve     (full-text index, BM25)                           │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
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
    5a. store.NewTrendStore()      Hourly-bucketed trend counters (on same BadgerDB)
    5b. store.NewEntityStore()     Knowledge graph entity persistence (on same BadgerDB)
    5c. store.NewClickStore()      Click tracking for learn-to-rank (on same BadgerDB)
    5d. store.NewClusterStore()    Topic cluster persistence (on same BadgerDB)
6.  index.NewBleveStore()      Open/create Bleve index at data_dir/bleve/
    6a. index.NewEmbedder()        384-dim TF-IDF feature-hashing embedder
    6b. index.NewVectorStore()     BadgerDB-backed embedding storage + cosine search
    6c. index.NewHybridSearcher()  BM25 + vector RRF fusion (wraps Bleve + VectorStore)
7.  index.NewShardManager()    Consistent hash ring (self as first node)
8.  indexer.New()              Scoring + dedup + entity extraction + embedding pipeline
9.  crawler.NewScheduler()     URL frontier (10K in-memory + BadgerDB overflow)
10. crawler.New()              Worker pool with onCrawled callback
11. search.NewEngine()         Hybrid search (BM25 + vector via HybridSearcher)
    11a. search.NewEntityCardDetector()  Entity query detection → knowledge cards
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
- Images with alt text, title, width/height, and surrounding context (figcaption, nearby text)
- Open Graph tags (`og:title`, `og:description`)
- Canonical URL
- Meta keywords
- Schema.org structured data (JSON-LD `<script>` blocks + microdata `[itemscope]`/`[itemprop]`)

**Non-HTML Document Support:**
- PDF: binary text extraction from parenthesized string objects and hex-encoded strings
- Plain text, CSV, markdown, XML: UTF-8 validated, first-line title extraction
- Content type detected from HTTP `Content-Type` header; non-HTML documents use `DocumentFetcher`
- 10MB download limit, 100KB content truncation

**URL filtering:** Non-crawlable extensions (`.jpg`, `.css`, `.js`, etc.) are excluded from the discovered URLs list. PDFs and text documents are now crawlable.

---

## Indexing Pipeline

```
Document
  │
  ▼
Empty check ──── skip if no title AND no content
  │
  ▼
Content verification ──── Ed25519 sign (tamper detection)
  │
  ▼
Duplicate detection ──── persistent fingerprint match → skip
  │                       (BadgerDB-backed, survives restarts)
  ▼
Quality scoring ──── 0.0 to 1.0
  │
  ▼
Spam scoring ──── 0.0 to 1.0 (reject if > 0.7)
  │
  ▼
Structured data ──── extract Schema.org type, image text
  │
  ▼
Entity extraction ──── NER → persist to EntityStore → link relationships
  │
  ▼
Extractive summary ──── TextRank sentence ranking → document summary
  │
  ▼
TF-IDF embedding ──── 384-dim feature hash → store in VectorStore
  │
  ▼
Bleve index write ──── routed to correct horizontal shard
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

### Content Verification

Ed25519 document signing for tamper detection:

1. Compute SHA-256 hash of `URL + Title + Content`
2. Sign the hash with the node's Ed25519 private key
3. Stamp `ContentSig` (base64 signature) and `ContentSigner` (hex public key) on the document
4. Receiving nodes can verify the signature to detect tampering

### Duplicate Detection

Content fingerprinting using shingling, with persistent storage:

1. Split content into 4-gram shingles (sliding window)
2. Sort and take top 20 shingles
3. SHA-256 hash of the concatenated shingles → fingerprint
4. Store fingerprint → document ID in BadgerDB (key: `dedup:fp:{hash}`)
5. If fingerprint already exists for a different document, compute Jaccard similarity
6. If similarity > 80%, it's a duplicate → skip
7. Fingerprints survive restarts (persistent in BadgerDB vs in-memory fallback)

### Horizontal Index Sharding

Local Bleve index is split into N shards by domain:

1. FNV-32a hash of the document's domain
2. `hash % numShards` selects the target shard
3. Each shard is an independent Bleve index at `data_dir/bleve/shard-{N}/`
4. Searches fan out across all local shards and merge results
5. `TotalDocCount()` aggregates across shards

### Hash Ring Rebalancing

Background loop detects topology changes and transfers documents:

1. Every 30 seconds, compare current hash ring members to last known state
2. On new node join: identify domains now owned by the new node
3. Query local shards for documents in those domains
4. Transfer documents in batches of 50 via `/doogle/replicate/1.0.0`
5. Delete transferred documents from local index after successful transfer

### Bleve Index

Custom English analyzer pipeline (default):
```
Unicode tokenizer → lowercase → stop word removal → Snowball stemmer
```

**Multi-language support:** 15 languages registered via Bleve's built-in analyzers (en, de, fr, es, it, pt, nl, ru, sv, da, fi, hu, ro, tr, no). Language-specific analysis is applied at query time when `lang:xx` is used.

**Indexed fields (analyzed):** title (5x boost), url_text (3x), headings_text (2x), description (1.5x), content (1x), anchor_text, keywords, categories, image_text, structured_text
**Stored fields (exact):** url, domain, content_hash, language, schema_type
**Numeric fields:** content_size, quality_score, spam_score, depth, pagerank_score, domain_authority_score, url_quality_score, image_count, and 10+ scoring signals

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
6. **Hybrid search:** BM25 relevance scoring + TF-IDF vector cosine similarity, fused via Reciprocal Rank Fusion (RRF). Falls back to BM25-only if vector store is unavailable.
7. Extract passage-based snippets with term highlight positions
8. Re-rank with intent-aware multipliers
9. **Entity card detection:** if query matches a known entity, attach a knowledge card (type, description, relationships) to the response
10. **Related topics:** retrieve document cluster for top result to suggest related queries
11. **Trend boost:** queries or domains with active trend spikes receive a velocity-based ranking bonus
12. Generate spelling suggestion if applicable
13. Record query terms in trend store (hourly bucket)
14. Return hits with all stored fields

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

## Intelligence Layer

Phase 4 introduces offline intelligence features that run entirely within the node process — no external ML services or APIs. All data is persisted in the same BadgerDB instance used by the rest of the system.

### Knowledge Graph

**Entity extraction** (`indexer/summarizer.go`, `store/entity_store.go`):

During indexing, named entities (persons, organizations, locations, technologies) are extracted from document content via lightweight NER heuristics (capitalization patterns, context windows, Schema.org type hints). Each entity is stored in BadgerDB under `entity:{type}:{name}` with fields: canonical name, type, description snippet, source URLs, and first/last seen timestamps.

**Entity relationships** are recorded when two entities co-occur within the same document or structured data block. Relationship edges are stored at `entity_rel:{name1}:{name2}` with co-occurrence count and relationship type (if inferable from Schema.org predicates).

**Entity cards** (`search/entity_card.go`):

At search time, the `EntityCardDetector` checks whether the query matches a known entity name. If a match is found, a knowledge card is attached to the search response containing the entity type, description, related entities, and source URLs. This gives users an instant summary without clicking through to a result.

### Trend Detection

**Hourly counters** (`store/trend_store.go`):

Two event streams are tracked:

1. **Crawl domains** — each successful crawl increments `trend:crawl:{domain}:{hour}` (hour = Unix timestamp truncated to 3600)
2. **Query terms** — each search query increments `trend:query:{term}:{hour}` for every non-stop-word token

**Moving averages** are maintained at `trend:avg:{kind}:{name}` using exponential smoothing over a 7-day window.

**Spike detection** uses velocity-based thresholds: if the current hour's count exceeds 3x the moving average, the entity is flagged as trending. Trending status is ephemeral (not persisted) and recalculated on read. Trending domains and queries can receive a ranking boost during search.

### Click Tracking & Learn-to-Rank

**Recording** (`store/click_store.go`):

When a user clicks a search result, the API records a click event containing the query, clicked URL, and result position. Click counts are stored at `click:{query}:{url}` (incremented atomically). Position data is stored at `click_pos:{query}:{url}` for learn-to-rank model training.

Click data is strictly local — it is not shared with peers.

**Learn-to-Rank model** (`search/ltr.go`):

A gradient-boosted decision stump ensemble trained from pairwise click signals (RankNet-style logistic loss). The model uses 14 features: BM25 score, quality score, PageRank, domain authority, URL quality, readability, freshness, word count, title match, exact phrase match, domain match, HTTPS, depth, and click-through rate. Training runs every 6 hours in a background goroutine. The model is serialized to BadgerDB (`ltr:model`) and loaded on startup. When available, LTR scores replace the hand-tuned ranking formula.

### Multilingual Semantic Search

**Cross-lingual projection** (`index/multilingual.go`):

A dictionary-based expansion layer wrapping the TF-IDF embedder. A curated map of ~500 common words across 9 languages (English, German, French, Spanish, Italian, Portuguese, Dutch, Russian, Japanese romanized) enables cross-language retrieval. When embedding a query like "haus" (German for "house"), the multilingual embedder expands it to include English translations, producing vectors that overlap with English documents about houses. Expansion is bidirectional — English queries also pick up foreign-language document terms.

### Hybrid Search

**TF-IDF embedder** (`index/embedder.go`):

A pure-Go 384-dimensional embedder using feature hashing (FNV-based). Input text is tokenized, lowercased, and stop-word filtered. Each token is hashed to a dimension index; the corresponding bucket accumulates TF-IDF weight. The resulting vector is L2-normalized. No external model files or dependencies.

**Vector store** (`index/vector_store.go`):

Embeddings are persisted in BadgerDB at `vec:{docID}` (raw float32 bytes) with metadata at `vecmeta:{docID}` (domain, indexed timestamp). Search is brute-force cosine similarity over all stored vectors — acceptable for index sizes up to ~100K documents per node.

**Reciprocal Rank Fusion** (`index/hybrid_search.go`):

The `HybridSearcher` executes two parallel retrieval paths:

1. **BM25** — standard Bleve full-text query (existing pipeline)
2. **Vector** — embed the query text, cosine-scan the vector store, return top-K

Results are merged using RRF: `score(d) = Σ 1/(k + rank_i(d))` where `k=60` (standard constant) and the sum is over retrieval paths that returned document `d`. RRF is rank-based, so it handles the different score scales of BM25 and cosine similarity without normalization. If the vector store is empty or unavailable, the system falls back to BM25-only transparently.

### Topic Clustering

**Cluster store** (`store/cluster_store.go`):

Documents are grouped into topic clusters based on domain and content similarity. Each cluster record (at `cluster:{id}`) contains the cluster label, member document IDs, and centroid keywords. Clusters are used to power "related topics" suggestions in search results.

### Extractive Summarization

**TextRank summarizer** (`indexer/summarizer.go`):

Documents are summarized at index time using a TextRank-inspired algorithm:

1. Split content into sentences
2. Build a similarity graph (edges weighted by token overlap between sentences)
3. Run iterative ranking (power iteration, damping 0.85, 30 iterations)
4. Select top-N sentences by rank, re-ordered by original position
5. Store the summary on the document for use in search result snippets

The summarizer is invoked after entity extraction and before embedding. Summary length scales with document size (typically 2-5 sentences).

---

## Trust & Safety Layer

### Peer Trust

Each peer has a trust score [0, 1] stored in BadgerDB (`trust:reputation:{peerID}`):

- **Initial trust:** 0.5 for new peers
- **Good behavior:** +0.01 per quality document contributed (capped by trust cap if under probation)
- **Bad behavior:** Trust-weighted penalty: `basePenalty × reporterTrust × reasonWeight(reason)`. Reason weights: malware/phishing 1.5×, illegal 1.2×, spam 1.0×, low_quality 0.5×
- **Trust decay:** Exponential decay with base 0.998 per idle hour (~14-day half-life), replacing the old flat decay
- **Quarantine:** peers below 0.15 trust are blocked from search and gossip

### Graduated Trust Tiers

Peers are classified into tiers based on trust score and quarantine history:

| Tier | Score Range | Search Effect |
|------|------------|---------------|
| **Trusted** | ≥ 0.30 | Full ranking (1.0× multiplier) |
| **Warning** | 0.20–0.29 | Results demoted 20% (0.80×) |
| **Throttled** | 0.10–0.19 | Results demoted 50% (0.50×) |
| **Quarantined** | < 0.10 | Excluded from results (0.0×) |
| **Banned** | 3+ quarantines | Permanent exclusion, cannot be unquarantined |

### Admin Controls

- **Unquarantine:** Reset peer trust to 0.10 with a 30-day cap at 0.70. Three-strikes rule: peers quarantined 3+ times are permanently banned.
- **Report management:** Reports can be dismissed or confirmed. Confirmed reports boost reporter trust (+0.01). High rejection rates (>50% after 5+ reviews) penalize false reporters (−0.02 per rejection).
- **Domain unblocking:** Consensus domain blocks can be manually lifted by the node operator.
- **Report rate limiting:** 10 reports/minute per peer, 5-minute block for offenders.
- **Peer age gating:** Reports from peers < 1 hour old are rejected. Peers < 24 hours old have half-weight penalties.

### Sybil Resistance

Hashcash proof-of-work on URL announcements:

1. Challenge = SHA-256(peerID + sorted URLs)
2. Nonce iterated until hash has N leading zero bits
3. Difficulty scales inversely with trust: high-trust peers (>0.8) need 16 bits, low-trust peers (<0.3) need 24 bits
4. PoW timestamp must be within 5 minutes to prevent replay
5. PoW fields (`pow_nonce`, `pow_timestamp`, `pow_difficulty`) are attached to `URLAnnouncement`

### Per-Peer Rate Limiting

Sliding window rate limiter on gossip messages:

- **Window:** 30 seconds (configurable)
- **Max messages:** 100 per window per peer
- **Blocking:** offenders are blocked for 5 minutes
- **Cleanup:** expired entries removed in maintenance loop

### Consensus Domain Blocklist

Multi-peer voting to globally block domains:

1. When a peer reports a URL, the domain receives a vote from that peer
2. Votes are stored in BadgerDB (`trust:domvotes:{domain}`)
3. When vote count reaches threshold (default: 3 unique peers), domain is blocked
4. Blocked domains are checked in gossip loop, crawl routing, and replication handlers

### Report Audit Trail

Tamper-proof log of all spam reports:

1. Each report entry contains: report ID, reporter, URL, reason, timestamp
2. SHA-256 hash of canonical payload + previous chain hash = entry hash
3. Entry hash is signed with node's Ed25519 private key
4. Entries stored in BadgerDB (`audit:chain:{reportID}`)
5. Chain tip stored at `audit:last_hash` for integrity verification

### URL Filtering

Operator-defined allowlist/denylist per node:

- **Allowed domains:** whitelist (empty = allow all)
- **Blocked domains:** blacklist specific domains
- **Blocked prefixes:** blacklist URL prefixes (e.g., `https://malware.example/`)
- Applied at gossip ingestion, seed routing, and crawl callbacks

### Reputation-Weighted Search

Results from peers are ranked using tier-based multipliers (see Graduated Trust Tiers above). The `PeerTierFn` callback in the search ranker maps peer IDs to tiers, and each tier has a fixed multiplier applied during re-ranking. This replaces the old linear trust scaling with a cleaner graduated response.

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

**BadgerDB key prefixes:**
- `queue:{timestamp}:{url}` → CrawlTask JSON (URL frontier)
- `link:{source}:{target}` → backlink graph edges (PageRank)
- `trust:score:{peerID}` → peer trust scores
- `trust:report:{reportID}` → spam report records
- `trust:domvotes:{domain}` → consensus domain vote data
- `trust:quarantine:{peerID}` → quarantined peer records
- `dedup:fp:{hash}` → persistent content fingerprints
- `audit:chain:{reportID}` → audit trail entries
- `audit:last_hash` → chain tip hash
- `fleet:node:{peerID}` → fleet node records
- `entity:{type}:{name}` → named entity records (knowledge graph)
- `entity_rel:{name1}:{name2}` → entity relationship edges
- `trend:crawl:{domain}:{hour}` → hourly crawl counters per domain
- `trend:query:{term}:{hour}` → hourly query counters per term
- `trend:avg:{kind}:{name}` → moving average baselines for spike detection
- `click:{query}:{url}` → click-through records (query, URL, count)
- `click_pos:{query}:{url}` → click position tracking for learn-to-rank
- `ltr:model` → serialized learn-to-rank model (gradient-boosted decision stumps)
- `cluster:{id}` → document topic cluster data
- `vec:{docID}` → TF-IDF embedding vectors (384-dim float32)
- `vecmeta:{docID}` → embedding metadata (domain, timestamp)
- General KV operations for metadata

**Bleve stores:**
- Full-text index with custom English analyzer (or horizontal shards at `bleve/shard-{N}/`)
- All indexed document fields including image_text, structured_text, schema_type

---

## Package Dependency Graph

```
cmd/doogle/main.go
  └─ internal/node
       ├─ internal/p2p
       │    ├─ libp2p (host, dht, pubsub, mdns, routing discovery)
       │    ├─ pow.go (hashcash proof-of-work)
       │    └─ internal/models
       ├─ internal/crawler
       │    ├─ goquery
       │    ├─ structured.go (Schema.org JSON-LD + microdata)
       │    ├─ docfetch.go (PDF, plain text, CSV, markdown, XML)
       │    ├─ internal/store
       │    ├─ internal/models
       │    └─ pkg/urlutil
       ├─ internal/indexer
       │    ├─ internal/index
       │    ├─ verify.go (Ed25519 content verification)
       │    ├─ summarizer.go (TextRank extractive summarization)
       │    └─ internal/models
       ├─ internal/index
       │    ├─ bleve/v2
       │    ├─ horizontal_shard.go (domain-based FNV sharding)
       │    ├─ rebalancer.go (hash ring topology change detection)
       │    ├─ embedder.go (384-dim TF-IDF feature-hashing embedder)
       │    ├─ multilingual.go (cross-lingual dictionary expansion, 9 languages)
       │    ├─ vector_store.go (BadgerDB-backed embedding storage + cosine search)
       │    ├─ hybrid_search.go (BM25 + vector RRF fusion)
       │    └─ pkg/consistent
       ├─ internal/search
       │    ├─ internal/index
       │    ├─ internal/p2p
       │    ├─ entity_card.go (entity query detection → knowledge cards)
       │    ├─ ltr.go (learn-to-rank: gradient-boosted decision stumps)
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
            ├─ trust_store.go (trust scores, reports, consensus votes)
            ├─ entity_store.go (knowledge graph entity persistence)
            ├─ trend_store.go (hourly-bucketed trend counters + spike detection)
            ├─ click_store.go (click-through tracking for learn-to-rank)
            ├─ cluster_store.go (topic cluster persistence)
            └─ internal/models
```
