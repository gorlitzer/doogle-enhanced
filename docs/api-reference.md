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
| `GET` | `/api/trends` | Get trending queries and domains |
| `POST` | `/api/click` | Record a search result click |
| `POST` | `/api/profile/interests` | Record user interests |
| `GET` | `/api/admin/leaderboard` | Peer contribution rankings |
| `GET` | `/api/admin/domains` | Domain ownership map (shard assignments) |
| `GET` | `/api/admin/crawler` | Crawler stats and config |
| `GET` | `/api/admin/crawler/feed` | Live crawl event stream |
| `GET` | `/api/admin/indexer` | Indexer statistics |
| `GET` | `/api/admin/peers` | Connected peer list |
| `GET` | `/api/admin/documents` | Recently indexed documents |
| `GET` | `/api/admin/documents/{id}` | Document detail by ID |
| `GET` | `/api/admin/storage` | Disk usage stats |
| `GET` | `/api/admin/dump` | Backup data directory |
| `POST` | `/api/admin/restore` | Restore from backup |
| `GET` | `/api/admin/profile` | Master profile data |
| `GET` | `/api/admin/trust` | Trust system: reports, quarantined peers, flagged domains |
| `POST` | `/api/admin/trust/unquarantine` | Lift peer quarantine (admin) |
| `POST` | `/api/admin/trust/dismiss-report` | Dismiss a spam report (admin) |
| `POST` | `/api/admin/trust/confirm-report` | Confirm a spam report (admin) |
| `POST` | `/api/admin/trust/unblock-domain` | Remove a domain block (admin) |
| `GET` | `/api/admin/trust/audit` | Trust audit trail (hash-chained log) |
| `GET` | `/api/admin/update-check` | Check for new release (localhost-only) |
| `POST` | `/api/admin/update` | Download and apply binary update (localhost-only) |
| `DELETE` | `/api/admin/data` | Delete all local data (index, crawl history) |
| `GET` | `/api/admin/searxng` | SearXNG integration status and config |
| `POST` | `/api/admin/searxng` | Update SearXNG integration settings |
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
  "suggestion": "",
  "entity_card": {
    "name": "Distributed Systems",
    "type": "technology",
    "description": "A distributed system is a system whose components are located on different networked computers...",
    "properties": {
      "category": "Computer Science",
      "related_field": "Distributed Computing"
    },
    "related_entities": [
      {"name": "Consensus Algorithm", "type": "concept"},
      {"name": "Fault Tolerance", "type": "concept"}
    ],
    "doc_count": 45
  }
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
| `results[].score` | float | Combined relevance score (BM25 x StaticScore x freshness x intent) |
| `results[].quality_score` | float | Document quality score (0.0-1.0) |
| `results[].domain_authority_score` | float | Site-level authority (0.0-1.0): avg PageRank, quality, backlink domains |
| `results[].url_quality_score` | float | URL quality (0.0-1.0): path depth, slug readability, tracking params |
| `results[].peer_id` | string | Peer that provided this result (empty if local) |
| `results[].peer_name` | string | Human-readable peer name (truncated peer ID if no name set) |
| `total` | int | Total matching results (across all peers) |
| `page` | int | Current page number |
| `page_size` | int | Results per page |
| `took_ms` | int | Query execution time in milliseconds |
| `peers_asked` | int | Number of peers queried |
| `intent` | string | Classified query intent: `navigational`, `informational`, `transactional`, `local`, or `general` |
| `suggestion` | string | Spelling correction suggestion ("Did you mean: X?"), empty if none |
| `entity_card` | object/null | Knowledge graph card when the query matches a known entity (see below) |
| `entity_card.name` | string | Entity display name |
| `entity_card.type` | string | Entity type (e.g., `technology`, `person`, `organization`) |
| `entity_card.description` | string | Short entity description |
| `entity_card.properties` | object | Key-value metadata pairs |
| `entity_card.related_entities` | array | Related entity references (`name` + `type`) |
| `entity_card.doc_count` | int | Number of indexed documents about this entity |

The `entity_card` field is `null` (omitted) when the query does not match any known entity in the local knowledge graph.

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
- Synonyms are expanded automatically (e.g., `js` -> `javascript`, `k8s` -> `kubernetes`)
- Fuzzy matching is enabled for short queries (<=3 terms)

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
| `country` | string | ISO 3166-1 alpha-2 country code of this node (from GeoIP, e.g. `"US"`, `"DE"`) |
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

## `GET /api/trends`

Returns trending queries and domains based on crawl velocity and query frequency. Trends are computed from recent activity windows and ranked by velocity (rate of change).

### Example Request

```bash
curl http://localhost:7002/api/trends
```

### Response — `200 OK`

```json
{
  "trending_queries": [
    {"name": "artificial intelligence", "current_rate": 12.5, "average_rate": 4.5, "velocity_ratio": 2.8, "volume": 342}
  ],
  "trending_domains": [
    {"name": "example.com", "current_rate": 8.2, "average_rate": 5.5, "velocity_ratio": 1.5, "volume": 156}
  ],
  "computed_at": "2026-03-05T10:00:00Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `trending_queries` | array | Queries with the highest velocity |
| `trending_domains` | array | Domains with the highest crawl velocity |
| `trending_queries[].name` | string | Query text or domain name |
| `trending_queries[].current_rate` | float | Current rate of occurrence |
| `trending_queries[].average_rate` | float | Historical average rate |
| `trending_queries[].velocity_ratio` | float | Ratio of current to average rate (>1.0 = trending up) |
| `trending_queries[].volume` | int | Total count in the observation window |
| `computed_at` | string | ISO 8601 timestamp of when trends were last computed |

---

## `POST /api/click`

Records a user click on a search result. Click data is used for learn-to-rank signal collection: position bias correction, click-through rate estimation, and result quality feedback.

### Request Body

```json
{
  "query": "golang tutorial",
  "url": "https://go.dev/tour",
  "position": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | no | The search query that produced the result |
| `url` | string | **yes** | URL of the clicked result |
| `position` | int | no | 0-indexed position of the result in the list |

### Example Request

```bash
curl -X POST http://localhost:7002/api/click \
  -H "Content-Type: application/json" \
  -d '{"query": "golang tutorial", "url": "https://go.dev/tour", "position": 2}'
```

### Response — `202 Accepted`

```json
{
  "status": "recorded"
}
```

---

## `POST /api/profile/interests`

Records user interest selections (e.g., from the setup wizard topic picker). Interests influence personalized ranking and crawl prioritization.

### Request Body

```json
{
  "subcategory_ids": ["tech-programming", "science-physics", "news-world"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subcategory_ids` | []string | **yes** | List of subcategory identifiers to record |

### Response — `200 OK`

```json
{
  "status": "recorded",
  "count": "3"
}
```

---

## `GET /api/admin/leaderboard`

Returns peer contribution rankings sorted by document count. Shows all peers that have contributed documents to the network, including trust scores and domain coverage.

### Example Request

```bash
curl http://localhost:7002/api/admin/leaderboard
```

### Response — `200 OK`

```json
{
  "explorers": [
    {
      "peer_id": "12D3KooWAbc...",
      "node_name": "Tokyo-Relay-01",
      "doc_count": 3200,
      "trust_score": 0.95,
      "is_local": false,
      "domain_count": 48,
      "first_seen": "2026-02-20T08:00:00Z",
      "last_seen": "2026-03-05T09:30:00Z"
    }
  ],
  "total_docs": 5420,
  "local_peer_id": "12D3KooWPjce..."
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `explorers` | array | Peer contribution entries, sorted by `doc_count` descending |
| `explorers[].peer_id` | string | Peer's libp2p ID |
| `explorers[].node_name` | string | Human-readable node name (if set) |
| `explorers[].doc_count` | int | Number of documents contributed |
| `explorers[].trust_score` | float | Peer trust score (0.0-1.0) |
| `explorers[].is_local` | bool | Whether this entry represents the local node |
| `explorers[].country` | string | ISO 3166-1 alpha-2 country code (from GeoIP, e.g. `"US"`, `"JP"`) |
| `explorers[].domain_count` | int | Number of unique domains covered |
| `total_docs` | int | Total documents across all peers |
| `local_peer_id` | string | This node's peer ID (for highlighting in the UI) |

---

## `GET /api/admin/domains`

Returns domain ownership assignments from the consistent hash ring. Each domain is assigned to a primary owner peer; the local node's owned domains are flagged with `is_local: true`.

### Example Request

```bash
curl http://localhost:7002/api/admin/domains
```

### Response — `200 OK`

```json
{
  "total_domains": 120,
  "owned_domains": 34,
  "domains": [
    {
      "domain": "example.com",
      "owner_id": "12D3KooWPjce...",
      "is_local": true
    },
    {
      "domain": "golang.org",
      "owner_id": "12D3KooWAbc...",
      "is_local": false
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `total_domains` | int | Total domains in the shard ring |
| `owned_domains` | int | Domains assigned to the local node |
| `domains` | array | Domain-to-owner assignments |
| `domains[].domain` | string | Domain name |
| `domains[].owner_id` | string | Peer ID of the shard owner |
| `domains[].is_local` | bool | Whether the local node owns this domain |

---

## `GET /api/admin/crawler`

Returns crawler configuration and runtime statistics.

### Example Request

```bash
curl http://localhost:7002/api/admin/crawler
```

### Response — `200 OK`

```json
{
  "workers": 8,
  "rate_limit": 10,
  "max_depth": 3,
  "user_agent": "DoogleBot/0.2",
  "total_crawled": 6893,
  "total_failed": 124,
  "active_workers": 5,
  "seen_urls": 8500,
  "js_rendered": 320,
  "forwarded_tasks": 45,
  "received_from_peers": 120
}
```

---

## `GET /api/admin/crawler/feed`

Returns recent crawl events for the live feed. Use the `after` parameter to poll for new events since a given sequence number.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `after` | uint64 | no | `0` | Return events with sequence number greater than this value |

### Example Request

```bash
curl "http://localhost:7002/api/admin/crawler/feed?after=100"
```

### Response — `200 OK`

```json
{
  "events": [
    {
      "seq": 101,
      "url": "https://example.com/page",
      "domain": "example.com",
      "title": "Example Page",
      "status": "ok",
      "status_code": 200,
      "content_size": 45230,
      "depth": 2,
      "timestamp": "2026-03-05T10:05:00Z"
    }
  ]
}
```

---

## `GET /api/admin/indexer`

Returns indexer pipeline statistics including quality metrics and rejection counts.

### Example Request

```bash
curl http://localhost:7002/api/admin/indexer
```

### Response — `200 OK`

```json
{
  "total_indexed": 4521,
  "avg_quality": 0.74,
  "avg_spam": 0.08,
  "spam_rejected": 23,
  "duplicates_skipped": 156,
  "empty_skipped": 12
}
```

---

## `GET /api/admin/peers`

Returns the list of currently connected peers with their addresses and node names.

### Example Request

```bash
curl http://localhost:7002/api/admin/peers
```

### Response — `200 OK`

```json
[
  {
    "peer_id": "12D3KooWAbc...",
    "node_name": "Tokyo-Relay-01",
    "addrs": ["/ip4/203.0.113.10/tcp/7001"],
    "country": "JP"
  }
]
```

---

## `GET /api/admin/documents`

Returns recently indexed documents with pagination support.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `offset` | int | no | `0` | Number of documents to skip |
| `limit` | int | no | `20` | Number of documents to return (max 100) |
| `peer` | string | no | — | Filter by origin peer ID |

### Example Request

```bash
curl "http://localhost:7002/api/admin/documents?offset=0&limit=10"
```

### Response — `200 OK`

```json
{
  "documents": [...],
  "total": 4521,
  "offset": 0,
  "limit": 10
}
```

---

## `GET /api/admin/documents/{id}`

Returns the full detail of a single indexed document by its ID.

### Example Request

```bash
curl http://localhost:7002/api/admin/documents/abc123
```

### Response — `200 OK`

Returns the full document object. Returns `404` if the document is not found.

---

## `GET /api/admin/storage`

Returns disk usage statistics for the data directory, broken down by storage backend.

### Example Request

```bash
curl http://localhost:7002/api/admin/storage
```

### Response — `200 OK`

```json
{
  "total_bytes": 524288000,
  "bleve_bytes": 314572800,
  "badger_bytes": 157286400,
  "other_bytes": 52428800,
  "free_bytes": 10737418240,
  "data_dir": "/home/user/.doogle/data"
}
```

---

## `GET /api/admin/dump`

Streams a `tar.gz` backup of the data directory. Sensitive files (e.g., `fleet.secret`) are excluded from the archive.

### Example Request

```bash
curl -o backup.tar.gz http://localhost:7002/api/admin/dump
```

### Response

`200 OK` with `Content-Type: application/gzip`. The response body is a gzipped tar archive.

---

## `POST /api/admin/restore`

Restores the data directory from a previously created backup archive. Upload the archive as a multipart form file field named `archive`. Maximum upload size is 2 GB.

### Example Request

```bash
curl -X POST http://localhost:7002/api/admin/restore \
  -F "archive=@backup.tar.gz"
```

### Response — `200 OK`

```json
{
  "status": "restored",
  "files": 42,
  "message": "Restart the node for changes to take effect."
}
```

---

## `GET /api/admin/profile`

Returns the master profile data including interest categories, search history topics, and personalization signals.

### Example Request

```bash
curl http://localhost:7002/api/admin/profile
```

### Response — `200 OK`

Returns the full profile object with interest categories, topic weights, and activity summaries.

---

## Trust Admin Endpoints

These endpoints manage the trust & safety system. They are available to all requests (no auth required — designed for single-operator nodes).

### `POST /api/admin/trust/unquarantine`

Lifts quarantine on a peer, resetting their trust score to 0.10 with a 30-day cap at 0.70. Fails if the peer has been quarantined 3+ times (permanently banned).

```json
{"peer_id": "12D3KooWAbc..."}
```

**Response — `200 OK`**

```json
{"status": "ok"}
```

**Error — `400`** if peer is permanently banned (3+ quarantines).

---

### `POST /api/admin/trust/dismiss-report`

Marks a spam report as dismissed. Tracks reporter credibility — reporters with >50% rejection rate after 5+ reviewed reports receive a trust penalty.

```json
{"report_id": "sha256-hash..."}
```

**Response — `200 OK`**

```json
{"status": "ok"}
```

---

### `POST /api/admin/trust/confirm-report`

Marks a spam report as confirmed. The reporter receives a small trust boost (+0.01).

```json
{"report_id": "sha256-hash..."}
```

**Response — `200 OK`**

```json
{"status": "ok"}
```

---

### `POST /api/admin/trust/unblock-domain`

Removes a consensus domain block. Clears all votes and the blocked flag.

```json
{"domain": "evil.com"}
```

**Response — `200 OK`**

```json
{"status": "ok"}
```

---

### `GET /api/admin/trust/audit`

Returns the most recent audit trail entries (Ed25519-signed, hash-chained).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | int | no | `50` | Max entries to return |

**Response — `200 OK`**

```json
{
  "entries": [
    {
      "report_id": "sha256-hash...",
      "reporter_id": "12D3KooWAbc...",
      "url": "https://spam.com",
      "reason": "spam",
      "timestamp": "2026-03-05T10:00:00Z",
      "chain_hash": "abc123...",
      "prev_hash": "def456...",
      "signature": "base64...",
      "verified": true
    }
  ]
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

## SearXNG Admin Endpoints

These endpoints read and update the SearXNG metasearch integration settings at runtime without requiring a node restart.

### `GET /api/admin/searxng`

Returns the current SearXNG integration configuration.

### Example Request

```bash
curl http://localhost:7002/api/admin/searxng
```

### Response — `200 OK`

```json
{
  "enabled": true,
  "url": "http://localhost:8080",
  "fallback_only": true,
  "threshold": 3,
  "score_penalty": 0.1,
  "categories": "general"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | bool | Whether SearXNG integration is active |
| `url` | string | SearXNG instance base URL |
| `fallback_only` | bool | When `true`, SearXNG is only queried when peer results are below `threshold` |
| `threshold` | int | Minimum number of peer results required before SearXNG is skipped (in fallback mode) |
| `score_penalty` | float | Score deduction applied to all SearXNG-sourced results |
| `categories` | string | SearXNG search categories sent with each request |

---

### `POST /api/admin/searxng`

Updates SearXNG integration settings. Only `enabled` and `url` are accepted; all other fields are managed through the YAML config.

### Request Body

```json
{
  "enabled": true,
  "url": "http://localhost:8080"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | bool | no | Enable or disable SearXNG integration |
| `url` | string | no | SearXNG instance base URL |

### Example Request

```bash
curl -X POST http://localhost:7002/api/admin/searxng \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "url": "http://localhost:8080"}'
```

### Response — `200 OK`

```json
{
  "status": "ok"
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
- **Web UI:** Admin -> Actions -> Fleet section (localhost only)
- **API:** `GET /api/status` returns `fleet_api_token` (only for localhost requests -- remote requests get an empty string for security)
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
| Allowed Origins | Localhost origins only (`http://localhost:*`, `http://127.0.0.1:*`) |
| Allowed Methods | `GET`, `POST`, `DELETE`, `OPTIONS` |
| Allowed Headers | `Content-Type`, `Authorization` |
| Max Age | 3600 seconds |

This means you can call the API from any frontend application running on localhost.

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
| `403` | Forbidden (localhost-only endpoint accessed remotely) |
| `404` | Not found (e.g., document ID does not exist) |
| `429` | Too many requests (rate limit exceeded) |
| `500` | Internal server error |

---

## Rate Limits

The API enforces rate limiting at **20 requests per second per IP** with a burst allowance of **40 requests**. Requests exceeding the limit receive a `429 Too Many Requests` response.

The **crawler** has separate per-domain rate limiting (default: 10 requests/minute/domain), which is independent of the API rate limiter.

If you need higher throughput for automation, consider batching operations (e.g., `POST /api/crawl/batch` instead of individual crawl submissions) or running requests from multiple source IPs.

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

### Track search clicks

```bash
# Record a click on a search result
curl -X POST http://localhost:7002/api/click \
  -H "Content-Type: application/json" \
  -d '{"query": "golang tutorial", "url": "https://go.dev/tour", "position": 0}'
```

### Check trending topics

```bash
# Get current trends
curl -s http://localhost:7002/api/trends | jq '.trending_queries[:5] | .[].name'
```

### Integration with scripts

```python
import requests

# Search
resp = requests.get("http://localhost:7002/api/search", params={"q": "privacy", "size": 5})
results = resp.json()

for r in results["results"]:
    print(f"{r['title']} — {r['url']} (score: {r['score']:.2f})")

# Check for entity card
if results.get("entity_card"):
    card = results["entity_card"]
    print(f"\nEntity: {card['name']} ({card['type']})")
    print(f"  {card['description']}")

# Submit URL for crawling
requests.post("http://localhost:7002/api/crawl", json={"url": "https://example.com"})

# Record a click
requests.post("http://localhost:7002/api/click", json={
    "query": "privacy", "url": "https://example.com/privacy", "position": 0
})
```
