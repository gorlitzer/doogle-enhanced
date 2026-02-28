# API Reference

Doogle v2 exposes a JSON HTTP API for search, status monitoring, and crawl management. All endpoints are served on the configured `--api-port` (default `8080`).

Base URL: `http://localhost:8080`

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search` | Search the distributed index |
| `GET` | `/api/status` | Get node status and metrics |
| `POST` | `/api/crawl` | Submit a URL for crawling |
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
curl "http://localhost:8080/api/search?q=distributed+systems&page=1&size=5"
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
      "peer_id": ""
    },
    {
      "url": "https://another-site.org/dist-computing",
      "title": "Distributed Computing 101",
      "description": "An introduction to distributed computing concepts...",
      "domain": "another-site.org",
      "score": 2.18,
      "quality_score": 0.72,
      "peer_id": "12D3KooWAbc..."
    }
  ],
  "total": 23,
  "page": 1,
  "page_size": 5,
  "took_ms": 145,
  "peers_asked": 3
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | The original query |
| `results` | array | List of search results |
| `results[].url` | string | Page URL |
| `results[].title` | string | Page title |
| `results[].description` | string | Snippet (meta description or content excerpt, max 200 chars) |
| `results[].domain` | string | Domain name |
| `results[].score` | float | Combined relevance score (BM25 × quality bonus) |
| `results[].quality_score` | float | Document quality score (0.0–1.0) |
| `results[].peer_id` | string | Peer that provided this result (empty if local) |
| `total` | int | Total matching results (across all peers) |
| `page` | int | Current page number |
| `page_size` | int | Results per page |
| `took_ms` | int | Query execution time in milliseconds |
| `peers_asked` | int | Number of peers queried |

### Error Response — `400 Bad Request`

```json
{
  "error": "missing query parameter 'q'"
}
```

### Query Syntax

The search query supports Bleve's query string syntax:

| Syntax | Example | Description |
|--------|---------|-------------|
| Simple terms | `distributed systems` | Match documents containing these terms |
| Phrases | `"exact phrase"` | Match exact phrase |
| Boolean AND | `distributed AND consensus` | Both terms required |
| Boolean OR | `golang OR rust` | Either term |
| Exclusion | `systems -database` | Exclude term |
| Field-specific | `title:guide` | Search specific field |
| Wildcards | `distribut*` | Prefix matching |

---

## `GET /api/status`

Returns the current state of the node.

### Example Request

```bash
curl http://localhost:8080/api/status
```

### Response — `200 OK`

```json
{
  "peer_id": "12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X",
  "addrs": [
    "/ip4/192.168.1.100/tcp/4001/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X",
    "/ip4/192.168.1.100/udp/4001/quic-v1/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X",
    "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X"
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
curl -X POST http://localhost:8080/api/crawl \
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

Serves the embedded web search interface. Open `http://localhost:8080` in a browser.

Features:
- Search box with keyboard support (Enter to search)
- Results displayed with title, URL, snippet, domain badge, and score
- Status bar showing node info (peer count, indexed docs, crawled URLs)
- Auto-refreshing status (every 10 seconds)
- Dark theme

---

## CORS

All API endpoints support CORS with the following policy:

| Setting | Value |
|---------|-------|
| Allowed Origins | `*` (any origin) |
| Allowed Methods | `GET`, `POST`, `OPTIONS` |
| Allowed Headers | `Content-Type` |
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
curl -s "http://localhost:8080/api/search?q=golang&size=3" | jq '.results[] | {title, url, score}'
```

### Monitor node health

```bash
# Watch status every 5 seconds
watch -n 5 'curl -s http://localhost:8080/api/status | jq "{peers: .connected_peers, docs: .indexed_docs, queue: .urls_in_queue}"'
```

### Bulk seed URLs

```bash
# Seed multiple URLs
for url in "https://example.com" "https://golang.org" "https://wikipedia.org"; do
  curl -s -X POST http://localhost:8080/api/crawl \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}"
  echo
done
```

### Integration with scripts

```python
import requests

# Search
resp = requests.get("http://localhost:8080/api/search", params={"q": "privacy", "size": 5})
results = resp.json()

for r in results["results"]:
    print(f"{r['title']} — {r['url']} (score: {r['score']:.2f})")

# Submit URL for crawling
requests.post("http://localhost:8080/api/crawl", json={"url": "https://example.com"})
```
