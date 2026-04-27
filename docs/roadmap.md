# Roadmap

**Legend:**
- `[x]` — done and working
- `[~]` — code exists, needs real-world validation
- `[ ]` — not started

---

## Phase 1 — Foundation
- [x] P2P networking (libp2p TCP+QUIC, Kademlia DHT, IPFS DHT discovery, mDNS, GossipSub, NAT traversal)
- [x] Crawler (workers, rate limiting, robots.txt, headless browser, live feed)
- [x] Indexer (10+ quality signals, E-E-A-T, spam, PageRank, readability, freshness)
- [x] BM25 search (phrases, fuzzy, site: filter, distributed fan-out)
- [x] 6 P2P protocols, shard routing, replication N=3, Merkle anti-entropy
- [x] Admin dashboard (6 themes, wizard, live feed, network graph)
- [x] Docker + Compose support

## Phase 2 — Quality & Scale
- [x] Boolean query operators (`AND`, `OR`, `NOT` / `-term` exclusion)
- [x] Multi-language search (15 language stemmers via Bleve analyzers, `lang:` filter)
- [x] Search result caching (LRU with TTL invalidation, configurable size/TTL)
- [x] CLI search tool (`doogle search "query"`, `--json`, `--api`, remote node support)
- [x] Spam reporting and peer trust system (report URLs, peer reputation, auto-quarantine)
- [x] Domain flagging (multi-peer report consensus, gossip-level filtering)
- [x] Backup & restore (`doogle dump`/`doogle restore`, Makefile targets)
- [x] Production build target (`make build` with stripped binary, `make run`)
- [x] Fleet management (coordinator/worker, secure proxy tunnel, HMAC auth, fleet dashboard)
- [x] Domain-aware crawl coordination (shard ring gates crawl decisions, auto-forwarding to owners, fallback to local)
- [x] Horizontal index sharding (domain-based FNV hash splitting across local Bleve shards)
- [x] Hash ring rebalancing on peer join/leave (background topology change detection, document transfer)
- [x] Persistent content fingerprint dedup (BadgerDB-backed, survives restarts)
- [x] Structured data extraction (Schema.org JSON-LD + microdata → rich snippets)
- [x] PDF & document indexing (PDF binary text extraction, plain text, CSV, markdown, XML)
- [x] Content verification (Ed25519-signed documents for tamper detection)
- [x] Image search by alt text, caption, figcaption, surrounding context

## Phase 2.5 — Trust & Safety
- [x] Sybil resistance (hashcash proof-of-work on URL announcements, difficulty scales with trust)
- [x] Consensus-based domain blocklist (N-of-M peer agreement to global-block a domain)
- [x] Trust decay (idle peers lose 0.005/hour, active peers maintain or gain trust)
- [x] Reputation-weighted search (trust [0,1] maps to ranking multiplier [0.85, 1.15])
- [x] Malicious crawl defense (per-peer gossip rate limiting with automatic blocking)
- [x] Report audit trail (Ed25519-signed, hash-chained tamper-proof log of all reports)
- [x] Admin UI for trust dashboard (visualize peer trust, manage quarantine, review reports)
- [x] Allowlist/denylist per node (operator-defined URL/domain prefix filtering via YAML)
- [~] Sybil / adversarial resistance — logic is implemented, but no adversarial testing done. Needs someone to simulate a real attack (coordinated malicious peers, PoW bypass attempts).

## Phase 3 — Dark Web & Privacy

> **Status: not started.** All items below are design-only — no code has been written. This phase is blocked pending legal review (liability, CSAM handling requirements, jurisdiction). If you have relevant legal/policy expertise and want to help unblock it, open an issue.

- [ ] SOCKS5 proxy support in crawler (configurable per-transport)
- [ ] Tor integration (bundled/sidecar daemon, automatic SOCKS5 routing for .onion)
- [ ] .onion crawling (frontier accepts .onion URLs, Tor-routed fetches, per-hidden-service rate limiting)
- [ ] I2P support (SAM bridge for .i2p eepsite crawling)
- [ ] Privacy-preserving P2P (optional libp2p-over-Tor transport, peers never expose IPs)
- [ ] Encrypted search queries (end-to-end encrypted peer queries, relays can't read them)
- [ ] .onion seed directories (ahmia.fi, Haystak, Torch as built-in wizard seed categories)
- [ ] Content safety layer (CSAM hash matching, configurable blocklists, on by default)
- [ ] Network source tagging (clearnet/tor/i2p label on every doc, filterable in search UI)
- [ ] Tor circuit management (connection pooling, circuit rotation, bandwidth-aware scheduling)

## Phase 4 — Intelligence
- [x] Query intent classification (navigational, informational, transactional, local) with ranking adjustments
- [x] Spelling correction ("Did you mean?") via index term dictionary + Damerau-Levenshtein
- [x] Synonym expansion (100+ bidirectional pairs, acronyms, compound words)
- [x] Domain diversity (max 2 per domain in top 10, demote excess)
- [x] Passage-based snippets with term highlight positions
- [x] Domain authority scoring (aggregated site-level reputation signal)
- [x] URL quality signals (path depth, readability, tracking params)
- [x] Readability-style content extraction (Arc90 algorithm, boilerplate removal)
- [x] Graduated freshness scoring (time-sensitive vs evergreen half-lives)
- [x] 12-signal ranking model (E-E-A-T, Quality, PageRank, Domain Authority, URL Quality, Readability, Citation, Link, SEO, Author Credibility, Relevance, Freshness)
- [x] Semantic search (TF-IDF 384-dim embeddings, hybrid BM25 + vector RRF scoring, optional neural via Ollama)
- [~] Neural semantic search quality — Ollama integration works, but no A/B comparison against TF-IDF on a real corpus. Whether it actually helps is unknown.
- [x] Knowledge graph (NER → entity graph in BadgerDB, entity cards in search results)
- [x] Click tracking for learn-to-rank (local-only click signals: query, URL, position)
- [x] Automatic summarization (extractive TextRank-inspired sentence ranking)
- [x] Topic clustering (document grouping with keyword labels, related topics in results)
- [x] Trend detection (hourly-bucketed crawl velocity + query frequency, spike detection)
- [~] ML-based ranking — gradient-boosted decision stumps, pairwise RankNet loss, auto-trains from click data every 6h. **Code is complete but untested in production.** Needs real users generating real clicks before training is meaningful. Without click data it falls back to static signal weights.
- [~] Multilingual semantic search — cross-lingual dictionary projection across 9 languages (~500 words per language). Works for common terms; quality drops significantly for uncommon vocabulary or long queries. Not a real multilingual embedding model.

## Phase 4.5 — Google Parity
- [x] 28-feature neural-style ranking (14 base signals + 14 query-document interaction features: term overlap, TF-IDF similarity, term proximity, exact match, coverage)
- [x] Click-through rate signals (position-debiased CTR using examination hypothesis, impression tracking, dwell time, pogo-stick detection)
- [x] Core Web Vitals scoring (TTFB measurement, page size analysis, resource counting, lazy image detection, async script detection → composite 0–1 performance score)
- [x] Mobile-first indexing (viewport meta, responsive CSS detection, flexbox/grid, touch icons, font/tap target analysis → composite 0–1 mobile score)
- [x] Behavioral brand authority (domain-level CTR, avg dwell time, search volume blended into domain authority when click data exists)
- [x] Real-time continuous re-crawl (priority scheduler every 5 min, staleness × importance scoring, change frequency tracking)
- [x] Roadmap page (filterable feature cards with shipped/in-progress/planned status badges)
- [x] Behavioral tracking frontend (automatic impression recording, dwell time on tab return, pogo-stick events)
- [x] New API endpoints: `POST /api/impression`, `POST /api/dwell`, `POST /api/pogo`

## Phase 5 — Ecosystem
- [ ] Browser extension (address bar search, optional query obfuscation via P2P)
- [ ] Mobile client (read-only, connects to remote Doogle node)
- [x] Light nodes (~50 MB RAM, search + relay only, proxy queries to full nodes via `--light`)
- [ ] Incentive layer (reputation + credit for uptime/crawl contribution — not a blockchain)
- [ ] Governance (community proposals, node operator voting on network parameters)
- [ ] Plugin system (pluggable analyzers, scorers, content extractors)
- [x] Multi-platform releases (Linux, macOS, Windows, Android/arm64 — amd64 + arm64)
- [x] Automatic peer discovery via IPFS public DHT (zero-config onboarding)
- [ ] Public bootstrap network (maintained Doogle-specific entry nodes)

## Phase 6 — Hardening
- [x] Security hardening (admin loopback, XSS, SSRF, P2P stream timeouts, security headers, ReDoS protection)
- [x] P2P version compatibility (peers exchange versions, incompatible nodes rejected gracefully, update-needed alert)
- [x] Neural semantic search via Ollama integration (`--ollama` flag, fallback to TF-IDF)
- [x] Query relaxation (AND→OR fallback when Bleve stopwords return 0 results)
- [~] Search quality benchmarks — NDCG@10=0.971, MRR=1.000, but measured on a 20-query synthetic test suite. Not validated on real-world traffic at scale.
- [x] CI/CD (test + lint on every PR, release verification, branch protection)
- [x] Open-source readiness (LICENSE, SECURITY.md, install.sh, docs, community handoff)
- [~] P2P at scale — discovery and basic multi-node setups work. Untested beyond a handful of peers. Needs stress testing with 50+ simultaneous nodes.
