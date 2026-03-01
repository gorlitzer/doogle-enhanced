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
git clone https://github.com/doogle/doogle-v2.git
cd doogle-v2
go mod tidy
make build

# Run tests
make test

# Run linter
make lint

# Run two nodes locally (two terminals)
make run                                           # Terminal 1 — node on :7001/:7002
make run ARGS='--port 7003 --api-port 7004 --data-dir ./data/node2 --bootstrap /ip4/127.0.0.1/tcp/7001'   # Terminal 2
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
│   │   └── identity.go         # Ed25519 key generation and persistence
│   ├── p2p/                    # libp2p networking layer
│   │   ├── host.go             # Host creation (TCP, QUIC, Noise, NAT)
│   │   ├── discovery.go        # Kademlia DHT + mDNS peer discovery
│   │   ├── gossip.go           # GossipSub pub/sub (URL frontier topic)
│   │   ├── protocols.go        # Protocol ID constants
│   │   ├── search_protocol.go  # /doogle/search/1.0.0 stream handler + client
│   │   ├── crawl_protocol.go   # /doogle/crawl/1.0.0 stream handler
│   │   └── index_protocol.go   # /doogle/index/1.0.0 stream handler
│   ├── crawler/                # Web crawling engine
│   │   ├── crawler.go          # Worker pool, fetch logic, HTTP client
│   │   ├── scheduler.go        # URL frontier (in-memory + persistent queue)
│   │   ├── rate_limiter.go     # Per-domain rate limiting
│   │   ├── robots.go           # robots.txt parser and cache
│   │   └── extractor.go        # HTML content + link extraction (goquery)
│   ├── indexer/                # Document processing pipeline
│   │   ├── indexer.go          # Main pipeline: dedup → score → store
│   │   ├── analyzer.go         # Text tokenization, keyword extraction
│   │   ├── scorer.go           # Quality and spam scoring
│   │   └── duplicate.go        # Content fingerprinting (shingling)
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
│   │   ├── ranker.go           # Multi-signal re-ranking (BM25, quality, PageRank, freshness)
│   │   └── query.go            # Query parsing (boolean operators, phrases, site/lang filters)
│   ├── api/                    # HTTP layer
│   │   ├── server.go           # Chi router, embedded static files, server lifecycle
│   │   ├── handlers.go         # /api/search, /api/status, /api/crawl
│   │   └── middleware.go       # Request logging
│   ├── store/                  # Persistent storage
│   │   ├── badger.go           # BadgerDB wrapper (Get, Set, Has, Delete)
│   │   └── url_store.go        # URL queue + seen set (wraps BadgerDB)
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

Three layers: `Engine` (local-only), `DistributedSearch` (local + peers + cache), and `SearchCache` (LRU+TTL). The distributed search checks the cache first, then uses the local engine and fans out to peers. Query parsing handles boolean operators (`-exclude`, uppercase `OR`), phrases, `site:`, `lang:` filters, and synonym expansion.

### `internal/api` — HTTP Layer

Stateless handlers that delegate to `search.DistributedSearch` and `node.Status()`.

**Key pattern:** `api.Deps` struct is injected at creation — handlers don't import node or crawler directly.

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
   a. localEngine.Search(req)     → Bleve BM25 query
   b. For each connected peer:
      └─ p2p.QueryPeer()          → open stream → send request → read response
   c. Merge all results
   d. Re-rank: score × (1 + quality × 0.5)
   e. Deduplicate by URL
   f. Return paginated results
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
- Logging: use `log.Printf` (no external logger for now)
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
