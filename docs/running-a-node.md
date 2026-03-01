# Running a Node

This guide covers everything you need to run a Doogle v2 node — from installation to production deployment.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Starting a Node](#starting-a-node)
- [Joining a Network](#joining-a-network)
- [Configuration](#configuration)
- [Configuration File](#configuration-file)
- [Network Topologies](#network-topologies)
- [Monitoring](#monitoring)
- [Data Management](#data-management)
- [Troubleshooting](#troubleshooting)

---

## Requirements

- **Go 1.22+** (for building from source)
- **OS:** Linux, macOS, or Windows
- **Ports:** One port for libp2p (default `4001` TCP+UDP), one for the HTTP API (default `8080`)
- **Disk:** ~100MB minimum; grows with the number of indexed pages
- **RAM:** ~128MB minimum; scales with crawl worker count and index size

---

## Installation

### From Source

```bash
git clone https://github.com/doogle/doogle-v2.git
cd doogle-v2
go mod tidy
make build
```

The binary is at `bin/doogle`.

### Verify

```bash
./bin/doogle --help
```

---

## Starting a Node

### Minimal Start

```bash
./bin/doogle
```

This starts a node with default settings:
- libp2p on port `4001` (TCP + QUIC)
- HTTP API on port `8080`
- Data stored in `./data/doogle/`
- mDNS enabled (finds peers on your local network automatically)
- No seed URLs (the node waits for peers or manual crawl requests)

### With Seed URLs

```bash
./bin/doogle --seed "https://example.com"
```

The node immediately starts crawling the seed URL and any links it discovers (up to `max_depth` 3 levels deep).

Multiple seeds:

```bash
./bin/doogle --seed "https://example.com,https://golang.org,https://news.ycombinator.com"
```

### Custom Ports

```bash
./bin/doogle --port 5001 --api-port 9090
```

### Custom Data Directory

```bash
./bin/doogle --data-dir /var/lib/doogle
```

The node stores its identity key, BadgerDB, and Bleve index here. This directory is created automatically.

---

## Joining a Network

### Using Bootstrap Peers

To join an existing network, you need the **multiaddr** of at least one running node. A node prints its multiaddr at startup:

```
libp2p host started: 12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
  listening on: /ip4/192.168.1.100/tcp/4001/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
  listening on: /ip4/192.168.1.100/udp/4001/quic-v1/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
```

Connect to it:

```bash
./bin/doogle --bootstrap /ip4/192.168.1.100/tcp/4001/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
```

### Using mDNS (Local Network)

If both nodes are on the same LAN, they find each other automatically via mDNS. No bootstrap needed. Just start both:

```bash
# Terminal 1
./bin/doogle --api-port 8080 --data-dir ./data/node1

# Terminal 2
./bin/doogle --port 4002 --api-port 8081 --data-dir ./data/node2
```

You'll see:

```
mDNS: discovered peer 12D3KooWAbc...
```

### Multi-Node Local Setup

For development and testing, run multiple nodes on one machine:

```bash
# Node 1 — bootstrap node
./bin/doogle --port 4001 --api-port 8080 --data-dir ./data/node1 \
  --seed "https://example.com"

# Node 2 — connects to node 1
./bin/doogle --port 4002 --api-port 8081 --data-dir ./data/node2 \
  --bootstrap /ip4/127.0.0.1/tcp/4001/p2p/<PEER_ID_OF_NODE_1>

# Node 3 — connects to node 1
./bin/doogle --port 4003 --api-port 8082 --data-dir ./data/node3 \
  --bootstrap /ip4/127.0.0.1/tcp/4001/p2p/<PEER_ID_OF_NODE_1>
```

Each node needs a unique `--port`, `--api-port`, and `--data-dir`.

Or use the Makefile with ARGS:

```bash
make run                                           # node 1: port 4001, API 8080
make run ARGS='--port 4002 --api-port 8081 --data-dir ./data/node2 --bootstrap /ip4/127.0.0.1/tcp/4001'   # node 2
```

---

## Configuration

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | — | Path to YAML config file |
| `--port` | `4001` | libp2p listen port (TCP and QUIC) |
| `--api-port` | `8080` | HTTP API and web UI port |
| `--data-dir` | `./data/doogle` | Where to store all persistent data |
| `--bootstrap` | — | Multiaddr of a bootstrap peer |
| `--seed` | — | Comma-separated seed URLs to crawl |
| `--workers` | `4` | Number of concurrent crawl workers |
| `--mdns` | `true` | Enable mDNS for LAN peer discovery |

### Precedence

1. Hardcoded defaults
2. YAML config file (if `--config` is set)
3. CLI flags (highest priority — override everything)

---

## Configuration File

Create a YAML config for persistent settings:

```yaml
# my-config.yaml

p2p:
  port: 4001
  bootstrap_peers:
    - /ip4/203.0.113.10/tcp/4001/p2p/12D3KooWAbc...
    - /ip4/198.51.100.5/tcp/4001/p2p/12D3KooWDef...
  mdns: true

api:
  port: 8080
  bind: "0.0.0.0"

crawler:
  workers: 8
  user_agent: "DoogleBot/2.0 (+https://github.com/doogle/doogle-v2)"
  request_timeout: 30s
  rate_limit: 10          # Requests per minute per domain
  max_depth: 3
  respect_robots: true

storage:
  data_dir: "/var/lib/doogle"
  badger_dir: "badger"

index:
  bleve_dir: "bleve"

search:
  max_results: 50
  default_page_size: 10
  peer_timeout: 5s
  max_peers: 10
```

Run with it:

```bash
./bin/doogle --config my-config.yaml
```

CLI flags can still override individual settings:

```bash
./bin/doogle --config my-config.yaml --workers 16 --api-port 9090
```

### Configuration Reference

#### `p2p`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `port` | int | `4001` | libp2p listen port |
| `bootstrap_peers` | []string | `[]` | Multiaddr list of known peers |
| `mdns` | bool | `true` | Enable mDNS LAN discovery |

#### `api`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `port` | int | `8080` | HTTP API port |
| `bind` | string | `"0.0.0.0"` | Bind address |

#### `crawler`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `workers` | int | `4` | Concurrent crawl goroutines |
| `user_agent` | string | `"DoogleBot/2.0 (...)"` | HTTP User-Agent header |
| `request_timeout` | duration | `30s` | Per-request timeout |
| `rate_limit` | int | `10` | Max requests per minute per domain |
| `max_depth` | int | `3` | Max link-follow depth from seed |
| `respect_robots` | bool | `true` | Obey robots.txt |

#### `storage`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `data_dir` | string | `"./data/doogle"` | Base directory for all persistent data |
| `badger_dir` | string | `"badger"` | BadgerDB subdirectory (relative to data_dir) |

#### `index`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `bleve_dir` | string | `"bleve"` | Bleve index subdirectory (relative to data_dir) |

#### `search`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `max_results` | int | `50` | Absolute max results per query |
| `default_page_size` | int | `10` | Default results per page |
| `peer_timeout` | duration | `5s` | How long to wait for each peer's response |
| `max_peers` | int | `10` | Max peers to query per search |
| `cache_size` | int | `1000` | LRU cache entries for search results (0 = disabled) |
| `cache_ttl` | duration | `5m` | How long cached results stay valid |

---

## Network Topologies

### Star (Development)

One bootstrap node, all others connect to it:

```
      Node 2
        │
Node 3 ─┼─ Node 1 (bootstrap)
        │
      Node 4
```

Simple, easy to set up. Node 1 going down doesn't break others (DHT persists routing info).

### Mesh (Production)

Each node bootstraps to multiple known peers:

```
Node 1 ──── Node 2
  │  \      / │
  │   \    /  │
  │    \  /   │
Node 3 ──── Node 4
```

More resilient. Configure multiple `bootstrap_peers` in the config.

### LAN-only (No Internet Bootstrap)

With mDNS enabled, nodes on the same network find each other automatically:

```bash
# Machine A
./bin/doogle --seed "https://intranet.company.com"

# Machine B (on the same LAN)
./bin/doogle
# → Automatically discovers Machine A via mDNS
```

---

## Monitoring

### Status Endpoint

```bash
curl http://localhost:8080/api/status
```

Response:

```json
{
  "peer_id": "12D3KooWPjce...",
  "addrs": [
    "/ip4/192.168.1.100/tcp/4001/p2p/12D3KooWPjce...",
    "/ip4/192.168.1.100/udp/4001/quic-v1/p2p/12D3KooWPjce..."
  ],
  "connected_peers": 3,
  "peer_list": ["12D3KooWAbc...", "12D3KooWDef...", "12D3KooWGhi..."],
  "indexed_docs": 1247,
  "crawled_urls": 1893,
  "urls_in_queue": 42,
  "uptime": "2h15m30s",
  "started_at": "2026-02-28T10:00:00Z"
}
```

### Web UI

Open `http://localhost:8080` in a browser. The bottom status bar shows real-time node info (refreshed every 10 seconds):

- Peer ID
- Number of indexed documents
- Number of crawled URLs
- Connected peer count

### Logs

The node logs to stdout. Key log lines:

```
node: peer ID = 12D3KooWPjce...                    # Identity
libp2p host started: 12D3KooWPjce...               # P2P ready
  listening on: /ip4/.../tcp/4001/p2p/...           # Multiaddr
mDNS: discovered peer 12D3KooWAbc...               # Peer found
crawler: starting 4 workers                         # Crawl begin
worker 0: crawled https://example.com (depth=0)     # Crawl success
indexer: indexed https://example.com (quality=0.75) # Indexed
api: listening on 0.0.0.0:8080                      # API ready
```

---

## Data Management

### Persistent Data

Everything is stored under `--data-dir` (default `./data/doogle/`):

```
data_dir/
├── node.key    # Ed25519 identity (DO NOT DELETE — this is your peer ID)
├── badger/     # URL queue, seen set, metadata
└── bleve/      # Full-text search index
```

### Identity

The `node.key` file is your persistent identity on the network. If you delete it, the node generates a new one — but other nodes will see you as a new peer.

### Reset

To start fresh (delete all crawled data but keep identity):

```bash
rm -rf ./data/doogle/badger ./data/doogle/bleve
```

To fully reset (new identity too):

```bash
rm -rf ./data/doogle
```

### Disk Usage

Approximate storage per 1,000 indexed pages:
- **BadgerDB:** ~5-20MB (metadata + URL queue)
- **Bleve index:** ~10-50MB (depends on content size)

---

## CLI Search

You can search from the command line without opening the web UI:

```bash
# Search a local node
./bin/doogle search "golang tutorial"

# JSON output (pipe-friendly)
./bin/doogle search --json "distributed systems" | jq '.results[].title'

# Search a remote node
./bin/doogle search --api http://192.168.1.100:8080 "privacy"

# Pagination
./bin/doogle search --page 1 --size 5 "web development"

# Boolean operators
./bin/doogle search "python OR ruby"
./bin/doogle search "golang -tutorial"
```

The CLI search requires a running Doogle node (local or remote).

---

## Troubleshooting

### "connection refused" when bootstrapping

Check that:
1. The bootstrap node is running
2. The port matches (`--port` on the bootstrap node)
3. The peer ID in the multiaddr is correct
4. No firewall blocking the port

### Nodes not discovering each other

- On the same LAN? Ensure `--mdns true` (default).
- Different networks? You must use `--bootstrap` with a reachable multiaddr.
- Check that libp2p ports are open (TCP and UDP).

### No search results

- Check `/api/status` — are there indexed documents?
- Make sure seed URLs are valid and return HTML.
- Check logs for crawl errors (`worker N: fetch failed`).
- robots.txt may be blocking the crawler.

### High memory usage

- Reduce `--workers` (fewer concurrent crawlers)
- The Bleve index grows with document count — this is expected
- BadgerDB performs garbage collection automatically

### Port already in use

```bash
# Use different ports
./bin/doogle --port 5001 --api-port 9090
```
