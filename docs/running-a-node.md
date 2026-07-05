# Running a Node

This guide covers everything you need to run a Doogle v2 node — from installation to production deployment.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Starting a Node](#starting-a-node)
- [Joining a Network](#joining-a-network)
- [Configuration](#configuration)
- [Configuring SearXNG](#configuring-searxng)
- [Network Topologies](#network-topologies)
- [Monitoring](#monitoring)
- [Data Management](#data-management)
- [Troubleshooting](#troubleshooting)

---

## Requirements

- **Go 1.22+** (for building from source)
- **OS:** Linux, macOS, Windows, or Android (via Termux)
- **Ports:** One port for libp2p (default `7001` TCP+UDP), one for the HTTP API (default `7002`)
- **Disk:** ~100MB minimum; grows with the number of indexed pages
- **RAM:** ~128MB minimum; scales with crawl worker count and index size

---

## Installation

### From Source

```bash
git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
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
- libp2p on port `7001` (TCP + QUIC)
- HTTP API on port `7002`
- Data stored in `./data/doogle/`
- DHT discovery enabled (automatically finds other Doogle nodes on the internet via IPFS public DHT)
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

### Light Node

```bash
./bin/doogle --light
```

A light node connects to the P2P network and relays search queries to full nodes, but does not crawl or index content. This keeps resource usage low (~50 MB RAM) — ideal for edge devices or when you only need search access.

### Custom Data Directory

```bash
./bin/doogle --data-dir /var/lib/doogle
```

The node stores its identity key, BadgerDB, and Bleve index here. This directory is created automatically.

---

## Joining a Network

### Automatic Discovery (Default — No Config Needed)

By default, every Doogle node connects to the IPFS public DHT bootstrap nodes and advertises itself under the rendezvous namespace `doogle/network/v2`. Other Doogle nodes doing the same will find each other automatically within 30–60 seconds.

Just start two nodes anywhere on the internet:

```bash
# Machine A (anywhere)
./bin/doogle --data-dir ./data/node1

# Machine B (anywhere else)
./bin/doogle --port 7003 --api-port 7004 --data-dir ./data/node2
```

No `--bootstrap` flag needed. You'll see in the logs:

```
DHT discovery: connecting to 5 IPFS bootstrap peers...
DHT discovery: connected to 4/5 IPFS bootstrap peers
DHT discovery: advertising as "doogle/network/v2"
DHT discovery: connected to Doogle peer 12D3KooWAbc...
```

To disable automatic DHT discovery (e.g., for air-gapped or private networks):

```bash
./bin/doogle --dht-discovery=false
```

### Using Bootstrap Peers (Manual)

For faster initial connection or private networks, you can manually specify a bootstrap peer. A node prints its multiaddr at startup:

```
libp2p host started: 12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
  listening on: /ip4/192.168.1.100/tcp/7001/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
  listening on: /ip4/192.168.1.100/udp/7001/quic-v1/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
```

Connect to it:

```bash
./bin/doogle --bootstrap /ip4/192.168.1.100/tcp/7001/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
```

### Using mDNS (Local Network)

If both nodes are on the same LAN, they find each other automatically via mDNS. No bootstrap needed. Just start both:

```bash
# Terminal 1
./bin/doogle --api-port 7002 --data-dir ./data/node1

# Terminal 2
./bin/doogle --port 7003 --api-port 7004 --data-dir ./data/node2
```

You'll see:

```
mDNS: discovered peer 12D3KooWAbc...
```

### Multi-Node Local Setup

For development and testing, run multiple nodes on one machine:

```bash
# Node 1 — bootstrap node
./bin/doogle --port 7001 --api-port 7002 --data-dir ./data/node1 \
  --seed "https://example.com"

# Node 2 — connects to node 1
./bin/doogle --port 7003 --api-port 7004 --data-dir ./data/node2 \
  --bootstrap /ip4/127.0.0.1/tcp/7001/p2p/<PEER_ID_OF_NODE_1>

# Node 3 — connects to node 1
./bin/doogle --port 7005 --api-port 7006 --data-dir ./data/node3 \
  --bootstrap /ip4/127.0.0.1/tcp/7001/p2p/<PEER_ID_OF_NODE_1>
```

Each node needs a unique `--port`, `--api-port`, and `--data-dir`.

Or use the Makefile with ARGS:

```bash
make run                                           # node 1: port 7001, API 7002
make run ARGS='--port 7003 --api-port 7004 --data-dir ./data/node2 --bootstrap /ip4/127.0.0.1/tcp/7001'   # node 2
```

---

## Configuration

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | — | Path to YAML config file |
| `--name` | — | Human-readable node name shown in UI and to peers |
| `--port` | `7001` | libp2p listen port (TCP and QUIC) |
| `--api-port` | `7002` | HTTP API and web UI port |
| `--bind` | `127.0.0.1` | API server bind address. Loopback-only by default — see the security warning below before changing it |
| `--data-dir` | `./data/doogle` | Where to store all persistent data |
| `--bootstrap` | — | Multiaddr of a bootstrap peer |
| `--seed` | — | Comma-separated seed URLs to crawl |
| `--workers` | `4` | Number of concurrent crawl workers |
| `--mdns` | `true` | Enable mDNS for LAN peer discovery |
| `--dht-discovery` | `true` | Enable automatic peer discovery via IPFS public DHT |
| `--dht-client-mode` | `false` | Run the DHT in client-only mode to reduce how widely your node's IP is advertised (see Privacy below) |
| `--headless` | `false` | Enable headless browser rendering for JS-heavy pages |
| `--light` | `false` | Light node mode: search + relay only, no crawling or indexing |
| `--log-level` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `--fleet-role` | `coordinator` | Fleet mode: `coordinator` (fleet-ready), `worker`, `standalone` |
| `--fleet-coordinator` | — | Coordinator multiaddr (required for workers) |
| `--fleet-secret` | — | Shared fleet secret hex (auto-generated on coordinator) |
| `--searxng-url` | — | Custom SearXNG instance URL (overrides auto public instances) |
| `--ollama` | `false` | Enable neural embeddings via Ollama (auto-detects localhost:11434) |
| `--ollama-url` | — | Custom Ollama server URL (default http://localhost:11434) |
| `--ollama-model` | `all-minilm` | Ollama embedding model name |
| `--embedding-url` | — | Generic neural embedding server URL (for non-Ollama servers) |

All settings are controlled via CLI flags. Run `./bin/doogle --help` for the full list.

### 🔒 Privacy: your node reveals its IP address to peers

**Running a node on the public peer-to-peer network exposes your IP address. This is inherent to how P2P works and cannot be fully eliminated while you participate in the public network.** Be transparent with yourself about this before running a public node:

- **Peers you exchange data with see your IP.** To send you search results or receive crawl work, a peer must connect to your node — which reveals your IP address to that peer, by definition.
- **The DHT can publish your address.** By default the node runs as a DHT *server* (`ModeAutoServer`) when it's publicly reachable, which advertises your address into the shared IPFS DHT so other peers can find you.
- **UPnP/NAT-PMP may open a public port.** The node attempts to make itself directly reachable, which can map a port on your router to your machine.

**What you can do to reduce (not remove) exposure:**

- `--dht-client-mode` — run the DHT in client-only mode. Your node still finds peers, but it won't answer DHT queries or advertise itself as a server in other peers' routing tables, so its address is published less widely. Peers you actually exchange data with still learn your IP.
- Run behind a VPN or from a host whose IP you don't mind revealing.
- Don't run a public node from an IP you consider sensitive.

**What is *not* yet available:** onion routing (Tor) transport is a design goal (see the roadmap) but is **not implemented** — do not assume any anonymity today.

If you only want to search and never expose a node, you can run in a more limited mode, but any participation in the public network involves the trade-offs above. We'd rather state this plainly than let the "no tracking" framing imply network-level anonymity it doesn't provide.

### ⚠️ Security: exposing the API (`--bind`)

The API binds to `127.0.0.1` (loopback) by default. **Do not change this unless you understand the exposure.** The API server:

- Serves an **admin surface** (`/api/admin/*`) with **destructive, unauthenticated** operations — `DELETE /api/admin/data` wipes your index, `/api/admin/restore` writes arbitrary data, `/api/admin/update` swaps the running binary. These are gated to loopback + a Host-header allowlist only.
- Exposes **unauthenticated write endpoints** on `/api` (e.g. `/api/crawl`) over **plaintext HTTP**.

Binding to `0.0.0.0` (or a LAN IP) exposes all of this to every host that can reach the port. If you need remote access, put Doogle **behind a reverse proxy that terminates TLS and authenticates requests**, and firewall the raw port. The node logs a loud warning at startup when bound to a non-loopback address.

---

## Neural Semantic Search

By default, Doogle uses TF-IDF embeddings for vector search — good for keyword matching but lacks semantic understanding. For true semantic search ("automobile" finds "car"), connect a neural embedding model.

### Ollama (recommended)

If you have [Ollama](https://ollama.com) installed:

```bash
ollama pull all-minilm       # ~23MB one-time download
./bin/doogle --ollama        # auto-connects to localhost:11434
```

Custom Ollama setup:

```bash
./bin/doogle --ollama-url http://remote:11434 --ollama-model nomic-embed-text
```

### Generic embedding server

For non-Ollama servers (sentence-transformers, TEI, etc.):

```bash
./bin/doogle --embedding-url http://localhost:11411/embed
```

The server must accept `POST {"texts": ["..."]}` and return `{"embeddings": [[...]]}` with 384-dim vectors.

A reference Python server is included:

```bash
python scripts/embedding-server.py    # requires: pip install sentence-transformers flask
```

### Fallback behavior

If the embedding server is unreachable at startup, Doogle falls back to TF-IDF silently. If the connection drops mid-run, it switches to TF-IDF and retries in the background every 30 seconds.

---

## Configuring SearXNG

SearXNG is an open-source metasearch engine. Doogle uses it as a fallback when the native peer index has too few results, giving users immediate coverage even when the node is newly started or lightly seeded.

### Out-of-the-Box (No Setup Required)

SearXNG is **enabled by default** and uses curated public instances with automatic failover. Just start Doogle — external search results will appear alongside native P2P results without any configuration:

```bash
./bin/doogle
# SearXNG is already working via public instances
```

If a public instance is slow or rate-limited, Doogle automatically rotates to the next one.

### Custom Instance (Optional)

For more control or privacy, you can point Doogle at your own self-hosted SearXNG instance:

```bash
./bin/doogle --searxng-url http://localhost:8080
```

#### Running a Local SearXNG Instance

The quickest way is Docker:

```bash
docker run -d \
  --name searxng \
  -p 8080:8080 \
  -e SEARXNG_BASE_URL=http://localhost:8080 \
  searxng/searxng:latest
```

Verify it works:

```bash
curl "http://localhost:8080/search?q=test&format=json"
```

SearXNG must have JSON output enabled. In `searxng/settings.yml`, ensure:

```yaml
search:
  formats:
    - html
    - json
```

### Runtime Toggle

You can toggle SearXNG on or off at runtime without restarting the node:

```bash
# Switch to custom instance
curl -X POST http://localhost:7002/api/admin/searxng \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "url": "http://localhost:8080"}'

# Switch back to auto (public instances)
curl -X POST http://localhost:7002/api/admin/searxng \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "url": ""}'

# Disable entirely
curl -X POST http://localhost:7002/api/admin/searxng \
  -H "Content-Type: application/json" \
  -d '{"enabled": false, "url": ""}'
```

The Settings toggle in Admin > Actions shows the current mode (Auto/Custom) and the active instance URL.

### SearXNG Result Provenance

Results sourced from SearXNG are visually distinguished in the search UI with an amber provenance pill. The search meta row shows a SearXNG badge indicating how many external results were included. Native peer results always rank above SearXNG results with comparable scores due to the configurable `score_penalty`.

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

### Internet (DHT Discovery — Default)

With DHT discovery enabled (the default), nodes anywhere on the internet find each other through the IPFS public DHT. No manual bootstrap needed:

```bash
# Anywhere on the internet — nodes discover each other automatically
./bin/doogle --data-dir ./data/node1
./bin/doogle --port 7003 --api-port 7004 --data-dir ./data/node2
```

Nodes connect to IPFS bootstrap peers, advertise under `doogle/network/v2`, and find each other within 30–60 seconds.

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

### Quick Check (Terminal)

```bash
make status
```

This checks whether the Doogle node process is running and shows the PID, version, and helpful commands.

### Status Endpoint

```bash
curl http://localhost:7002/api/status
```

Response:

```json
{
  "peer_id": "12D3KooWPjce...",
  "version": "v0.2.0",
  "commit": "a1b2c3d",
  "build_date": "2026-03-01T12:00:00Z",
  "addrs": [
    "/ip4/192.168.1.100/tcp/7001/p2p/12D3KooWPjce...",
    "/ip4/192.168.1.100/udp/7001/quic-v1/p2p/12D3KooWPjce..."
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

Open `http://localhost:7002` in a browser. The bottom status bar shows real-time node info (refreshed every 10 seconds):

- Peer ID
- Number of indexed documents
- Number of crawled URLs
- Connected peer count

### Trust & Safety Dashboard

The **Trust** page (`#/trust`) provides full admin controls:

- **Overview:** Recent reports with dismiss/confirm actions, status badges
- **Peers:** All tracked peers with trust tier badges (trusted/warning/throttled/quarantined/banned)
- **Quarantined:** Quarantined peers with unquarantine button (disabled for permanently banned peers)
- **Domains:** Flagged and blocked domains with unblock button
- **Audit Trail:** Hash-chained, Ed25519-signed log of all trust actions with verification badges
- **Submit Report:** Report URLs as spam/malware/phishing

The **Network** page shows trust tiers per connected peer in both the peer table and the topology graph.

### Logs

The node logs to stdout using structured logging (`log/slog` with colored tint output). Key log lines:

```
15:04:05 INF node started peer_id=12D3KooWPjce...
15:04:05 INF libp2p host started peer_id=12D3KooWPjce...
15:04:05 INF listening addr=/ip4/.../tcp/7001/p2p/...
15:04:06 INF mDNS: discovered peer peer=12D3KooWAbc...
15:04:06 INF crawler: starting workers count=4
15:04:07 INF crawled url=https://example.com depth=0
15:04:07 INF indexed url=https://example.com quality=0.75
15:04:07 INF api: listening addr=0.0.0.0:7002
```

Control verbosity with `--log-level` (default `info`). Use `debug` for detailed diagnostics.

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

## Fleet Management (Multi-Node)

Every Doogle node is fleet-ready by default — it runs as a coordinator out of the box. If you never add workers, it behaves like a normal node with zero overhead.

Your node generates two fleet values at startup:
1. **Fleet secret** — a 256-bit hex string (saved to `data/fleet.secret`, printed to logs)
2. **API token** — derived from the secret, used for authenticating with the fleet dashboard

The API token is available from:
- **Admin > Actions > Fleet** section in the web UI (localhost access only)
- Terminal logs at startup
- Programmatically via `GET /api/status` (only returns the token for localhost requests — never exposed over the network)

### Adding a Worker

Workers need your node's multiaddr and fleet secret (from your logs, `data/fleet.secret`, or Admin > Actions > Fleet):

```bash
make run ARGS='--fleet-role worker \
  --fleet-coordinator /ip4/<YOUR_IP>/tcp/7001/p2p/<PEER_ID> \
  --fleet-secret <hex> \
  --name worker1 --port 7003 --api-port 7004 \
  --data-dir ./data/worker1'
```

Workers automatically:
- Bind their HTTP API to `127.0.0.1` (not reachable from the network)
- Send heartbeats to the coordinator every 15 seconds
- Accept proxied requests only from the coordinator's peer ID

### Fleet Dashboard

Open your node's web UI → **Admin → Fleet** for the live worker dashboard. The fleet page auto-authenticates when accessed from localhost. For credentials and the worker connection command, go to **Admin → Actions → Fleet** section.

From the dashboard you can see all workers, their stats, and open each worker's full admin UI through the coordinator's secure tunnel.

### Fleet CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--fleet-role` | `coordinator` | `coordinator` (fleet-ready), `worker`, or `standalone` (disables fleet) |
| `--fleet-coordinator` | — | Coordinator multiaddr (required for workers) |
| `--fleet-secret` | — | Hex fleet secret (auto-generated on coordinator if omitted) |

---

## CLI Search

You can search from the command line without opening the web UI:

```bash
# Search a local node
./bin/doogle search "golang tutorial"

# JSON output (pipe-friendly)
./bin/doogle search --json "distributed systems" | jq '.results[].title'

# Search a remote node
./bin/doogle search --api http://192.168.1.100:7002 "privacy"

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

- **DHT discovery** is enabled by default. Nodes should find each other within 30–60 seconds via the IPFS public DHT. Check logs for `DHT discovery: connected to N/5 IPFS bootstrap peers`.
- On the same LAN? mDNS should also work (`--mdns true` is the default).
- If DHT discovery fails (e.g., behind a strict firewall), use `--bootstrap` with a reachable multiaddr.
- Check that libp2p ports are open (TCP and UDP).
- Disable DHT discovery for air-gapped/private networks: `--dht-discovery=false`.

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
