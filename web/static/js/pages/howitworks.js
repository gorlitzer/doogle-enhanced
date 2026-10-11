// Doogle v2 — How It Works: Deep-dive technical explainer with diagrams and interactive sections
import { icon, getCSS, hexToRgba, showModal } from '../components.js';
import { navGen } from '../nav-gen.js';

// ── Section data ──────────────────────────────────────────

const layers = [
  {
    id: 'network', icon: 'radio', color: 'var(--blue)', title: 'P2P Network Layer',
    subtitle: 'libp2p — the backbone',
    summary: 'Every Doogle node is an equal peer. No master servers, no central coordinators. Nodes discover each other automatically and communicate over encrypted channels.',
    diagram: 'network',
    details: [
      { label: 'Transport', text: 'TCP + QUIC (UDP) on the same port. Noise protocol encryption (primary) with TLS 1.3 fallback. Automatic NAT traversal via UPnP/NAT-PMP + hole punching.' },
      { label: 'Identity', text: 'Ed25519 keypair generated on first run, persisted to <code>data_dir/node.key</code>. Your Peer ID is the hash of your public key — unique, cryptographic, permanent.' },
      { label: 'Discovery', text: '<strong>Kademlia DHT</strong> for internet-wide routing. <strong>IPFS public DHT</strong> for zero-config auto-discovery (rendezvous namespace <code>doogle/network/v2</code>, 30s polling). <strong>mDNS</strong> for LAN peers.' },
      { label: 'Pub/Sub', text: '<strong>GossipSub</strong> topics: <code>doogle/url-frontier</code> (URL announcements), <code>doogle/shard-catalog</code> (topology), <code>doogle/spam-reports</code> (trust signals).' },
      { label: 'Protocols', text: '6 custom libp2p stream protocols: <code>/doogle/search/1.0.0</code>, <code>/doogle/crawl/1.0.0</code>, <code>/doogle/index/1.0.0</code>, <code>/doogle/replicate/1.0.0</code>, <code>/doogle/fleet/heartbeat/1.0.0</code>, <code>/doogle/fleet/proxy/1.0.0</code>.' },
    ],
    tech: ['libp2p', 'Kademlia DHT', 'GossipSub', 'Noise', 'QUIC', 'Ed25519'],
    modal: `<h3>Network Deep Dive</h3>
      <p>Doogle's networking is built on <a href="https://docs.libp2p.io/" target="_blank">libp2p</a>, the same stack used by IPFS and Filecoin.</p>
      <h4>Three Discovery Mechanisms</h4>
      <ol>
        <li><strong>Kademlia DHT</strong> — A distributed hash table where each node maintains routing tables to find other nodes by their Peer ID. Runs in AutoServer mode (both client and server).</li>
        <li><strong>IPFS Public DHT</strong> — Connects to 5 public IPFS bootstrap peers and advertises under the rendezvous namespace <code>doogle/network/v2</code>. New nodes discover the Doogle network within 30-60 seconds with zero configuration.</li>
        <li><strong>mDNS</strong> — Multicast DNS for local network discovery. Service name: <code>doogle-p2p</code>. Instant discovery on the same LAN.</li>
      </ol>
      <h4>GossipSub Topics</h4>
      <table style="width:100%;font-size:0.9em;margin:12px 0">
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:6px"><code>doogle/url-frontier</code></td><td style="padding:6px">URL announcements with Proof-of-Work stamps</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:6px"><code>doogle/shard-catalog</code></td><td style="padding:6px">Shard topology updates when nodes join/leave</td></tr>
        <tr><td style="padding:6px"><code>doogle/spam-reports</code></td><td style="padding:6px">Trust signals and spam report broadcasting</td></tr>
      </table>
      <h4>Stream Protocols</h4>
      <p>All custom protocols use JSON + newline request/response over libp2p streams:</p>
      <ul>
        <li><code>/doogle/search/1.0.0</code> — Distributed search queries (query, page, page_size → results)</li>
        <li><code>/doogle/crawl/1.0.0</code> — Forward crawl tasks to domain owners</li>
        <li><code>/doogle/index/1.0.0</code> — Replicate documents to shard peers</li>
        <li><code>/doogle/replicate/1.0.0</code> — Bulk document transfer during rebalancing (batches of 50)</li>
        <li><code>/doogle/fleet/heartbeat/1.0.0</code> — HMAC-SHA256 signed heartbeats (15s interval)</li>
        <li><code>/doogle/fleet/proxy/1.0.0</code> — Encrypted HTTP tunneling for fleet management</li>
      </ul>
      <h4>Sybil Resistance (Proof-of-Work)</h4>
      <p>URL announcements require Hashcash-style PoW: <code>SHA-256(peerID + sortedURLs + nonce)</code> must have N leading zero bits. Difficulty scales by trust:</p>
      <ul>
        <li>High trust (&gt;0.8): 16 bits (~65K hashes)</li>
        <li>Low trust (&lt;0.3): 24 bits (~16M hashes)</li>
      </ul>
      <p>Max age: 5 minutes (replay prevention). This makes it expensive for Sybil nodes to flood the network with fake URLs.</p>`,
  },
  {
    id: 'shard', icon: 'network', color: 'var(--purple)', title: 'Shard Ring & Domain Routing',
    subtitle: 'Consistent hashing — who owns what',
    summary: 'Every domain is assigned to a specific node via consistent hashing. Before crawling, the node checks ownership — if it doesn\'t own the domain, it forwards the task to the responsible peer.',
    diagram: 'shard',
    details: [
      { label: 'Hash Ring', text: 'FNV-32a hash of each domain, mapped to a ring with 64 virtual nodes per peer. <code>ShardManager.Owners(domain, 2)</code> returns primary + 1 replica.' },
      { label: 'Routing', text: 'URL enters system → domain ownership check → own it? Schedule locally. Don\'t own it? Forward via <code>/doogle/crawl/1.0.0</code>. Owner offline? Fall back to local crawl.' },
      { label: 'Rebalancing', text: 'Background loop (30s) detects topology changes. On new node join: transfer documents in batches of 50 via <code>/doogle/replicate/1.0.0</code>.' },
      { label: 'Replication', text: 'Every document replicated to N nodes (default 2 owners). Documents survive single-node failures.' },
    ],
    tech: ['Consistent Hashing', 'FNV-32a', 'Virtual Nodes'],
    modal: `<h3>Shard Ring Deep Dive</h3>
      <p>Doogle uses consistent hashing to distribute domain ownership across all connected peers. This ensures:</p>
      <ul>
        <li><strong>No duplicate crawling</strong> — only the domain owner crawls each URL</li>
        <li><strong>Even distribution</strong> — 64 virtual nodes per peer prevent hotspots</li>
        <li><strong>Minimal disruption</strong> — when nodes join/leave, only ~1/N domains move</li>
      </ul>
      <h4>Domain Routing Flow</h4>
      <pre style="background:var(--bg-card);padding:12px;border-radius:8px;font-size:0.85em;overflow-x:auto">
URL arrives (seed, gossip, or link discovery)
  │
  ├─ hash(domain) → ring position
  │
  ├─ Owners(domain, 2) → [primary, replica]
  │
  ├─ Am I the primary?
  │   ├─ YES → schedule in local crawler
  │   └─ NO → forward to primary via /doogle/crawl/1.0.0
  │            └─ Primary offline? → crawl locally (graceful fallback)
  │
  └─ After crawl: replicate document to replica node(s)
      </pre>
      <h4>Rebalancing</h4>
      <p>A background goroutine runs every 30 seconds. When the topology changes (node join/leave), it identifies domains that have moved to a new owner and transfers documents in batches of 50. Transferred documents are deleted from the old owner after successful transfer.</p>`,
  },
  {
    id: 'crawl', icon: 'download', color: 'var(--accent)', title: 'Crawl Pipeline',
    subtitle: 'Fetching the web, page by page',
    summary: 'A configurable worker pool fetches pages via HTTP, respects robots.txt, rate-limits per domain, extracts clean content with the Arc90 readability algorithm, and discovers new links to continue the crawl.',
    diagram: 'crawl',
    details: [
      { label: 'URL Frontier', text: 'Two-tier queue: 10,000-slot in-memory channel + BadgerDB persistent overflow. Normalized, deduplicated (SHA-256 keyed), prioritized by domain freshness and crawl depth.' },
      { label: 'Worker Pool', text: 'Configurable goroutine workers (default 8). Each loops: <code>TryNext()</code> → sleep 1s on empty → fetch → extract → callback. Max depth enforcement per URL.' },
      { label: 'Politeness', text: '<code>robots.txt</code> fetched on first domain request, cached 24h. Per-domain rate limit: 10 req/min. Global 500ms inter-request delay. Inactive domains cleaned every 5 min.' },
      { label: 'Extraction', text: '<strong>Arc90 algorithm:</strong> score block elements by paragraph count, text length, class/ID signals. +25 for "article/content/post", -25 for "sidebar/nav/ad". Threshold: score >= 50.' },
      { label: 'Rich Metadata', text: 'Title, description, headings (H1-H6), links (internal/external, nofollow), images (alt text), Open Graph tags, canonical URL, Schema.org (JSON-LD + microdata), meta keywords.' },
      { label: 'Non-HTML', text: 'PDF binary text extraction, plain text, CSV, markdown, XML. 10MB download limit, 100KB content truncation.' },
    ],
    tech: ['goquery', 'go-rod', 'Arc90', 'robots.txt', 'HTTP/QUIC'],
    modal: `<h3>Crawl Pipeline Deep Dive</h3>
      <h4>URL Lifecycle</h4>
      <pre style="background:var(--bg-card);padding:12px;border-radius:8px;font-size:0.85em;overflow-x:auto">
URL Sources:
  ├─ CLI seeds (--seed flag)
  ├─ POST /api/crawl or /api/crawl/batch
  ├─ GossipSub url-frontier messages
  └─ Links discovered from crawled pages

URL Frontier:
  ├─ Normalize URL (lowercase host, strip fragments)
  ├─ Dedup check (SHA-256 key in BadgerDB)
  ├─ Domain ownership check → forward if not owner
  └─ Enqueue: in-memory (cap 10K) or BadgerDB overflow
      </pre>
      <h4>Content Extraction (Arc90 Algorithm)</h4>
      <p>The readability algorithm scores every block element:</p>
      <ul>
        <li>+1 per <code>&lt;p&gt;</code> tag inside the block</li>
        <li>+1 per comma in text</li>
        <li>+<code>text_length / 100</code></li>
        <li>+25 bonus for class/ID containing: article, content, post, entry, main, text, body, story</li>
        <li>-25 penalty for: sidebar, nav, footer, comment, ad, widget, banner, menu, social, share, related</li>
        <li>+30 for <code>&lt;article&gt;</code> or <code>&lt;main&gt;</code> tags</li>
      </ul>
      <p>Block with highest score wins. If no block scores >= 50, falls back to <code>&lt;body&gt;</code> text. Script, style, nav, header, footer, aside, noscript, iframe, and SVG elements are stripped before scoring.</p>
      <h4>Rate Limiting</h4>
      <table style="width:100%;font-size:0.9em;margin:12px 0">
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:6px"><strong>Per-domain</strong></td><td style="padding:6px">10 requests/minute sliding window</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:6px"><strong>Global delay</strong></td><td style="padding:6px">500ms between any two requests</td></tr>
        <tr><td style="padding:6px"><strong>Cleanup</strong></td><td style="padding:6px">Domains inactive 1+ hour removed every 5 minutes</td></tr>
      </table>`,
  },
  {
    id: 'index', icon: 'database', color: 'var(--green)', title: 'Indexing & Quality Scoring',
    subtitle: '12 signals, spam detection, and Bleve',
    summary: 'Every crawled document passes through content verification, duplicate detection, 12-signal quality scoring, spam filtering, entity extraction, summarization, and TF-IDF embedding before being indexed into Bleve.',
    diagram: 'index',
    details: [
      { label: 'Content Verification', text: 'SHA-256 hash of URL+Title+Content, signed with Ed25519 private key. Receiving nodes verify signature to detect tampering.' },
      { label: 'Dedup', text: '4-gram shingling → top 20 shingles → SHA-256 fingerprint. Jaccard similarity > 80% = duplicate → skip. Persistent in BadgerDB: <code>dedup:fp:{hash}</code>.' },
      { label: '12-Signal Scoring', text: 'E-E-A-T (15%), PageRank (15%), Quality (10%), Domain Authority (10%), Readability (8%), Citation (8%), Freshness (8%), Relevance (6%), URL Quality (5%), SEO (5%), Link (5%), Author (5%).' },
      { label: 'StaticScore', text: '<code>(0.5 + weightedSignals * 2.0) * (1.0 - spamScore * 0.8)</code> → range [0.1, 2.5]. Computed once at index time, stored with document.' },
      { label: 'Spam Filter', text: 'Each spam keyword match: +0.15 (max 0.6). Excessive caps (>50% title): +0.2. Thin content (<50 words): +0.3. Score > 0.7 = rejected.' },
      { label: 'Enrichment', text: 'NER entity extraction → EntityStore. TextRank extractive summary (2-5 sentences). TF-IDF 384-dim embedding → VectorStore. Schema.org type detection.' },
      { label: 'Bleve Write', text: 'Batch-indexed (100 docs/flush or every 5s). Field boosts: title (5x), URL text (3x), headings (2x), description (1.5x), content (1x). 15 language stemmers.' },
    ],
    tech: ['Bleve', 'BadgerDB', 'Ed25519', 'TF-IDF', 'TextRank', 'NER'],
    modal: `<h3>Indexing Deep Dive</h3>
      <h4>Full Processing Chain</h4>
      <pre style="background:var(--bg-card);padding:12px;border-radius:8px;font-size:0.85em;overflow-x:auto">
Document arrives from crawler callback
  │
  ├─ [Empty check] → skip if no title AND no content
  ├─ [URL filter] → skip if domain blocked/not allowed
  ├─ [Content verification] → Ed25519 sign (SHA-256 of URL+Title+Content)
  ├─ [Dedup] → 4-gram shingling → Jaccard > 80% = skip
  ├─ [Quality scoring] → 12 weighted signals → StaticScore
  ├─ [Spam scoring] → keyword + caps + thin content → reject if > 0.7
  ├─ [Structured data] → Schema.org type + image alt text
  ├─ [Entity extraction] → NER → EntityStore + relationships
  ├─ [Summarization] → TextRank sentence ranking → 2-5 sentences
  ├─ [TF-IDF embedding] → 384-dim feature-hashed vector → VectorStore
  └─ [Bleve write] → routed to correct horizontal shard
      </pre>
      <h4>Quality Signals Explained</h4>
      <table style="width:100%;font-size:0.85em;margin:12px 0">
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>E-E-A-T (15%)</strong></td><td style="padding:4px">Experience phrases, expertise words, authority (1000+ words), trustworthiness (HTTPS, .edu/.gov/.org)</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>PageRank (15%)</strong></td><td style="padding:4px">Iterative power method, damping=0.85, 15 iterations, cross-domain links 1.5x weight</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>Quality (10%)</strong></td><td style="padding:4px">Title length (10-70 chars), word count (300-5000 optimal), description presence, semantic density (0.2-0.6)</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>Domain Authority (10%)</strong></td><td style="padding:4px">Site-level: avg PageRank, avg quality, backlink domain count</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>Readability (8%)</strong></td><td style="padding:4px">Flesch-Kincaid readability score</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>Citation (8%)</strong></td><td style="padding:4px">References to/from other sources</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>Freshness (8%)</strong></td><td style="padding:4px">Graduated decay: time-sensitive (7d half-life), evergreen (365d half-life)</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>Relevance (6%)</strong></td><td style="padding:4px">Composite of E-E-A-T + Quality + Link + SEO + URL Quality</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>URL Quality (5%)</strong></td><td style="padding:4px">Path depth, slug readability, tracking parameter detection</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>SEO (5%)</strong></td><td style="padding:4px">Meta tags, heading structure, canonical URLs</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><strong>Link (5%)</strong></td><td style="padding:4px">Inbound/outbound link structure and quality</td></tr>
        <tr><td style="padding:4px"><strong>Author (5%)</strong></td><td style="padding:4px">Author expertise signals</td></tr>
      </table>
      <h4>Horizontal Sharding</h4>
      <p>Documents are routed to shards via <code>FNV-32a(domain) % numShards</code>. Each shard is an independent Bleve index at <code>data_dir/bleve/shard-{N}/</code>. Searches fan out across all shards and merge results. <code>TotalDocCount()</code> aggregates counts across shards.</p>`,
  },
  {
    id: 'search', icon: 'search', color: 'var(--accent)', title: 'Search Pipeline',
    subtitle: 'From query to ranked results',
    summary: 'Your query is parsed, expanded with synonyms, classified by intent, searched via hybrid BM25+vector fusion, re-ranked with 12 quality signals, enriched with entity cards and snippets, and optionally distributed to peers.',
    diagram: 'search',
    details: [
      { label: 'Query Parsing', text: 'Phrases (<code>"exact"</code>), excludes (<code>-term</code>), OR groups, <code>site:</code>, <code>lang:</code>, <code>intitle:</code>, <code>inurl:</code>, <code>filetype:</code>, <code>before:/after:</code>, <code>has:https</code>.' },
      { label: 'Synonym Expansion', text: '100+ bidirectional pairs: "js" ↔ "javascript", "k8s" ↔ "kubernetes", "ml" ↔ "machine learning". Added as low-boost clauses.' },
      { label: 'Intent Classification', text: '<strong>Navigational</strong> (domain/brand, +5x exact domain). <strong>Informational</strong> (how/what/why, boost readability). <strong>Transactional</strong> (buy/download). <strong>Local</strong> ("near me", geo-tagged).' },
      { label: 'Hybrid Search', text: 'BM25 (Bleve) + TF-IDF vector cosine similarity. Fused via Reciprocal Rank Fusion (RRF, k=60). BM25 weight 0.7, vector weight 0.3.' },
      { label: 'Re-Ranking', text: '<code>final = BM25 * StaticScore * freshnessDecay * intentMultiplier</code>. Or LTR model score when trained (gradient-boosted stumps, 14 features, RankNet loss).' },
      { label: 'Enrichment', text: 'Entity knowledge cards from NER graph. Passage-based snippets with term highlights. Related topics from cluster store. Trend boost for active spikes. Spelling correction (Damerau-Levenshtein).' },
      { label: 'Distribution', text: 'Cache check (LRU, 1000 entries, 5min TTL). Fan-out to up to 10 peers (5s timeout). Merge, dedup by URL. Domain diversity: max 2 per domain in top 10.' },
    ],
    tech: ['BM25', 'RRF', 'TF-IDF', 'LTR', 'Damerau-Levenshtein'],
    modal: `<h3>Search Deep Dive</h3>
      <h4>Local Search Pipeline</h4>
      <pre style="background:var(--bg-card);padding:12px;border-radius:8px;font-size:0.85em;overflow-x:auto">
User query: GET /api/search?q=...
  │
  ├─ 1. Parse → phrases, excludes, OR groups, site/lang filters, dorks
  ├─ 2. Expand synonyms (100+ low-boost clauses)
  ├─ 3. Classify intent (navigational/informational/transactional/local)
  ├─ 4. Build Bleve query tree: Must(AND) + MustNot + Must(OR) + Should(fuzzy)
  ├─ 5. Apply language-specific analyzer (15 stemmers available)
  ├─ 6. Hybrid search: BM25 + TF-IDF vector → RRF fusion
  ├─ 7. Extract passage-based snippets with term highlights
  ├─ 8. Re-rank with intent-aware multipliers
  ├─ 9. Entity card detection (query vs knowledge graph)
  ├─ 10. Related topics (from cluster store on top result)
  ├─ 11. Trend boost (velocity-based for active spikes)
  ├─ 12. Generate spelling suggestion
  ├─ 13. Record query terms in trend store (hourly bucket)
  └─ 14. Return paginated results
      </pre>
      <h4>Distributed Search</h4>
      <pre style="background:var(--bg-card);padding:12px;border-radius:8px;font-size:0.85em;overflow-x:auto">
Query
  ├─ Check LRU cache (SHA-256 key, 5min TTL) → return if hit
  ├─ Local Bleve search (full pipeline above)
  ├─ Fan-out to up to 10 connected peers (parallel, 5s timeout)
  ├─ Merge all results
  ├─ Deduplicate by URL
  ├─ Apply domain diversity (max 2 per domain in top 10)
  ├─ Cache result
  └─ Return paginated response
      </pre>
      <h4>Reciprocal Rank Fusion (RRF)</h4>
      <p>Hybrid search merges BM25 text results with vector similarity results using RRF:</p>
      <p style="text-align:center;font-family:monospace;background:var(--bg-card);padding:12px;border-radius:8px;margin:12px 0"><code>score(d) = 0.7/(60 + rank_BM25(d)) + 0.3/(60 + rank_vector(d))</code></p>
      <p>RRF is score-scale independent — it doesn't matter that BM25 scores and cosine similarities use different ranges.</p>
      <h4>Learn-to-Rank (LTR)</h4>
      <p>When 200+ click pairs are available, Doogle trains a gradient-boosted decision stump model:</p>
      <ul>
        <li><strong>14 features:</strong> BM25, E-E-A-T, quality, PageRank, domain authority, URL quality, readability, citation, link, SEO, author credibility, relevance, freshness, spam</li>
        <li><strong>Loss:</strong> RankNet pairwise logistic: <code>L = log(1 + exp(-(s_winner - s_loser)))</code></li>
        <li><strong>Training:</strong> Every 6 hours in a background goroutine</li>
        <li><strong>Fallback:</strong> Hand-tuned ranker used until enough click data accumulates</li>
      </ul>`,
  },
  {
    id: 'trust', icon: 'shield', color: 'var(--red)', title: 'Trust & Quarantine System',
    subtitle: 'Strike-based reputation with graduated tiers',
    summary: 'Every peer has a trust score that decays over time and responds to behavior. Bad actors are gradually demoted through warning, throttling, quarantine, and permanent excommunication. Documents from untrusted peers are quarantined before reaching search results.',
    diagram: 'trust',
    details: [
      { label: 'Trust Score', text: 'Initial: 0.5. Good behavior: +0.001 per quality doc. Bad behavior: <code>basePenalty * reporterTrust * reasonWeight</code>. Exponential decay: 0.998/idle-hour (~14-day half-life).' },
      { label: 'Strike Tiers', text: '<strong>Trusted</strong> (0-2 strikes, 1.0x). <strong>Warning</strong> (3-4, 0.8x demotion). <strong>Throttled</strong> (5-7, 0.5x). <strong>Quarantined</strong> (8-14, excluded). <strong>Excommunicated</strong> (15+, permanent ban).' },
      { label: 'Reason Weights', text: 'Malware/phishing: 1.5x penalty. Illegal content: 1.2x. Spam: 1.0x. Low quality: 0.5x. Penalty = <code>0.02 * reporterTrust * reasonWeight</code>.' },
      { label: 'Sybil Protection', text: 'Peer age gating: reports from peers < 1h old rejected, < 24h old get half-weight. Report rate limit: 10/min per peer, 5-min block for offenders. PoW on URL announcements.' },
      { label: 'Domain Blocking', text: 'Consensus-based: 3 unique peer votes to globally block a domain. Checked in gossip loop, crawl routing, and replication handlers.' },
      { label: 'Audit Trail', text: 'Hash-chained log: each entry = SHA-256(payload + previous hash), signed with Ed25519. Tamper-proof and verifiable. Stored in BadgerDB: <code>audit:chain:{reportID}</code>.' },
      { label: 'Document Quarantine', text: 'Documents from low-trust peers enter a 24-hour voting window. Staged promotion: quarantined → pending review → indexed. Allows removal before search results are tainted.' },
    ],
    tech: ['Ed25519', 'SHA-256', 'HMAC', 'Exponential Decay', 'Hash Chain'],
    modal: `<h3>Trust System Deep Dive</h3>
      <h4>Trust Tier Table</h4>
      <table style="width:100%;font-size:0.85em;margin:12px 0">
        <tr style="border-bottom:1px solid var(--border);background:var(--bg-card)"><th style="padding:6px">Tier</th><th style="padding:6px">Strikes</th><th style="padding:6px">Score</th><th style="padding:6px">Search Effect</th></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:6px;color:var(--green)"><strong>Trusted</strong></td><td style="padding:6px">0-2</td><td style="padding:6px">&ge; 0.30</td><td style="padding:6px">Full ranking (1.0x)</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:6px;color:var(--amber)"><strong>Warning</strong></td><td style="padding:6px">3-4</td><td style="padding:6px">0.20-0.29</td><td style="padding:6px">Results demoted 20% (0.8x)</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:6px;color:var(--amber)"><strong>Throttled</strong></td><td style="padding:6px">5-7</td><td style="padding:6px">0.10-0.19</td><td style="padding:6px">Results demoted 50% (0.5x)</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:6px;color:var(--red)"><strong>Quarantined</strong></td><td style="padding:6px">8-14</td><td style="padding:6px">&lt; 0.10</td><td style="padding:6px">Excluded from results (0.0x)</td></tr>
        <tr><td style="padding:6px;color:var(--red)"><strong>Excommunicated</strong></td><td style="padding:6px">15+</td><td style="padding:6px">-</td><td style="padding:6px">Permanent ban, never accepted</td></tr>
      </table>
      <h4>Anti-Abuse Measures</h4>
      <ul>
        <li><strong>Peer age gating:</strong> Reports from peers &lt; 1 hour old are rejected entirely. Peers &lt; 24 hours old get half-weight penalties. This prevents Sybil attacks where new nodes flood false reports.</li>
        <li><strong>Report rate limiting:</strong> Max 10 reports/minute per peer. Offenders blocked for 5 minutes.</li>
        <li><strong>Reporter credibility:</strong> Confirmed reports boost reporter trust (+0.01). High rejection rate (&gt;50% after 5+ reviews) penalizes false reporters (-0.02).</li>
        <li><strong>Three-strikes admin:</strong> Peers unquarantined 3+ times face permanent ban.</li>
        <li><strong>Proof-of-Work:</strong> URL announcements require Hashcash PoW — difficulty scales inversely with trust.</li>
      </ul>
      <h4>Document Quarantine Flow</h4>
      <pre style="background:var(--bg-card);padding:12px;border-radius:8px;font-size:0.85em;overflow-x:auto">
Document from low-trust peer (&lt; 0.15)
  │
  ├─ Enters quarantine (not searchable)
  ├─ 24-hour voting window opens
  │   ├─ Peers with trust > 0.3 can vote: approve or reject
  │   ├─ 3 approvals → promoted to index
  │   └─ 3 rejections → permanently discarded
  └─ No consensus after 24h → discarded
      </pre>
      <h4>Hash-Chained Audit Trail</h4>
      <p>Every trust action (report, dismiss, confirm, unquarantine, unblock) is recorded in a tamper-proof log. Each entry is a canonical JSON payload whose SHA-256 hash is chained to the previous entry and signed with the node's Ed25519 private key. Any break in the chain is instantly detectable.</p>`,
  },
  {
    id: 'intelligence', icon: 'zap', color: 'var(--amber)', title: 'Intelligence Layer',
    subtitle: 'ML ranking, knowledge graph, trends',
    summary: 'Phase 4 brings machine learning to the search stack: click-trained learn-to-rank, entity knowledge cards, trend detection, topic clustering, multilingual semantic search, and automatic summarization — all running locally, no cloud APIs.',
    diagram: 'intelligence',
    details: [
      { label: 'Knowledge Graph', text: 'NER extracts entities (person, org, location, tech, topic). Entity cards appear above search results. Relationships inferred from co-occurrence and Schema.org predicates.' },
      { label: 'Learn-to-Rank', text: 'Gradient-boosted decision stumps. 14 features, RankNet pairwise loss. Trains every 6h when 200+ click pairs available. Falls back to hand-tuned ranker otherwise.' },
      { label: 'Trend Detection', text: 'Hourly-bucketed counters for crawl domains and query terms. 7-day exponential moving average. Spike detection: current > 3x average = trending. Trending items get search boost.' },
      { label: 'Click Tracking', text: 'Records query + clicked URL + result position. Stored locally: <code>click:{query}:{url}</code>. Generates training pairs for LTR model. Never shared with peers.' },
      { label: 'Summarization', text: 'TextRank extractive: sentence similarity graph → power iteration (damping 0.85, 30 iterations) → top-N sentences reordered by position. 2-5 sentences per document.' },
      { label: 'Multilingual', text: 'Dictionary-based cross-lingual projection (~500 words, 9 languages). Bidirectional: "haus" (DE) maps to "house" (EN). No neural models needed.' },
      { label: 'Topic Clustering', text: 'Groups documents by domain + content similarity. Powers "related topics" in search results. Stored in BadgerDB: <code>cluster:{id}</code>.' },
    ],
    tech: ['TextRank', 'RankNet', 'NER', 'TF-IDF', 'Gradient Boosting'],
    modal: `<h3>Intelligence Deep Dive</h3>
      <h4>TF-IDF Embedder (Pure Go, No ML Models)</h4>
      <p>The embedder creates 384-dimensional vectors (matching MiniLM size) using feature hashing:</p>
      <ol>
        <li>Tokenize and lowercase input text</li>
        <li>Remove stop words</li>
        <li>For each token: FNV hash to a dimension index, accumulate TF-IDF weight</li>
        <li>L2-normalize the resulting vector</li>
      </ol>
      <p>These vectors power semantic search without any external ML models. The vector store is BadgerDB-backed: <code>vec:{docID}</code> stores raw float32 bytes. Search uses brute-force cosine similarity (fast enough for ~100K docs/node).</p>
      <h4>Learn-to-Rank Training</h4>
      <pre style="background:var(--bg-card);padding:12px;border-radius:8px;font-size:0.85em;overflow-x:auto">
Click tracking records: (query, url, position)
  │
  ├─ Generate training pairs: (clicked_url vs skipped_url)
  │   └─ Winner = clicked at lower position, Loser = skipped at higher position
  │
  ├─ Extract 14 features per document:
  │   BM25, E-E-A-T, quality, PageRank, domain authority,
  │   URL quality, readability, citation, link, SEO,
  │   author credibility, relevance, freshness, spam
  │
  ├─ Train gradient-boosted decision stumps
  │   └─ Loss: RankNet pairwise logistic
  │   └─ L = log(1 + exp(-(score_winner - score_loser)))
  │
  └─ Serialize model to BadgerDB: ltr:model
      (runs every 6 hours, min 200 click pairs)
      </pre>
      <h4>Entity Knowledge Cards</h4>
      <p>NER identifies entities using capitalization patterns, context windows, and Schema.org type hints. Extracted types: person, organization, location, technology, topic. When a search query matches a known entity name, a card appears above results showing: type, description snippet, related entities, and source URLs.</p>`,
  },
  {
    id: 'storage', icon: 'database', color: 'var(--green)', title: 'Storage Architecture',
    subtitle: 'BadgerDB + Bleve — zero external dependencies',
    summary: 'All data lives in two embedded stores: BadgerDB for key-value metadata (link graph, trust scores, entities, trends, click data, dedup fingerprints) and Bleve for full-text search indexing. No external databases, no cloud services.',
    diagram: 'storage',
    details: [
      { label: 'BadgerDB', text: 'Pure-Go LSM-tree key-value store. Single instance shared by all subsystems. Key prefixes partition data: <code>queue:</code>, <code>link:</code>, <code>trust:</code>, <code>entity:</code>, <code>trend:</code>, <code>click:</code>, <code>cluster:</code>, <code>vec:</code>, <code>dedup:</code>, <code>audit:</code>, <code>fleet:</code>, <code>ltr:</code>.' },
      { label: 'Bleve', text: 'Go-native full-text search. Custom English analyzer: Unicode tokenizer → lowercase → stop words → Snowball stemmer. 15 language analyzers registered. Optional horizontal sharding.' },
      { label: 'Persistence', text: 'All stored in <code>--data-dir</code> (default <code>./data/doogle/</code>). Peer identity key, BadgerDB, and Bleve indices survive restarts. URL frontier drains to BadgerDB on shutdown.' },
    ],
    tech: ['BadgerDB', 'Bleve', 'LSM-tree', 'Snowball Stemmer'],
    modal: `<h3>Storage Deep Dive</h3>
      <h4>BadgerDB Key Prefix Map</h4>
      <table style="width:100%;font-size:0.85em;margin:12px 0">
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>queue:{ts}:{url}</code></td><td style="padding:4px">URL frontier overflow</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>link:{src}:{tgt}</code></td><td style="padding:4px">Backlink graph (PageRank)</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>trust:reputation:{pid}</code></td><td style="padding:4px">Peer trust scores</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>trust:report:{rid}</code></td><td style="padding:4px">Spam report records</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>trust:domvotes:{dom}</code></td><td style="padding:4px">Consensus domain votes</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>trust:quarantine:{pid}</code></td><td style="padding:4px">Quarantined peer records</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>dedup:fp:{hash}</code></td><td style="padding:4px">Content fingerprints</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>audit:chain:{rid}</code></td><td style="padding:4px">Audit trail entries</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>entity:{type}:{name}</code></td><td style="padding:4px">Knowledge graph entities</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>entity_rel:{a}:{b}</code></td><td style="padding:4px">Entity relationships</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>trend:{kind}:{name}:{hr}</code></td><td style="padding:4px">Hourly counters (7-day TTL)</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>click:{q}:{url}</code></td><td style="padding:4px">Click-through records</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>vec:{docID}</code></td><td style="padding:4px">384-dim TF-IDF embeddings</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><code>cluster:{id}</code></td><td style="padding:4px">Topic cluster data</td></tr>
        <tr><td style="padding:4px"><code>ltr:model</code></td><td style="padding:4px">Serialized learn-to-rank model</td></tr>
      </table>
      <h4>Bleve Analyzer Pipeline</h4>
      <pre style="background:var(--bg-card);padding:12px;border-radius:8px;font-size:0.85em;overflow-x:auto">
Input text
  │
  ├─ Unicode tokenizer (word boundaries)
  ├─ Lowercase filter
  ├─ Stop word removal (English default)
  ├─ Snowball stemmer (language-specific)
  └─ Indexed terms ready for BM25 matching

Indexed fields (with boosts):
  title (5x) | url_text (3x) | headings_text (2x)
  description (1.5x) | content (1x)
  anchor_text | keywords | categories
  image_text | structured_text
      </pre>`,
  },
];

// ── Diagram renderers (SVG-based) ────────────────────────

function drawDiagram(canvasId, type) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = Math.min(canvas.parentElement.offsetWidth || 800, 860);
  const H = 320;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const accent = getCSS('--accent') || '#00d4ff';
  const blue = getCSS('--blue') || '#3b82f6';
  const green = getCSS('--green') || '#10b981';
  const purple = getCSS('--purple') || '#a855f7';
  const amber = getCSS('--amber') || '#f59e0b';
  const red = getCSS('--red') || '#ef4444';
  const textColor = getCSS('--text-primary') || '#e8e8f0';
  const textMuted = getCSS('--text-secondary') || '#888';
  const bgCard = getCSS('--bg-card') || '#1a1a2e';

  ctx.clearRect(0, 0, W, H);

  const diagrams = {
    network: () => drawNetworkDiagram(ctx, W, H, { accent, blue, green, purple, amber, red, textColor, textMuted, bgCard }),
    shard: () => drawShardDiagram(ctx, W, H, { accent, blue, green, purple, amber, red, textColor, textMuted, bgCard }),
    crawl: () => drawCrawlDiagram(ctx, W, H, { accent, blue, green, purple, amber, red, textColor, textMuted, bgCard }),
    index: () => drawIndexDiagram(ctx, W, H, { accent, blue, green, purple, amber, red, textColor, textMuted, bgCard }),
    search: () => drawSearchDiagram(ctx, W, H, { accent, blue, green, purple, amber, red, textColor, textMuted, bgCard }),
    trust: () => drawTrustDiagram(ctx, W, H, { accent, blue, green, purple, amber, red, textColor, textMuted, bgCard }),
    intelligence: () => drawIntelligenceDiagram(ctx, W, H, { accent, blue, green, purple, amber, red, textColor, textMuted, bgCard }),
    storage: () => drawStorageDiagram(ctx, W, H, { accent, blue, green, purple, amber, red, textColor, textMuted, bgCard }),
  };

  if (diagrams[type]) diagrams[type]();
}

// ── Helper drawing functions ──────────────────────────────

function drawBox(ctx, x, y, w, h, color, label, opts = {}) {
  const r = opts.radius || 8;
  ctx.fillStyle = hexToRgba(color, opts.bgAlpha || 0.15);
  ctx.strokeStyle = hexToRgba(color, 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
  if (label) {
    ctx.fillStyle = color;
    ctx.font = `${opts.bold ? 'bold ' : ''}${opts.fontSize || 11}px system-ui`;
    ctx.textAlign = opts.align || 'center';
    ctx.fillText(label, opts.align === 'left' ? x + 8 : x + w / 2, y + h / 2 + 4);
  }
}

function drawArrow(ctx, x1, y1, x2, y2, color, opts = {}) {
  ctx.strokeStyle = hexToRgba(color, opts.alpha || 0.5);
  ctx.lineWidth = opts.width || 1.5;
  if (opts.dashed) ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = opts.headSize || 6;
  ctx.fillStyle = hexToRgba(color, opts.alpha || 0.5);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - 0.4), y2 - size * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - size * Math.cos(angle + 0.4), y2 - size * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawLabel(ctx, x, y, text, color, opts = {}) {
  ctx.fillStyle = color;
  ctx.font = `${opts.bold ? 'bold ' : ''}${opts.size || 10}px system-ui`;
  ctx.textAlign = opts.align || 'center';
  ctx.fillText(text, x, y);
}

// ── Individual diagram renderers ──────────────────────────

function drawNetworkDiagram(ctx, W, H, c) {
  // Central node
  const cx = W / 2, cy = H / 2;
  drawBox(ctx, cx - 50, cy - 25, 100, 50, c.accent, 'Your Node', { bold: true, fontSize: 12 });

  // Peer nodes in a circle
  const peers = ['Peer A', 'Peer B', 'Peer C', 'Peer D', 'Peer E'];
  const radius = Math.min(W, H) * 0.38;
  peers.forEach((p, i) => {
    const angle = (i / peers.length) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    drawBox(ctx, px - 35, py - 18, 70, 36, c.blue, p, { fontSize: 10 });
    drawArrow(ctx, cx + Math.cos(angle) * 55, cy + Math.sin(angle) * 30, px - Math.cos(angle) * 38, py - Math.sin(angle) * 20, c.blue, { alpha: 0.3 });
  });

  // Labels
  drawLabel(ctx, W / 2, 20, 'P2P Network Topology', c.textColor, { bold: true, size: 13 });
  drawLabel(ctx, W / 2, H - 15, 'Kademlia DHT + IPFS Discovery + mDNS  |  GossipSub Pub/Sub  |  Noise/TLS Encryption', c.textMuted, { size: 9 });

  // Protocol labels on some connections
  drawLabel(ctx, cx - radius * 0.3, cy - radius * 0.4, '/search', c.green, { size: 9 });
  drawLabel(ctx, cx + radius * 0.35, cy - radius * 0.35, '/crawl', c.amber, { size: 9 });
  drawLabel(ctx, cx + radius * 0.4, cy + radius * 0.25, '/replicate', c.purple, { size: 9 });
}

function drawShardDiagram(ctx, W, H, c) {
  drawLabel(ctx, W / 2, 22, 'Consistent Hash Ring — Domain Routing', c.textColor, { bold: true, size: 13 });

  // Draw hash ring
  const cx = W * 0.3, cy = H / 2 + 5, r = Math.min(W * 0.22, 110);
  ctx.strokeStyle = hexToRgba(c.accent, 0.3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Nodes on ring
  const nodes = [
    { label: 'Node A', angle: -Math.PI / 3, color: c.blue },
    { label: 'Node B', angle: Math.PI / 6, color: c.green },
    { label: 'Node C', angle: Math.PI * 2 / 3, color: c.purple },
    { label: 'You', angle: Math.PI * 7 / 6, color: c.accent },
  ];
  nodes.forEach(n => {
    const nx = cx + Math.cos(n.angle) * r;
    const ny = cy + Math.sin(n.angle) * r;
    ctx.fillStyle = n.color;
    ctx.beginPath();
    ctx.arc(nx, ny, 8, 0, Math.PI * 2);
    ctx.fill();
    drawLabel(ctx, nx, ny - 14, n.label, n.color, { bold: true, size: 10 });
  });

  // Domain sectors (arcs)
  const sectors = [
    { start: -Math.PI / 3, end: Math.PI / 6, color: c.blue, label: 'github.com' },
    { start: Math.PI / 6, end: Math.PI * 2 / 3, color: c.green, label: 'wikipedia.org' },
    { start: Math.PI * 2 / 3, end: Math.PI * 7 / 6, color: c.purple, label: 'news.ycombinator.com' },
    { start: Math.PI * 7 / 6, end: Math.PI * 5 / 3, color: c.accent, label: 'docs.python.org' },
  ];
  sectors.forEach(s => {
    ctx.strokeStyle = hexToRgba(s.color, 0.25);
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 15, s.start, s.end);
    ctx.stroke();
  });

  // Routing flow on right side
  const rx = W * 0.6;
  drawBox(ctx, rx, 40, W * 0.35, 36, c.accent, 'URL arrives: docs.python.org/tutorial', { fontSize: 10 });
  drawArrow(ctx, rx + W * 0.175, 76, rx + W * 0.175, 100, c.accent);
  drawBox(ctx, rx, 100, W * 0.35, 30, c.amber, 'hash(domain) → ring position', { fontSize: 10 });
  drawArrow(ctx, rx + W * 0.175, 130, rx + W * 0.175, 152, c.amber);
  drawBox(ctx, rx, 152, W * 0.35, 30, c.blue, 'Am I the owner?', { fontSize: 10, bold: true });

  // Yes/No branches
  const midX = rx + W * 0.175;
  drawArrow(ctx, midX - 40, 182, midX - 40, 208, c.green);
  drawLabel(ctx, midX - 56, 198, 'YES', c.green, { bold: true, size: 10 });
  drawBox(ctx, rx - 10, 208, W * 0.18, 28, c.green, 'Crawl locally', { fontSize: 10 });

  drawArrow(ctx, midX + 40, 182, midX + 40, 208, c.red);
  drawLabel(ctx, midX + 54, 198, 'NO', c.red, { bold: true, size: 10 });
  drawBox(ctx, midX + 5, 208, W * 0.18, 28, c.purple, 'Forward to owner', { fontSize: 10 });

  drawArrow(ctx, midX, 242, midX, 265, c.accent);
  drawBox(ctx, rx, 265, W * 0.35, 28, c.accent, 'Replicate to shard peers', { fontSize: 10 });

  drawLabel(ctx, W / 2, H - 10, 'FNV-32a hash  |  64 virtual nodes/peer  |  Auto-rebalance on topology change', c.textMuted, { size: 9 });
}

function drawCrawlDiagram(ctx, W, H, c) {
  drawLabel(ctx, W / 2, 22, 'Crawl Pipeline — URL to Content', c.textColor, { bold: true, size: 13 });

  const steps = [
    { label: 'URL Frontier', sub: '10K memory + BadgerDB', color: c.accent },
    { label: 'robots.txt', sub: 'Cached 24h/domain', color: c.blue },
    { label: 'Rate Limit', sub: '10 req/min/domain', color: c.amber },
    { label: 'HTTP Fetch', sub: 'Follow redirects', color: c.green },
    { label: 'Arc90 Extract', sub: 'Main content', color: c.purple },
    { label: 'Rich Metadata', sub: 'OG, Schema, links', color: c.accent },
  ];

  const stepW = Math.min((W - 80) / steps.length, 130);
  const gap = 8;
  const totalW = steps.length * stepW + (steps.length - 1) * gap;
  const startX = (W - totalW) / 2;
  const y = 55;

  steps.forEach((s, i) => {
    const x = startX + i * (stepW + gap);
    drawBox(ctx, x, y, stepW, 55, s.color, '', { radius: 10 });
    drawLabel(ctx, x + stepW / 2, y + 22, s.label, s.color, { bold: true, size: 10 });
    drawLabel(ctx, x + stepW / 2, y + 38, s.sub, c.textMuted, { size: 8 });
    if (i < steps.length - 1) {
      drawArrow(ctx, x + stepW + 1, y + 27, x + stepW + gap - 1, y + 27, c.textMuted, { headSize: 4 });
    }
  });

  // Worker pool section below
  const poolY = 140;
  drawBox(ctx, W * 0.05, poolY, W * 0.9, 80, c.blue, '', { bgAlpha: 0.08 });
  drawLabel(ctx, W / 2, poolY + 16, 'Worker Pool (configurable, default 8 goroutines)', c.blue, { bold: true, size: 11 });

  const workers = 6;
  const wW = Math.min((W * 0.8) / workers, 100);
  const wStartX = (W - workers * wW - (workers - 1) * 6) / 2;
  for (let i = 0; i < workers; i++) {
    const wx = wStartX + i * (wW + 6);
    drawBox(ctx, wx, poolY + 30, wW, 36, c.green, `Worker ${i + 1}`, { fontSize: 9 });
  }

  // Content extraction output
  const outY = 245;
  drawArrow(ctx, W / 2, poolY + 80, W / 2, outY, c.accent);
  drawLabel(ctx, W / 2, outY - 6, 'onDocumentCrawled callback', c.accent, { size: 9, bold: true });

  const outputs = ['Title & Content', 'Links (int/ext)', 'Images & Alt', 'Schema.org', 'Headings H1-H6', 'OG Tags'];
  const oW = Math.min((W - 40) / outputs.length, 120);
  const oStartX = (W - outputs.length * oW - (outputs.length - 1) * 4) / 2;
  outputs.forEach((o, i) => {
    const ox = oStartX + i * (oW + 4);
    drawBox(ctx, ox, outY + 5, oW, 28, c.green, o, { fontSize: 9 });
  });

  drawLabel(ctx, W / 2, H - 10, 'goquery HTML parsing  |  go-rod headless fallback  |  PDF binary extraction', c.textMuted, { size: 9 });
}

function drawIndexDiagram(ctx, W, H, c) {
  drawLabel(ctx, W / 2, 22, 'Indexing Pipeline — Document Processing', c.textColor, { bold: true, size: 13 });

  const steps = [
    { label: 'Verify', sub: 'Ed25519 sign', color: c.blue },
    { label: 'Dedup', sub: '4-gram shingles', color: c.purple },
    { label: 'Score', sub: '12 signals', color: c.amber },
    { label: 'Spam Check', sub: 'Reject > 0.7', color: c.red },
    { label: 'NER + Summary', sub: 'Entities, TextRank', color: c.green },
    { label: 'Embed', sub: 'TF-IDF 384-dim', color: c.accent },
    { label: 'Bleve Write', sub: 'Batch index', color: c.green },
  ];

  const stepH = 30;
  const gap = 6;
  const colW = Math.min(W * 0.35, 220);
  const startX = (W - colW) / 2;
  const startY = 40;

  steps.forEach((s, i) => {
    const y = startY + i * (stepH + gap);
    const numLabel = `${i + 1}`;
    // Step number circle
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(startX - 18, y + stepH / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    drawLabel(ctx, startX - 18, y + stepH / 2 + 4, numLabel, '#fff', { bold: true, size: 10 });

    drawBox(ctx, startX, y, colW, stepH, s.color, '', { radius: 6 });
    drawLabel(ctx, startX + colW / 2, y + 13, s.label, s.color, { bold: true, size: 10 });
    drawLabel(ctx, startX + colW / 2, y + 25, s.sub, c.textMuted, { size: 8 });

    if (i < steps.length - 1) {
      drawArrow(ctx, startX + colW / 2, y + stepH, startX + colW / 2, y + stepH + gap, s.color, { headSize: 4, alpha: 0.4 });
    }
  });

  // Side annotations — quality signals
  const sigX = startX + colW + 40;
  const sigY = startY + 2 * (stepH + gap);
  drawLabel(ctx, sigX + 50, sigY - 4, 'Quality Signals', c.amber, { bold: true, size: 11 });
  const sigs = [
    ['E-E-A-T 15%', 'PageRank 15%'],
    ['Quality 10%', 'Domain Auth 10%'],
    ['Readability 8%', 'Citation 8%'],
    ['Freshness 8%', 'Relevance 6%'],
    ['URL Quality 5%', 'SEO 5%'],
    ['Link 5%', 'Author 5%'],
  ];
  sigs.forEach((row, i) => {
    row.forEach((s, j) => {
      drawLabel(ctx, sigX + j * 100, sigY + 14 + i * 14, s, c.textMuted, { size: 8.5, align: 'left' });
    });
  });

  drawLabel(ctx, W / 2, H - 10, 'StaticScore = (0.5 + signals * 2.0) * (1.0 - spam * 0.8)  |  Range [0.1, 2.5]', c.textMuted, { size: 9 });
}

function drawSearchDiagram(ctx, W, H, c) {
  drawLabel(ctx, W / 2, 22, 'Search Pipeline — Query to Results', c.textColor, { bold: true, size: 13 });

  // Two-column: local search (left) + distributed (right)
  const leftX = W * 0.05;
  const rightX = W * 0.55;
  const colW = W * 0.4;

  // Local search steps
  drawLabel(ctx, leftX + colW / 2, 44, 'Local Engine', c.accent, { bold: true, size: 11 });
  const local = [
    { label: 'Parse query', color: c.accent },
    { label: 'Expand synonyms (100+)', color: c.blue },
    { label: 'Classify intent', color: c.purple },
    { label: 'Hybrid: BM25 + Vector (RRF)', color: c.green },
    { label: 'Extract snippets', color: c.amber },
    { label: 'Re-rank (intent * StaticScore)', color: c.accent },
    { label: 'Entity cards + trends', color: c.purple },
  ];
  const stepH = 28, gap = 4;
  local.forEach((s, i) => {
    const y = 55 + i * (stepH + gap);
    drawBox(ctx, leftX, y, colW, stepH, s.color, s.label, { fontSize: 9.5 });
    if (i < local.length - 1) {
      drawArrow(ctx, leftX + colW / 2, y + stepH, leftX + colW / 2, y + stepH + gap, s.color, { headSize: 3, alpha: 0.3 });
    }
  });

  // Distributed search (right)
  drawLabel(ctx, rightX + colW / 2, 44, 'Distributed Layer', c.blue, { bold: true, size: 11 });
  const dist = [
    { label: 'Check LRU cache (5min TTL)', color: c.green },
    { label: 'Fan-out to up to 10 peers', color: c.blue },
    { label: 'Parallel 5s timeout', color: c.blue },
    { label: 'Merge all results', color: c.purple },
    { label: 'Dedup by URL', color: c.amber },
    { label: 'Domain diversity (max 2/domain)', color: c.accent },
    { label: 'Cache & return', color: c.green },
  ];
  dist.forEach((s, i) => {
    const y = 55 + i * (stepH + gap);
    drawBox(ctx, rightX, y, colW, stepH, s.color, s.label, { fontSize: 9.5 });
    if (i < dist.length - 1) {
      drawArrow(ctx, rightX + colW / 2, y + stepH, rightX + colW / 2, y + stepH + gap, s.color, { headSize: 3, alpha: 0.3 });
    }
  });

  // Connection arrow between local and distributed
  const midY = 55 + 3 * (stepH + gap) + stepH / 2;
  drawArrow(ctx, leftX + colW, midY, rightX, midY, c.accent, { dashed: true });
  drawLabel(ctx, (leftX + colW + rightX) / 2, midY - 8, 'results', c.textMuted, { size: 8 });

  drawLabel(ctx, W / 2, H - 10, 'final = BM25 * StaticScore * freshnessDecay * intentMultiplier  (or LTR model when trained)', c.textMuted, { size: 9 });
}

function drawTrustDiagram(ctx, W, H, c) {
  drawLabel(ctx, W / 2, 22, 'Trust & Quarantine — Strike-Based Graduated Tiers', c.textColor, { bold: true, size: 13 });

  // Trust tier bars
  const tiers = [
    { label: 'Trusted', strikes: '0-2', score: '1.0x', color: c.green, width: 0.9 },
    { label: 'Warning', strikes: '3-4', score: '0.8x', color: c.amber, width: 0.72 },
    { label: 'Throttled', strikes: '5-7', score: '0.5x', color: c.amber, width: 0.45 },
    { label: 'Quarantined', strikes: '8-14', score: '0.0x', color: c.red, width: 0.15 },
    { label: 'Excommunicated', strikes: '15+', score: 'BAN', color: c.red, width: 0.05 },
  ];

  const barMaxW = W * 0.45;
  const barH = 28;
  const barGap = 8;
  const barX = W * 0.04;
  const barStartY = 50;

  tiers.forEach((t, i) => {
    const y = barStartY + i * (barH + barGap);
    const w = barMaxW * t.width;
    ctx.fillStyle = hexToRgba(t.color, 0.2);
    ctx.strokeStyle = hexToRgba(t.color, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX, y, w, barH, 4);
    ctx.fill();
    ctx.stroke();

    drawLabel(ctx, barX + 8, y + barH / 2 + 4, t.label, t.color, { bold: true, size: 10, align: 'left' });
    drawLabel(ctx, barX + barMaxW + 10, y + 12, `Strikes: ${t.strikes}`, c.textMuted, { size: 9, align: 'left' });
    drawLabel(ctx, barX + barMaxW + 10, y + 24, `Search: ${t.score}`, t.color, { size: 9, align: 'left', bold: true });
  });

  // Quarantine flow on right
  const qx = W * 0.58;
  drawLabel(ctx, qx + W * 0.18, 44, 'Document Quarantine Flow', c.red, { bold: true, size: 11 });

  const qSteps = [
    { label: 'Doc from low-trust peer', color: c.red },
    { label: 'Enter quarantine', color: c.amber },
    { label: '24h voting window', color: c.amber },
    { label: '3 approvals', color: c.green },
    { label: 'Promoted to index', color: c.green },
  ];
  const qW = W * 0.36;
  const qH = 26;
  const qGap = 6;

  qSteps.forEach((s, i) => {
    const y = 60 + i * (qH + qGap);
    drawBox(ctx, qx, y, qW, qH, s.color, s.label, { fontSize: 9.5 });
    if (i < qSteps.length - 1) {
      drawArrow(ctx, qx + qW / 2, y + qH, qx + qW / 2, y + qH + qGap, s.color, { headSize: 3, alpha: 0.4 });
    }
  });

  // Rejection branch
  const rejY = 60 + 2 * (qH + qGap) + qH;
  drawArrow(ctx, qx + qW, 60 + 2 * (qH + qGap) + qH / 2, qx + qW + 30, 60 + 2 * (qH + qGap) + qH / 2, c.red, { dashed: true });
  drawLabel(ctx, qx + qW + 55, 60 + 2 * (qH + qGap) + qH / 2 + 4, '3 rejects', c.red, { size: 9 });
  drawLabel(ctx, qx + qW + 55, 60 + 2 * (qH + qGap) + qH / 2 + 16, '= discard', c.red, { size: 9 });

  // Audit trail
  const auditY = 240;
  drawBox(ctx, W * 0.15, auditY, W * 0.7, 36, c.purple, '', { bgAlpha: 0.08 });
  drawLabel(ctx, W / 2, auditY + 14, 'Hash-Chained Audit Trail (Ed25519 signed)', c.purple, { bold: true, size: 10 });
  drawLabel(ctx, W / 2, auditY + 28, 'report → SHA-256(payload + prevHash) → sign → BadgerDB', c.textMuted, { size: 9 });

  drawLabel(ctx, W / 2, H - 10, 'Exponential decay: 0.998/idle-hour (~14d half-life)  |  PoW scales with trust  |  Peer age gating', c.textMuted, { size: 9 });
}

function drawIntelligenceDiagram(ctx, W, H, c) {
  drawLabel(ctx, W / 2, 22, 'Intelligence Layer — ML, NER, Trends, Clustering', c.textColor, { bold: true, size: 13 });

  const features = [
    { label: 'Knowledge Graph', sub: 'NER → Entity Cards', color: c.purple, x: 0.05, y: 50 },
    { label: 'Learn-to-Rank', sub: 'Gradient boosted stumps', color: c.amber, x: 0.37, y: 50 },
    { label: 'Trend Detection', sub: 'Hourly counters + EMA', color: c.red, x: 0.69, y: 50 },
    { label: 'Click Tracking', sub: 'Query + URL + position', color: c.green, x: 0.05, y: 130 },
    { label: 'Summarization', sub: 'TextRank extractive', color: c.blue, x: 0.37, y: 130 },
    { label: 'Multilingual', sub: '9 langs, ~500 words', color: c.accent, x: 0.69, y: 130 },
  ];

  const fW = W * 0.27;
  const fH = 55;

  features.forEach(f => {
    const fx = W * f.x;
    drawBox(ctx, fx, f.y, fW, fH, f.color, '', { radius: 10 });
    drawLabel(ctx, fx + fW / 2, f.y + 22, f.label, f.color, { bold: true, size: 11 });
    drawLabel(ctx, fx + fW / 2, f.y + 38, f.sub, c.textMuted, { size: 9 });
  });

  // Central "Search Engine" box
  const seY = 210;
  drawBox(ctx, W * 0.2, seY, W * 0.6, 40, c.accent, 'Search Engine', { bold: true, fontSize: 13 });

  // Arrows from features to search engine
  features.forEach(f => {
    const fx = W * f.x + fW / 2;
    const fy = f.y + fH;
    drawArrow(ctx, fx, fy, W / 2, seY, c.accent, { alpha: 0.2, dashed: true });
  });

  // TF-IDF embedder detail
  drawBox(ctx, W * 0.15, seY + 55, W * 0.7, 36, c.green, '', { bgAlpha: 0.08 });
  drawLabel(ctx, W / 2, seY + 70, 'TF-IDF Embedder: tokenize → hash → 384-dim vector → L2 normalize → cosine similarity', c.green, { size: 9 });
  drawLabel(ctx, W / 2, seY + 84, 'Pure Go, no external ML models, BadgerDB-backed vector store', c.textMuted, { size: 8 });

  drawLabel(ctx, W / 2, H - 10, 'All intelligence runs locally  |  No cloud APIs  |  No external dependencies', c.textMuted, { size: 9 });
}

function drawStorageDiagram(ctx, W, H, c) {
  drawLabel(ctx, W / 2, 22, 'Storage Architecture — Everything in One Binary', c.textColor, { bold: true, size: 13 });

  // BadgerDB box (left)
  const bx = W * 0.04, by = 50, bw = W * 0.44, bh = 230;
  drawBox(ctx, bx, by, bw, bh, c.amber, '', { bgAlpha: 0.06 });
  drawLabel(ctx, bx + bw / 2, by + 18, 'BadgerDB (Key-Value)', c.amber, { bold: true, size: 12 });

  const keys = [
    'queue:*  URL frontier', 'link:*  Backlink graph',
    'trust:*  Peer reputation', 'dedup:*  Content fingerprints',
    'entity:*  Knowledge graph', 'trend:*  Hourly counters',
    'click:*  Click tracking', 'vec:*  TF-IDF embeddings',
    'cluster:*  Topic clusters', 'audit:*  Audit trail',
    'ltr:model  LTR weights', 'fleet:*  Fleet nodes',
  ];
  keys.forEach((k, i) => {
    const col = i < 6 ? 0 : 1;
    const row = i < 6 ? i : i - 6;
    const kx = bx + 10 + col * (bw / 2);
    const ky = by + 38 + row * 18;
    drawLabel(ctx, kx, ky, k, c.textMuted, { size: 8.5, align: 'left' });
  });

  // Bleve box (right)
  const lx = W * 0.52, ly = 50, lw = W * 0.44, lh = 150;
  drawBox(ctx, lx, ly, lw, lh, c.green, '', { bgAlpha: 0.06 });
  drawLabel(ctx, lx + lw / 2, ly + 18, 'Bleve (Full-Text Search)', c.green, { bold: true, size: 12 });

  const bleveInfo = [
    'Analyzer: Unicode → lowercase → stop words → Snowball',
    'title (5x) | url_text (3x) | headings (2x)',
    'description (1.5x) | content (1x)',
    'Horizontal sharding: shard-0/, shard-1/, ...',
    '15 language analyzers registered',
  ];
  bleveInfo.forEach((b, i) => {
    drawLabel(ctx, lx + 10, ly + 40 + i * 16, b, c.textMuted, { size: 8.5, align: 'left' });
  });

  // Data dir box
  const dx = W * 0.52, dy = ly + lh + 20;
  drawBox(ctx, dx, dy, lw, 70, c.purple, '', { bgAlpha: 0.06 });
  drawLabel(ctx, dx + lw / 2, dy + 18, 'Data Directory', c.purple, { bold: true, size: 11 });
  drawLabel(ctx, dx + 10, dy + 36, './data/doogle/badger/   (metadata)', c.textMuted, { size: 9, align: 'left' });
  drawLabel(ctx, dx + 10, dy + 50, './data/doogle/bleve/    (search index)', c.textMuted, { size: 9, align: 'left' });
  drawLabel(ctx, dx + 10, dy + 64, './data/doogle/node.key  (Ed25519 identity)', c.textMuted, { size: 9, align: 'left' });

  drawLabel(ctx, W / 2, H - 10, 'Zero external databases  |  All embedded  |  Survives restarts  |  ~50MB per 1K pages', c.textMuted, { size: 9 });
}

// ── Main Data Flow Diagram (top of page) ──────────────────

function drawMainFlowDiagram(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = Math.min(canvas.parentElement.offsetWidth || 900, 900);
  const H = 180;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const accent = getCSS('--accent') || '#00d4ff';
  const blue = getCSS('--blue') || '#3b82f6';
  const green = getCSS('--green') || '#10b981';
  const purple = getCSS('--purple') || '#a855f7';
  const amber = getCSS('--amber') || '#f59e0b';
  const red = getCSS('--red') || '#ef4444';
  const textColor = getCSS('--text-primary') || '#e8e8f0';
  const textMuted = getCSS('--text-secondary') || '#888';

  ctx.clearRect(0, 0, W, H);

  const steps = [
    { label: 'P2P Network', sub: 'libp2p + DHT', color: blue, icon: 'radio' },
    { label: 'Shard Ring', sub: 'Domain routing', color: purple, icon: 'network' },
    { label: 'Crawl', sub: 'Worker pool', color: accent, icon: 'download' },
    { label: 'Index', sub: '12 signals + Bleve', color: green, icon: 'database' },
    { label: 'Trust', sub: 'Quarantine', color: red, icon: 'shield' },
    { label: 'Search', sub: 'BM25 + Vector', color: accent, icon: 'search' },
    { label: 'Intelligence', sub: 'ML + NER', color: amber, icon: 'zap' },
  ];

  const stepW = Math.min((W - 60) / steps.length, 115);
  const gap = 8;
  const totalW = steps.length * stepW + (steps.length - 1) * gap;
  const startX = (W - totalW) / 2;
  const y = 30;
  const h = 100;

  steps.forEach((s, i) => {
    const x = startX + i * (stepW + gap);
    // Box
    ctx.fillStyle = hexToRgba(s.color, 0.12);
    ctx.strokeStyle = hexToRgba(s.color, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, stepW, h, 10);
    ctx.fill();
    ctx.stroke();

    // Number badge
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(x + stepW / 2, y + 22, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, x + stepW / 2, y + 26);

    // Label
    ctx.fillStyle = s.color;
    ctx.font = 'bold 11px system-ui';
    ctx.fillText(s.label, x + stepW / 2, y + 52);

    // Sub
    ctx.fillStyle = textMuted;
    ctx.font = '9px system-ui';
    ctx.fillText(s.sub, x + stepW / 2, y + 68);

    // Arrow
    if (i < steps.length - 1) {
      drawArrow(ctx, x + stepW + 1, y + h / 2, x + stepW + gap - 1, y + h / 2, textMuted, { headSize: 4, alpha: 0.4 });
    }
  });

  // Bottom label
  ctx.fillStyle = textMuted;
  ctx.font = '9px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Click any section below to explore in depth — every step has diagrams, technical details, and deep-dive modals', W / 2, H - 12);
}

// ── Main render function ──────────────────────────────────

export function renderHowItWorks(container) {
  if (window._pageInterval) { clearInterval(window._pageInterval); window._pageInterval = null; }

  container.innerHTML = `
    <div class="about-page">
      <section class="about-section" style="text-align:center;padding-top:40px">
        <h1 class="about-section-title" style="font-size:2.2em;margin-bottom:8px">How Doogle Works</h1>
        <p class="about-section-desc" style="max-width:700px;margin:0 auto 24px">
          A deep dive into every layer of the decentralized search engine — from P2P networking to ML-powered ranking.
          Everything runs in a single Go binary with zero external dependencies.
        </p>
        <div class="hiw-flow-canvas-wrap" style="max-width:900px;margin:0 auto">
          <canvas id="hiw-main-flow"></canvas>
        </div>
      </section>

      <div class="hiw-layers" id="hiw-layers">
        ${layers.map((layer, i) => `
          <section class="about-section about-reveal hiw-layer" id="hiw-${layer.id}">
            <div class="hiw-layer-header" data-layer="${i}">
              <div class="hiw-layer-num" style="background:${layer.color}">${i + 1}</div>
              <div>
                <h2 class="about-section-title" style="margin:0;font-size:1.5em;display:flex;align-items:center;gap:10px">
                  <span style="color:${layer.color}">${icon(layer.icon, 28)}</span>
                  ${layer.title}
                </h2>
                <p style="color:var(--text-secondary);margin:4px 0 0;font-size:0.9em">${layer.subtitle}</p>
              </div>
              <span class="hiw-expand-icon" style="color:var(--text-muted)">${icon('chevronDown', 20)}</span>
            </div>

            <p class="hiw-layer-summary">${layer.summary}</p>

            <div class="hiw-layer-body" data-layer-body="${i}">
              <div class="hiw-diagram-wrap">
                <canvas id="hiw-diagram-${layer.id}" class="hiw-diagram-canvas"></canvas>
              </div>

              <div class="hiw-details-grid">
                ${layer.details.map(d => `
                  <div class="hiw-detail-card">
                    <div class="hiw-detail-label" style="color:${layer.color}">${d.label}</div>
                    <div class="hiw-detail-text">${d.text}</div>
                  </div>
                `).join('')}
              </div>

              <div class="hiw-tech-row">
                ${layer.tech.map(t => `<span class="about-tech-badge" style="border-color:${layer.color};color:${layer.color}">${t}</span>`).join('')}
              </div>

            </div>
          </section>
        `).join('')}
      </div>

      <section class="about-section about-reveal" style="text-align:center">
        <h2 class="about-section-title">The Full Picture</h2>
        <p class="about-section-desc" style="max-width:640px;margin:0 auto 20px">
          All 7 layers working together in a single binary. No microservices, no cloud, no external databases.
          Download, run, search. It's that simple.
        </p>
        <div class="hiw-tech-row" style="justify-content:center;flex-wrap:wrap">
          <span class="about-tech-badge" style="border-color:var(--accent);color:var(--accent)">Go</span>
          <span class="about-tech-badge" style="border-color:var(--blue);color:var(--blue)">libp2p</span>
          <span class="about-tech-badge" style="border-color:var(--green);color:var(--green)">Bleve</span>
          <span class="about-tech-badge" style="border-color:var(--amber);color:var(--amber)">BadgerDB</span>
          <span class="about-tech-badge" style="border-color:var(--purple);color:var(--purple)">GossipSub</span>
          <span class="about-tech-badge" style="border-color:var(--red);color:var(--red)">Kademlia</span>
          <span class="about-tech-badge" style="border-color:var(--accent);color:var(--accent)">goquery</span>
          <span class="about-tech-badge" style="border-color:var(--green);color:var(--green)">Ed25519</span>
          <span class="about-tech-badge" style="border-color:var(--blue);color:var(--blue)">QUIC</span>
          <span class="about-tech-badge" style="border-color:var(--amber);color:var(--amber)">TextRank</span>
          <span class="about-tech-badge" style="border-color:var(--purple);color:var(--purple)">TF-IDF</span>
          <span class="about-tech-badge" style="border-color:var(--red);color:var(--red)">RankNet</span>
        </div>
      </section>

      <footer class="about-footer">
        <p>Built for information freedom. <a href="#/about" style="color:var(--accent)">Learn more about the project</a> or <a href="#/wizard" style="color:var(--accent)">run your own node</a>.</p>
      </footer>
    </div>
  `;

  // Draw main flow diagram
  drawMainFlowDiagram('hiw-main-flow');

  // Setup expand/collapse for layers
  setupLayerInteractions();

  // Setup scroll reveal
  setupScrollReveal();

  // Redraw on theme change
  const redraw = () => {
    drawMainFlowDiagram('hiw-main-flow');
    layers.forEach(l => {
      const body = document.querySelector(`[data-layer-body="${layers.indexOf(l)}"]`);
      if (body && body.classList.contains('hiw-layer-body-open')) {
        drawDiagram(`hiw-diagram-${l.id}`, l.id);
      }
    });
  };
  window.addEventListener('themechange', redraw);
  window._pageCleanup = () => window.removeEventListener('themechange', redraw);
}

function setupLayerInteractions() {
  document.querySelectorAll('.hiw-layer-header').forEach(header => {
    header.addEventListener('click', () => {
      const idx = parseInt(header.dataset.layer, 10);
      const body = document.querySelector(`[data-layer-body="${idx}"]`);
      const expandIcon = header.querySelector('.hiw-expand-icon');
      if (!body) return;

      const isOpen = body.classList.contains('hiw-layer-body-open');

      if (isOpen) {
        body.classList.remove('hiw-layer-body-open');
        body.style.maxHeight = '0';
        if (expandIcon) expandIcon.style.transform = 'rotate(0deg)';
      } else {
        body.classList.add('hiw-layer-body-open');
        body.style.maxHeight = body.scrollHeight + 100 + 'px';
        if (expandIcon) expandIcon.style.transform = 'rotate(180deg)';

        // Draw diagram when opened
        const layer = layers[idx];
        setTimeout(() => drawDiagram(`hiw-diagram-${layer.id}`, layer.id), 50);
      }
    });
  });
}

function setupScrollReveal() {
  const els = document.querySelectorAll('.about-reveal');
  if (!els.length) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  els.forEach(el => observer.observe(el));
}
