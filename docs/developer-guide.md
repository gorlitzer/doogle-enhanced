# Developer Guide

This guide is for contributors working on the Doogle v2 codebase. It covers the code structure, how to build and test, how components interact, and conventions to follow.

---

## Table of Contents

- [Setup](#setup)
- [Project Layout](#project-layout)
- [Package Overview](#package-overview)
- [Data Flow](#data-flow)
- [Adding a New Feature](#adding-a-new-feature)
- [Key Interfaces](#key-interfaces)
- [P2P Protocol Development](#p2p-protocol-development)
- [Testing](#testing)
- [Code Conventions](#code-conventions)
- [Common Tasks](#common-tasks)

---

## Setup

```bash
# Clone and build
git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
go mod tidy
make build

# Run tests
make test

# Run linter
make lint

# Run two nodes locally (two terminals) — they discover each other via DHT automatically
make run                                           # Terminal 1 — node on :7001/:7002
make run ARGS='--port 7003 --api-port 7004 --data-dir ./data/node2'   # Terminal 2
```

---

## Project Layout

```
doogle-v2/
├── cmd/doogle/main.go          # Entry point — node mode + search subcommand
├── internal/                   # Private packages (not importable by external code)
│   ├── node/                   # Orchestrator — wires all subsystems together
│   │   ├── node.go             # Node struct, init(), Run(), Shutdown(), Status()
│   │   ├── config.go           # Config types, YAML loading, CLI flag parsing
│   │   ├── fleet.go            # Fleet init (coordinator/worker setup)
│   │   └── identity.go         # Ed25519 key generation and persistence
│   ├── p2p/                    # libp2p networking layer
│   │   ├── host.go             # Host creation (TCP, QUIC, Noise, NAT)
│   │   ├── discovery.go        # Kademlia DHT + IPFS routing discovery + mDNS peer discovery
│   │   ├── gossip.go           # GossipSub pub/sub (URL frontier topic)
│   │   ├── protocols.go        # Protocol ID constants
│   │   ├── search_protocol.go  # /doogle/search/1.0.0 stream handler + client
│   │   ├── crawl_protocol.go   # /doogle/crawl/1.0.0 stream handler
│   │   ├── index_protocol.go   # /doogle/index/1.0.0 stream handler
│   │   ├── fleet_heartbeat_protocol.go  # /doogle/fleet/heartbeat/1.0.0
│   │   └── fleet_proxy_protocol.go      # /doogle/fleet/proxy/1.0.0
│   ├── crawler/                # Web crawling engine
│   │   ├── crawler.go          # Worker pool, fetch logic, HTTP client
│   │   ├── scheduler.go        # URL frontier (in-memory + persistent queue)
│   │   ├── rate_limiter.go     # Per-domain rate limiting
│   │   ├── robots.go           # robots.txt parser and cache
│   │   └── extractor.go        # HTML content + link extraction (goquery)
│   ├── indexer/                # Document processing pipeline
│   │   ├── indexer.go          # Main pipeline: dedup → score → store
│   │   ├── analyzer.go         # Text tokenization, keyword extraction
│   │   ├── scorer.go           # Quality and spam scoring (12 signals)
│   │   ├── duplicate.go        # Content fingerprinting (shingling)
│   │   ├── pagerank.go         # PageRank computation on backlink graph
│   │   ├── domain_authority.go # Domain authority (site-level reputation scoring)
│   │   ├── url_signals.go      # URL quality scoring (path depth, readability, tracking)
│   │   ├── batch_indexer.go    # Batched Bleve writes with flush interval
│   │   └── trust_manager.go    # Peer trust scoring and quarantine logic
│   ├── index/                  # Full-text search index
│   │   ├── store.go            # Store interface (Search, Index, DocCount, Close)
│   │   ├── bleve_store.go      # Bleve implementation with custom analyzer + 15 language stemmers
│   │   ├── document.go         # IndexDocument model (implements bleve.Classifier)
│   │   ├── query_builder.go    # ParsedQuery → Bleve query tree (AND/OR/NOT, lang analyzer)
│   │   └── shard.go            # Consistent hash ring for domain → node mapping

│   ├── search/                 # Search engines
│   │   ├── engine.go           # Local search against Bleve
│   │   ├── distributed.go      # Fan-out to peers + merge results + cache
│   │   ├── cache.go            # LRU + TTL search result cache
│   │   ├── ranker.go           # 12-signal re-ranking with intent awareness
│   │   ├── query.go            # Query parsing, synonyms (boolean operators, phrases, site/lang)
│   │   ├── intent.go           # Query intent classification (navigational/informational/transactional/local)
│   │   ├── diversity.go        # Domain diversity (max N per domain in top K)
│   │   ├── snippets.go         # Passage-based snippet extraction with term highlights
│   │   └── spelling.go         # Spell checker (Damerau-Levenshtein, index dictionary)
│   ├── fleet/                  # Fleet coordinator/worker management
│   │   ├── coordinator.go      # Coordinator: heartbeat handler, proxy, staleness loop
│   │   ├── worker.go           # Worker: heartbeat sender, proxy handler
│   │   ├── secret.go           # HMAC-SHA256 signing, fleet secret management
│   │   └── models.go           # FleetNode, FleetSummary, HeartbeatRequest, etc.
│   ├── api/                    # HTTP layer
│   │   ├── server.go           # Chi router, embedded static files, server lifecycle
│   │   ├── handlers.go         # /api/search, /api/status, /api/crawl, update endpoints
│   │   ├── fleet_handlers.go   # /api/fleet/* endpoints (coordinator only)
│   │   └── middleware.go       # Request logging, bearer auth
│   ├── updater/                # Shared GitHub release/update logic
│   │   └── updater.go          # ResolveToken, FetchLatestRelease, ApplyUpdate, etc.
│   ├── store/                  # Persistent storage
│   │   ├── badger.go           # BadgerDB wrapper (Get, Set, Has, Delete)
│   │   ├── url_store.go        # URL queue + seen set (wraps BadgerDB)
│   │   ├── link_store.go       # Backlink graph edges for PageRank
│   │   ├── fleet_store.go      # Fleet node persistence (BadgerDB)
│   │   ├── dedup_store.go      # Persistent URL deduplication (SHA-256 keyed)
│   │   ├── content_store.go    # Content hash tracking for incremental reindex
│   │   ├── generation_store.go # Monotonic generation counter for score freshness
│   │   └── trust_store.go      # Peer trust scores and report persistence
│   └── models/                 # Shared data types
│       ├── document.go         # Document, Link
│       ├── crawl_task.go       # CrawlTask, URLAnnouncement
│       └── search.go           # SearchRequest, SearchResponse, NodeStatus
├── pkg/                        # Public utility packages (importable)
│   ├── consistent/ring.go      # Consistent hash ring
│   └── urlutil/normalize.go    # URL normalization, resolution, filtering
├── web/
│   ├── embed.go                # embed.FS declaration for static files
│   └── static/index.html       # Search frontend (HTML/CSS/JS)
├── configs/default.yaml        # Default YAML config
├── docs/                       # Documentation
├── test/integration/           # Multi-node integration tests
├── Makefile                    # Build targets
└── go.mod                      # Module definition and dependencies
```

---

## Package Overview

### `internal/node` — The Orchestrator

This is the only package that imports all others. It creates every subsystem in `init()`, wires callbacks between them, and manages the full lifecycle.

**Key patterns:**
- `node.New(cfg)` creates everything but doesn't start goroutines
- `node.Run()` starts the crawler, gossip loop, and HTTP server
- `node.Shutdown()` tears down in reverse order
- `onDocumentCrawled()` is the central callback — it connects the crawler to the indexer and gossip

### `internal/p2p` — Networking

Thin wrappers around libp2p. Each file is focused on one concern.

**Key pattern:** Protocol handlers are registered via `Register*Protocol(host, handlerFunc)`. The handler receives a typed Go struct (not raw bytes) — JSON marshaling is handled internally.

**Discovery:** `discovery.go` manages three discovery mechanisms: (1) Kademlia DHT for peer routing, (2) IPFS public DHT routing discovery for automatic zero-config peer finding via raw `RoutingDiscovery` with a 30s polling interval, and (3) mDNS for LAN discovery. The `DiscoveryConfig` struct controls all discovery settings. `StartAdvertising()` and `StartFindingPeers()` are called from `node.Run()` to begin the DHT discovery loop.

### `internal/crawler` — Web Crawling

Standalone crawl engine. Has no knowledge of P2P or indexing — it just calls a callback.

**Key pattern:** `crawler.New()` takes an `OnDocumentCrawled` callback. The node provides this callback to wire crawling to indexing and gossip. This keeps the crawler testable in isolation.

### `internal/indexer` — Document Processing

Receives `models.Document`, applies scoring and dedup, writes to `index.Store`.

**Key pattern:** The indexer is stateless except for the duplicate detector's fingerprint cache. All scoring is pure functions of the document content.

### `internal/index` — Full-Text Index

The `Store` interface abstracts the index backend. `BleveStore` is the implementation.

**Key pattern:** The interface has 4 methods — `Index`, `Search`, `DocCount`, `Close`. This makes it easy to swap backends or write test doubles.

### `internal/search` — Query Execution

Multiple layers: `Engine` (local-only), `DistributedSearch` (local + peers + cache), `SearchCache` (LRU+TTL), `SpellChecker` (Damerau-Levenshtein against index dictionary), and intent classification. The distributed search checks the cache first, then uses the local engine and fans out to peers. Query parsing handles boolean operators (`-exclude`, uppercase `OR`), phrases, `site:`, `lang:` filters, and synonym expansion (100+ bidirectional pairs). Intent classification (navigational/informational/transactional/local) adjusts ranking weights per query. Domain diversity caps max 2 results per domain in top 10. Passage-based snippet extraction scores sentences by query term coverage.

### `internal/fleet` — Fleet Management

Coordinator/worker architecture for multi-node deployments. Entirely opt-in (default role is `standalone`, no code runs).

**Key types:**
- `Coordinator` — receives heartbeats, tracks worker status, proxies HTTP requests through libp2p
- `Worker` — sends heartbeats, handles proxy requests by forwarding to local API
- `secret.go` — HMAC-SHA256 signing/verification, fleet secret generation, API token derivation

**Key pattern:** The fleet store uses an interface so coordinators can be tested with in-memory mocks. All messages are HMAC-signed and timestamp-checked for replay protection.

### `internal/api` — HTTP Layer

Stateless handlers that delegate to `search.DistributedSearch` and `node.Status()`.

**Key pattern:** `api.Deps` struct is injected at creation — handlers don't import node or crawler directly. Fleet handlers are conditionally mounted only when `deps.FleetAPIToken != ""` (coordinator mode).

---

## Data Flow

### Crawl → Index → Search

```
1. URL enters the system (seed CLI flag, POST /api/crawl, or GossipSub)
         │
         ▼
2. scheduler.Schedule(task)  ── deduplicate against seen set
         │
         ▼
3. Crawler worker picks task from scheduler
         │
         ▼
4. crawler.fetch(url):
   a. Check robots.txt
   b. Rate limit
   c. HTTP GET
   d. Parse HTML (goquery)
   e. Extract title, description, content, links
   f. Return (Document, discoveredURLs)
         │
         ▼
5. node.onDocumentCrawled(doc, discoveredURLs):
   a. indexer.Index(doc)          → dedup → score → Bleve write
   b. Schedule discovered URLs    → back to step 2
   c. gossip.Publish(URLs)        → broadcast to peers
         │
         ▼
6. Peer receives GossipSub message → schedules URLs → step 2
```

### Search

```
1. GET /api/search?q=query
         │
         ▼
2. distributed.Search(req):
   a. localEngine.Search(req)     → parse → synonyms → intent → Bleve BM25 → snippets → re-rank
   b. For each connected peer:
      └─ p2p.QueryPeer()          → open stream → send request → read response
   c. Merge all results
   d. Classify intent (navigational/informational/transactional/local)
   e. Re-rank with intent-aware 12-signal scoring
   f. Deduplicate by URL
   g. Apply domain diversity (max 2 per domain in top 10)
   h. Generate spelling suggestion if applicable
   i. Return paginated results with intent and suggestion
```

---

## Adding a New Feature

### Adding a new API endpoint

1. Add the handler function in `internal/api/handlers.go`:

```go
func MyHandler(deps *Deps) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // ...
        writeJSON(w, http.StatusOK, result)
    }
}
```

2. Register the route in `internal/api/server.go`:

```go
r.Route("/api", func(r chi.Router) {
    // existing routes...
    r.Get("/my-endpoint", MyHandler(deps))
})
```

3. If you need new dependencies, add them to the `Deps` struct.

### Adding a new P2P protocol

1. Add the protocol ID in `internal/p2p/protocols.go`:

```go
const MyProtocol protocol.ID = "/doogle/my-feature/1.0.0"
```

2. Create `internal/p2p/my_protocol.go`:

```go
type MyHandler func(msg *MyMessage) error

func RegisterMyProtocol(h host.Host, handler MyHandler) {
    h.SetStreamHandler(MyProtocol, func(s network.Stream) {
        defer s.Close()
        // Read JSON from stream, call handler, write response
    })
}
```

3. Register it in `internal/node/node.go` inside `init()`.

### Adding a new scoring signal

1. Add the scoring logic in `internal/indexer/scorer.go`:

```go
func (s *Scorer) myNewScore(doc *models.Document) float64 {
    // ...
}
```

2. Integrate it into `qualityScore()` or `spamScore()`.

### Adding a new storage key

Use BadgerDB directly via `internal/store/badger.go`. The key convention is `prefix:identifier`:

```go
key := "mystuff:" + id
store.Set([]byte(key), data)
```

---

## Key Interfaces

### `index.Store`

```go
type Store interface {
    Index(doc *IndexDocument) error
    Search(query string, offset, limit int) ([]SearchHit, int, error)
    DocCount() (uint64, error)
    Close() error
}
```

The only full-text index abstraction. `BleveStore` implements it. To add a new backend (e.g., SQLite FTS5), implement this interface.

### `crawler.OnDocumentCrawled`

```go
type OnDocumentCrawled func(doc *models.Document, discoveredURLs []string)
```

Callback from the crawler to the node. This is the main integration point — it triggers indexing, URL scheduling, and gossip.

### P2P handler types

```go
type SearchHandler   func(req *models.SearchRequest) (*models.SearchResponse, error)
type CrawlTaskHandler func(task *models.CrawlTask) error
type IndexDocHandler  func(doc *models.Document) error
```

Each protocol handler receives a deserialized Go struct and returns a typed response.

---

## P2P Protocol Development

### Message Format

All P2P protocols use **JSON + newline** over libp2p streams:

```
→ Request:  JSON bytes + '\n'
← Response: JSON bytes + '\n'
```

This is simple, debuggable, and sufficient for Phase 1. Phase 2 can migrate to protobuf if needed.

### Stream Lifecycle

```go
// Client side
s, err := host.NewStream(ctx, peerID, MyProtocol)
defer s.Close()
s.Write(requestJSON + "\n")
s.CloseWrite()                    // Signal end of request
reader.ReadBytes('\n')            // Read response
```

```go
// Server side (registered handler)
h.SetStreamHandler(MyProtocol, func(s network.Stream) {
    defer s.Close()
    data, _ := reader.ReadBytes('\n')    // Read request
    // process...
    s.Write(responseJSON + "\n")         // Write response
})
```

### Testing Protocols

Use libp2p's in-memory transport for unit tests:

```go
// Create two in-memory hosts
h1, _ := libp2p.New(libp2p.ListenAddrStrings("/ip4/127.0.0.1/tcp/0"))
h2, _ := libp2p.New(libp2p.ListenAddrStrings("/ip4/127.0.0.1/tcp/0"))

// Connect them
h1.Connect(ctx, peer.AddrInfo{ID: h2.ID(), Addrs: h2.Addrs()})

// Register handler on h2, call from h1
```

---

## Testing

### Run All Tests

```bash
make test
# or
go test ./... -v
```

### Unit Tests

Each package should have `*_test.go` files testing its public API in isolation. Key packages to test:

- `pkg/urlutil` — URL normalization, filtering
- `pkg/consistent` — Hash ring behavior
- `internal/indexer` — Scoring, dedup
- `internal/crawler` — Extraction, rate limiter
- `internal/search` — Query parsing, ranking

### Integration Tests

The `test/integration/` directory is for multi-node tests. Pattern:

```go
func TestThreeNodeSearch(t *testing.T) {
    // 1. Create 3 in-process nodes on different ports
    // 2. Connect them via bootstrap
    // 3. Seed a URL on node 1
    // 4. Wait for crawl + index
    // 5. Search from node 3
    // 6. Assert results contain content from node 1
}
```

### Manual Smoke Test

```bash
# Terminal 1 — bootstrap node
./bin/doogle --port 7001 --api-port 7002 --seed "https://example.com" --data-dir ./data/node1

# Terminal 2 — second node
./bin/doogle --port 7003 --api-port 7004 --data-dir ./data/node2 \
  --bootstrap /ip4/127.0.0.1/tcp/7001/p2p/<PEER_ID>

# Wait 10-15 seconds, then:
curl "http://localhost:7004/api/search?q=example"
# Should return results crawled by node 1
```

---

## Code Conventions

### Go Style

- Follow standard Go conventions (`gofmt`, `go vet`)
- Use `internal/` for private packages, `pkg/` for reusable utilities
- Errors: wrap with `fmt.Errorf("context: %w", err)`
- Logging: use `log/slog` (with tint for colored console output). Levels: `slog.Debug`, `slog.Info`, `slog.Warn`, `slog.Error`. Include structured key-value pairs: `slog.Info("crawled", "url", url, "depth", depth)`
- Context: pass `context.Context` for cancellation

### Naming

- Packages: lowercase, single word (`crawler`, `indexer`, `store`)
- Interfaces: in the consumer package, not the provider
- Constructors: `New*()` returns the struct, error
- Methods: verb-first (`AddSeed`, `HasSeen`, `IsOwner`)

### File Organization

- One struct per file when the struct is large (e.g., `crawler.go`, `node.go`)
- Group related small types in one file (e.g., `models/search.go`)
- Keep `*_test.go` next to the code it tests

### Dependencies

- Minimize cross-package imports within `internal/`
- The `node` package is the only one that imports everything
- `models` is imported by most packages — keep it free of business logic
- `pkg/` packages must not import `internal/`

---

## Common Tasks

### Add a new dependency

```bash
go get github.com/some/package
go mod tidy
```

### Regenerate protobuf (when proto/ files are added)

```bash
make proto
```

Requires `protoc` and `protoc-gen-go`.

### Build for a different platform

```bash
GOOS=linux GOARCH=amd64 go build -o bin/doogle-linux ./cmd/doogle
GOOS=windows GOARCH=amd64 go build -o bin/doogle.exe ./cmd/doogle
```

### Profile performance

```go
import _ "net/http/pprof"
// pprof is available at http://localhost:7002/debug/pprof/
```

### Reset local data

```bash
rm -rf ./data/doogle/badger ./data/doogle/bleve
```

### View BadgerDB contents (debugging)

Use the `badger` CLI tool:

```bash
go install github.com/dgraph-io/badger/v4/badger@latest
badger info --dir ./data/doogle/badger
```
