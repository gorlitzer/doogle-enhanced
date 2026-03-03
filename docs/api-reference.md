# API Reference

Doogle v2 exposes a JSON HTTP API for search, status monitoring, and crawl management. All endpoints are served on the configured `--api-port` (default `7002`).

Base URL: `http://localhost:7002` (the default `--bind` is `0.0.0.0`, so the API is also reachable from other devices on your LAN at `http://<your-ip>:7002`)

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search` | Search the distributed index |
| `GET` | `/api/status` | Get node status and metrics |
| `POST` | `/api/crawl` | Submit a URL for crawling |
| `POST` | `/api/crawl/batch` | Submit up to 200 URLs at once |
| `POST` | `/api/report` | Report a URL as spam/malware/phishing |
| `POST` | `/api/config/name` | Set the human-readable node name |
| `GET` | `/api/admin/trust` | Trust system: reports, quarantined peers, flagged domains |
| `GET` | `/api/admin/update-check` | Check for new release (localhost-only) |
| `POST` | `/api/admin/update` | Download and apply binary update (localhost-only) |
| `DELETE` | `/api/admin/data` | Delete all local data (index, crawl history) |
| `GET` | `/` | Web search interface (HTML) |

---

## `GET /api/search`

Search across the local index and connected peers.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | **yes** | — | Search query |
| `page` | int | no | `1` | Page number (1-indexed) |
| `size` | int | no | `10` | Results per page (max 50) |

### Example Request

```bash
curl "http://localhost:7002/api/search?q=distributed+systems&page=1&size=5"
```

### Response — `200 OK`

```json
{
  "query": "distributed systems",
  "results": [
    {
      "url": "https://example.com/distributed-systems-guide",
      "title": "A Practical Guide to Distributed Systems",
      "description": "Learn the fundamentals of distributed computing, consensus algorithms, and fault tolerance...",
      "domain": "example.com",
      "score": 3.42,
      "quality_score": 0.85,
      "domain_authority_score": 0.72,
      "url_quality_score": 0.90,
      "peer_id": "",
      "peer_name": ""
    },
    {
      "url": "https://another-site.org/dist-computing",
      "title": "Distributed Computing 101",
      "description": "An introduction to distributed computing concepts...",
      "domain": "another-site.org",
      "score": 2.18,
      "quality_score": 0.72,
      "domain_authority_score": 0.55,
      "url_quality_score": 0.80,
      "peer_id": "12D3KooWAbc...",
      "peer_name": "Tokyo-Relay-01"
    }
  ],
  "total": 23,
  "page": 1,
  "page_size": 5,
  "took_ms": 145,
  "peers_asked": 3,
  "intent": "informational",
  "suggestion": ""
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | The original query |
| `results` | array | List of search results |
| `results[].url` | string | Page URL |
| `results[].title` | string | Page title |
| `results[].description` | string | Passage-based snippet with best query term coverage (max 280 chars) |
| `results[].domain` | string | Domain name |
| `results[].score` | float | Combined relevance score (BM25 × StaticScore × freshness × intent) |
| `results[].quality_score` | float | Document quality score (0.0–1.0) |
| `results[].domain_authority_score` | float | Site-level authority (0.0–1.0): avg PageRank, quality, backlink domains |
| `results[].url_quality_score` | float | URL quality (0.0–1.0): path depth, slug readability, tracking params |
| `results[].peer_id` | string | Peer that provided this result (empty if local) |
| `results[].peer_name` | string | Human-readable peer name (truncated peer ID if no name set) |
| `total` | int | Total matching results (across all peers) |
| `page` | int | Current page number |
| `page_size` | int | Results per page |
| `took_ms` | int | Query execution time in milliseconds |
| `peers_asked` | int | Number of peers queried |
| `intent` | string | Classified query intent: `navigational`, `informational`, `transactional`, `local`, or `general` |
| `suggestion` | string | Spelling correction suggestion ("Did you mean: X?"), empty if none |

### Error Response — `400 Bad Request`

```json
{
  "error": "missing query parameter 'q'"
}
```

### Query Syntax

| Syntax | Example | Description |
|--------|---------|-------------|
| Simple terms | `distributed systems` | AND match — all terms required |
| Phrases | `"exact phrase"` | Match exact phrase (boosted) |
| OR operator | `golang OR rust` | Either term matches (uppercase `OR` only) |
| Exclusion | `systems -database` | Exclude documents containing the term |
| Site filter | `python site:docs.python.org` | Restrict to a domain |
| Language filter | `documentation lang:de` | Restrict to language + use language-specific stemmer |
| In Title | `intitle:golang` | Term must appear in the title |
| In URL | `inurl:docs` | Substring must appear in the URL |
| In Body | `intext:kubernetes` | Term must appear in body content (also `inbody:`) |
| File Type | `filetype:pdf` | URL must end with the given extension (also `ext:`) |
| Date Range | `after:2025-01-01 before:2025-12-31` | Restrict to a crawl date range |
| HTTPS Only | `has:https` | Only show HTTPS results |
| Combined | `intitle:go -tutorial site:go.dev` | Mix and match all operators |

**Notes:**
- Lowercase `or` is treated as a stop word and removed
- Multiple excludes are supported: `golang -tutorial -beginner -basics`
- OR groups can chain: `python OR ruby OR go`
- Synonyms are expanded automatically (e.g., `js` → `javascript`, `k8s` → `kubernetes`)
- Fuzzy matching is enabled for short queries (≤3 terms)

---

## `GET /api/status`

Returns the current state of the node.

### Example Request

```bash
curl http://localhost:7002/api/status
```

### Response — `200 OK`

```json
{
  "peer_id": "12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X",
  "version": "v0.2.0",
  "commit": "a1b2c3d",
  "build_date": "2026-03-01T12:00:00Z",
  "addrs": [
    "/ip4/192.168.1.100/tcp/7001/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X",
    "/ip4/192.168.1.100/udp/7001/quic-v1/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X",
    "/ip4/127.0.0.1/tcp/7001/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X"
  ],
  "connected_peers": 5,
  "peer_list": [
    "12D3KooWAbcDef...",
    "12D3KooWGhiJkl...",
    "12D3KooWMnoPqr...",
    "12D3KooWStuVwx...",
    "12D3KooWYzaBcd..."
  ],
  "indexed_docs": 4521,
  "crawled_urls": 6893,
  "urls_in_queue": 127,
  "uptime": "4h32m15s",
  "started_at": "2026-02-28T06:00:00Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `peer_id` | string | This node's libp2p peer ID |
| `version` | string | Build version tag (e.g., `"v0.2.0"` or `"dev"`) |
| `commit` | string | Short git commit hash |
| `build_date` | string | ISO 8601 build timestamp |
| `addrs` | []string | Multiaddrs this node is listening on (share these with other nodes) |
| `connected_peers` | int | Number of currently connected peers |
| `peer_list` | []string | Peer IDs of connected nodes |
| `indexed_docs` | int | Number of documents in the local Bleve index |
| `crawled_urls` | int | Total URLs crawled since startup |
| `urls_in_queue` | int | URLs waiting to be crawled |
| `uptime` | string | Time since node started (e.g., `"4h32m15s"`) |
| `started_at` | string | ISO 8601 timestamp of node start |

---

## `POST /api/crawl`

Submit a URL for crawling. The URL is added to the crawl queue and processed by the worker pool.

### Request Body

```json
{
  "url": "https://example.com/new-page"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | **yes** | URL to crawl |

### Example Request

```bash
curl -X POST http://localhost:7002/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Response — `202 Accepted`

```json
{
  "status": "queued",
  "url": "https://example.com"
}
```

The URL is queued and will be crawled asynchronously. Discovered links from this page will also be queued (up to `max_depth`).

### Error Response — `400 Bad Request`

```json
{
  "error": "missing 'url' in request body"
}
```

---

## `GET /`

Serves the embedded web search interface. Open `http://localhost:7002` in a browser (or `http://<your-ip>:7002` from another device on your LAN).

Features:
- Search box with keyboard support (Enter to search, `/` or `Ctrl+K`/`Cmd+K` to focus)
- Results displayed with title, URL, snippet highlighting, domain badge, and score
- 6 switchable themes: Dracula, CRT Terminal, Modern, Light, Pride, Storm
- Setup wizard with 16 topic categories
- Trust dashboard for spam reporting and peer reputation
- Network topology graph, crawler live feed, indexer stats
- Status bar showing node info (peer count, indexed docs, crawled URLs)
- Auto-refreshing status (every 10 seconds)

---

## `GET /api/admin/update-check`

Check whether a newer release is available on GitHub. **Localhost-only** — returns `403` for non-localhost requests.

### Example Request

```bash
curl http://localhost:7002/api/admin/update-check
```

### Response — `200 OK`

```json
{
  "current": "v0.1.0",
  "latest": "v0.2.0",
  "update_available": true
}
```

If no GitHub token is configured or GitHub is unreachable, the response includes an `error` field and `update_available: false`:

```json
{
  "current": "v0.1.0",
  "update_available": false,
  "error": "no GitHub token found..."
}
```

---

## `POST /api/admin/update`

Download, verify, and replace the running binary with the latest release. **Localhost-only** — returns `403` for non-localhost requests. The node must be restarted after a successful update.

### Example Request

```bash
curl -X POST http://localhost:7002/api/admin/update
```

### Response — `200 OK`

```json
{
  "status": "updated",
  "old_version": "v0.1.0",
  "new_version": "v0.2.0",
  "message": "Restart the node to use the new version."
}
```

### Error Response — `500`

```json
{
  "error": "no binary found for doogle-darwin-arm64"
}
```

---

## Fleet Endpoints

Fleet endpoints are only available when the node is running as a coordinator (`--fleet-role coordinator`). All fleet endpoints require a bearer token derived from the fleet secret.

### Authentication

Include the token in every request:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:7002/api/fleet/nodes
```

Or as a query parameter (for iframe embedding):

```bash
curl "http://localhost:7002/api/fleet/nodes?_token=<token>"
```

**How to get the token:**
- **Web UI:** Admin → Actions → Fleet section (localhost only)
- **API:** `GET /api/status` returns `fleet_api_token` (only for localhost requests — remote requests get an empty string for security)
- **Terminal:** Printed to the coordinator's logs at startup
- **File:** Derived from the fleet secret stored in `data/fleet.secret`

---

### `GET /api/fleet/nodes`

Returns the fleet summary with all registered workers.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:7002/api/fleet/nodes
```

**Response — `200 OK`**

```json
{
  "coordinator_id": "12D3KooWDpJ7As...",
  "total_nodes": 2,
  "online_nodes": 2,
  "total_docs": 5420,
  "nodes": [
    {
      "peer_id": "12D3KooWRby3dH...",
      "name": "worker-1",
      "status": "online",
      "first_seen": "2026-03-01T10:00:00Z",
      "last_seen": "2026-03-01T12:30:00Z",
      "stats": {
        "indexed_docs": 3200,
        "crawled_urls": 8400,
        "urls_in_queue": 150,
        "connected_peers": 5,
        "uptime": "2h30m"
      }
    }
  ]
}
```

---

### `GET /api/fleet/nodes/{peerID}`

Returns a single worker's detail.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:7002/api/fleet/nodes/12D3KooWRby3dH...
```

---

### `ANY /api/fleet/nodes/{peerID}/proxy/*`

Proxies any HTTP request to a worker's local API through the coordinator's encrypted libp2p tunnel. The path after `/proxy/` is forwarded to the worker.

```bash
# Get worker's status
curl -H "Authorization: Bearer <token>" \
  http://localhost:7002/api/fleet/nodes/12D3KooWRby3dH.../proxy/api/status

# Get worker's crawl feed
curl -H "Authorization: Bearer <token>" \
  http://localhost:7002/api/fleet/nodes/12D3KooWRby3dH.../proxy/api/admin/crawler/feed
```

**Limits:** 5MB request body, 100MB response, 60s timeout per request.

---

## CORS

All API endpoints support CORS with the following policy:

| Setting | Value |
|---------|-------|
| Allowed Origins | `*` (any origin) |
| Allowed Methods | `GET`, `POST`, `OPTIONS` |
| Allowed Headers | `Content-Type`, `Authorization` |
| Max Age | 3600 seconds |

This means you can call the API from any frontend application.

---

## Error Handling

All error responses use this format:

```json
{
  "error": "description of the error"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `200` | Success |
| `202` | Accepted (async processing) |
| `400` | Bad request (missing or invalid parameters) |
| `500` | Internal server error |

---

## Rate Limits

The HTTP API has no built-in rate limiting. If you expose it publicly, put it behind a reverse proxy (nginx, Caddy) with rate limiting configured.

The **crawler** has per-domain rate limiting (default: 10 requests/minute/domain), but the API itself does not throttle incoming requests.

---

## Usage Examples

### Search and process results with jq

```bash
# Get top 3 results for "golang"
curl -s "http://localhost:7002/api/search?q=golang&size=3" | jq '.results[] | {title, url, score}'
```

### Monitor node health

```bash
# Watch status every 5 seconds
watch -n 5 'curl -s http://localhost:7002/api/status | jq "{peers: .connected_peers, docs: .indexed_docs, queue: .urls_in_queue}"'
```

### Bulk seed URLs

```bash
# Seed multiple URLs
for url in "https://example.com" "https://golang.org" "https://wikipedia.org"; do
  curl -s -X POST http://localhost:7002/api/crawl \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}"
  echo
done
```

### Integration with scripts

```python
import requests

# Search
resp = requests.get("http://localhost:7002/api/search", params={"q": "privacy", "size": 5})
results = resp.json()

for r in results["results"]:
    print(f"{r['title']} — {r['url']} (score: {r['score']:.2f})")

# Submit URL for crawling
requests.post("http://localhost:7002/api/crawl", json={"url": "https://example.com"})
```
