// Doogle v2 — Learn Page: Blog-style posts explaining the project
import { icon, escapeHtml, codeBlock, bindCopyButtons, bindCollapsibles } from '../components.js';

let activePost = null;

const posts = [
  {
    id: 'what-is-doogle',
    title: 'What Is Doogle?',
    icon: 'search',
    color: 'var(--accent)',
    date: '2026-03-01',
    tags: ['intro', 'overview'],
    summary: 'A peer-to-peer search engine where every node crawls, indexes, and searches — no central server, no tracking, no ads.',
    content: () => `
      <p>Doogle is an open-source, decentralized search engine. Instead of relying on a single company's servers,
      every Doogle node is a fully independent search engine that can crawl websites, build its own index, and answer search queries.</p>

      <h3>Why does this matter?</h3>
      <p>Traditional search engines are centralized — one company decides what you see, tracks your searches,
      and sells your attention to advertisers. Doogle takes a different approach:</p>

      <div class="learn-highlights">
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--green)">${icon('shield', 24)}</div>
          <div>
            <strong>Zero Tracking</strong>
            <p>No cookies, no search history, no user profiles. Your queries stay on your machine.</p>
          </div>
        </div>
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--blue)">${icon('network', 24)}</div>
          <div>
            <strong>Truly Decentralized</strong>
            <p>No central server. Every node is equal. If one node goes down, the network continues.</p>
          </div>
        </div>
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--purple)">${icon('code', 24)}</div>
          <div>
            <strong>Open Source</strong>
            <p>The entire codebase is public. You can inspect, modify, and contribute.</p>
          </div>
        </div>
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--amber)">${icon('zap', 24)}</div>
          <div>
            <strong>Single Binary</strong>
            <p>One Go binary. No databases to install, no Docker required, no external dependencies.</p>
          </div>
        </div>
      </div>

      <h3>How is it different from Google?</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th></th><th>Google</th><th>Doogle</th></tr>
          </thead>
          <tbody>
            <tr><td>Architecture</td><td>Centralized (100K+ servers)</td><td>Decentralized (your machine)</td></tr>
            <tr><td>Privacy</td><td>Tracks everything</td><td>Zero tracking</td></tr>
            <tr><td>Index size</td><td>Hundreds of billions of pages</td><td>Depends on your node + peers</td></tr>
            <tr><td>Ranking</td><td>ML models + click data + ads</td><td>BM25 + StaticScore + PageRank</td></tr>
            <tr><td>Cost</td><td>Free (you pay with data)</td><td>Free (you pay with compute)</td></tr>
            <tr><td>Ads</td><td>Everywhere</td><td>None</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Current Status</h3>
      <p>Doogle is a <strong>work in progress</strong>. The core engine works — crawling, indexing, searching, and P2P networking are all functional.
      Recent infrastructure upgrades added batch indexing, persistent deduplication, pre-computed StaticScore, shard-aware routing, document replication, a backlink graph for PageRank, and a guided <a href="#/wizard">onboarding wizard</a> with batch seed submission.</p>
      <p>Think of it as an early-stage experiment in what search could look like if it wasn't controlled by a single company.</p>
    `,
  },
  {
    id: 'how-search-works',
    title: 'How Doogle Search Works',
    icon: 'cpu',
    color: 'var(--purple)',
    date: '2026-03-01',
    tags: ['technical', 'search', 'ranking'],
    summary: 'From your query to ranked results — the full pipeline: parsing, matching, scoring, and re-ranking.',
    content: () => `
      <p>When you type a query into Doogle, a lot happens in milliseconds. Here's the full pipeline.</p>

      <h3>Step 1: Query Parsing</h3>
      <p>Your raw query is analyzed and structured:</p>
      <ul>
        <li><strong>Stop words removed</strong> — "how", "to", "the", "is" are stripped (they appear in every page)</li>
        <li><strong>Quoted phrases extracted</strong> — <code>"exact match"</code> searches for those words together</li>
        <li><strong>Filters parsed</strong> — <code>site:example.com</code> restricts to a domain, <code>lang:en</code> filters by language</li>
        <li><strong>Synonyms expanded</strong> — "js" also searches for "javascript", "k8s" for "kubernetes"</li>
        <li><strong>Fuzzy matching</strong> — for short queries, typo-tolerant matching is enabled</li>
      </ul>

      ${codeBlock(`Query: "how to learn javascript async"
Parsed:
  Terms: [learn, javascript, async]     (stop words removed)
  Synonyms: javascript → [js]
  Fuzzy: enabled (≤3 terms)`, 'text')}

      <h3>Step 2: Bleve Matching (BM25)</h3>
      <p>The parsed query is translated into a <strong>BooleanQuery</strong> with two tiers:</p>
      <div class="learn-highlights">
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--green)">${icon('shield', 20)}</div>
          <div>
            <strong>Must tier (primary)</strong>
            <p>AND match across fields — ALL query terms must appear in at least one field (title, description, content, or anchor text).
            This ensures results are actually relevant.</p>
          </div>
        </div>
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--amber)">${icon('trendingUp', 20)}</div>
          <div>
            <strong>Should tier (boost)</strong>
            <p>Phrase matches, fuzzy matches, and synonyms. These can't produce results alone — they only boost the score
            of documents that already matched the Must tier.</p>
          </div>
        </div>
      </div>

      <p>Field boosts determine how much each field contributes to the score:</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Field</th><th>Boost</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>Title (phrase match)</td><td>8.0x</td><td>Exact phrase in title = highest relevance</td></tr>
            <tr><td>Title (AND match)</td><td>3.0x</td><td>All terms in title = very relevant</td></tr>
            <tr><td>Anchor text</td><td>2.0x</td><td>How other pages describe this page</td></tr>
            <tr><td>Description</td><td>1.5x</td><td>Meta description summarizes the page</td></tr>
            <tr><td>Content</td><td>1.0x</td><td>Full page body text</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-collapsible">
        <button class="docs-collapse-trigger">Deep Dive: BM25 explained</button>
        <div class="docs-collapse-body">
          <p><a href="https://en.wikipedia.org/wiki/Okapi_BM25" target="_blank">BM25 (Best Matching 25)</a> is a probabilistic relevance ranking function. It considers:</p>
          <ul>
            <li><strong>Term frequency (TF)</strong> — how often the term appears in the document</li>
            <li><strong>Inverse document frequency (IDF)</strong> — how rare the term is across all documents</li>
            <li><strong>Document length normalization</strong> — longer documents get slightly penalized</li>
          </ul>
          <p>Doogle uses <a href="https://blevesearch.com/" target="_blank">Bleve's</a> BM25 implementation with parameters k1=1.2 and b=0.75 (Bleve defaults).</p>
        </div>
      </div>

      <h3>Step 3: Quality Re-ranking</h3>
      <p>Raw BM25 scores are multiplied by a pre-computed <strong>StaticScore</strong> and a freshness factor:</p>

      ${codeBlock(`Final Score = BM25 × StaticScore × Freshness Decay

StaticScore (pre-computed at index time):
  = (0.5 + qualitySignal × 2.0) × (1.0 - spamScore × 0.8)

  qualitySignal = weighted sum of:
    E-E-A-T score      (20%)  — expertise, authority, trust
    Quality score       (20%)  — content depth, structure
    PageRank            (20%)  — link authority from other pages
    Readability         (8%)   — Flesch-Kincaid readability
    Citation score      (8%)   — references to/from other sources
    SEO score           (8%)   — meta tags, headings, structure
    Author credibility  (5%)   — author info present
    Link score          (5%)   — internal/external link quality
    Relevance score     (6%)   — keyword density, topic match

StaticScore range: [0.1, 2.5]
Computed once at index time, not on every query.`, 'text')}

      <div class="docs-collapsible">
        <button class="docs-collapse-trigger">Deep Dive: Why pre-compute at index time?</button>
        <div class="docs-collapse-body">
          <p>In earlier versions, Doogle computed quality signals on every search query. This meant each query had to evaluate 10+ scoring signals per result — expensive at scale.</p>
          <p>By pre-computing a <strong>StaticScore</strong> at index time, the search path becomes: <code>BM25 * StaticScore * freshness</code> — three multiplications instead of 10+ evaluations. The incremental re-scorer updates stale StaticScores every 10 minutes in the background.</p>
        </div>
      </div>

      <h3>Step 4: Distributed Merge (Shard-Aware Routing)</h3>
      <p>If connected to peers, the query is routed intelligently:</p>
      <ul>
        <li><strong>site: queries</strong> — only the shard owner(s) are contacted (the node responsible for that domain)</li>
        <li><strong>General queries</strong> — a <strong>CoveringSet</strong> of peers that covers all shards is computed. This is O(sqrt(N)) instead of O(N) fan-out.</li>
      </ul>
      <p>Results from multiple peers are merged, deduplicated by URL, and re-ranked. You get the best results from across the entire network, without querying every single node.</p>

      <div class="docs-collapsible">
        <button class="docs-collapse-trigger">Deep Dive: How shard routing works</button>
        <div class="docs-collapse-body">
          <p>Doogle uses <a href="https://en.wikipedia.org/wiki/Consistent_hashing" target="_blank">consistent hashing</a> with 64 virtual nodes per peer. Each domain is hashed to a position on the ring, and the closest peer "owns" that shard.</p>
          <p>Peers broadcast their shard catalog (owned domains, doc count) via GossipSub every 60 seconds. When a query arrives, the router computes a minimal CoveringSet — the fewest peers needed to cover all shards.</p>
          <p>For a network of N peers, the CoveringSet is typically O(sqrt(N)), dramatically reducing query fan-out compared to broadcasting to all peers.</p>
        </div>
      </div>
    `,
  },
  {
    id: 'infrastructure',
    title: 'Under the Hood: Production Infrastructure',
    icon: 'database',
    color: 'var(--green)',
    date: '2026-03-01',
    tags: ['technical', 'infrastructure', 'new'],
    summary: 'How Doogle scales from toy to production — persistent storage, batch writes, pre-computed scores, shard routing, and replication.',
    content: () => `
      <p>Doogle recently underwent a major infrastructure upgrade. Here's what changed and why it matters.</p>

      <h3>The Problem</h3>
      <p>The original architecture had several scaling bottlenecks:</p>
      <div class="learn-highlights">
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--red)">${icon('alertTriangle', 20)}</div>
          <div>
            <strong>In-memory dedup lost on restart</strong>
            <p>URL deduplication used a Go map — every restart meant re-crawling the entire frontier.</p>
          </div>
        </div>
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--red)">${icon('alertTriangle', 20)}</div>
          <div>
            <strong>Single-doc indexing bottleneck</strong>
            <p>Documents were indexed one at a time. Bleve's single-write path is 10-50x slower than batch writes.</p>
          </div>
        </div>
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--red)">${icon('alertTriangle', 20)}</div>
          <div>
            <strong>Search-time score computation</strong>
            <p>Every query recomputed 10+ quality signals per result — expensive and redundant.</p>
          </div>
        </div>
        <div class="learn-highlight">
          <div class="learn-highlight-icon" style="color:var(--red)">${icon('alertTriangle', 20)}</div>
          <div>
            <strong>Fan-out to all peers</strong>
            <p>Every search query was broadcast to every connected peer — O(N) per query.</p>
          </div>
        </div>
      </div>

      <h3>1. Persistent Dedup (DedupStore)</h3>
      <p>URL deduplication is now backed by <a href="https://dgraph.io/badger" target="_blank">BadgerDB</a> with SHA-256 keys. This gives us:</p>
      <ul>
        <li><strong>Persistence</strong> — survives node restarts, no re-crawling</li>
        <li><strong>O(1) lookups</strong> — SHA-256 hash as key, boolean as value</li>
        <li><strong>Disk-efficient</strong> — BadgerDB's LSM-tree compaction keeps storage lean</li>
      </ul>

      <div class="docs-collapsible">
        <button class="docs-collapse-trigger">Technical details: DedupStore implementation</button>
        <div class="docs-collapse-body">
          ${codeBlock(`// DedupStore wraps BadgerDB for persistent URL dedup
type DedupStore struct {
    db *badger.DB
}

func (d *DedupStore) Seen(url string) bool {
    key := sha256.Sum256([]byte(url))
    err := d.db.View(func(txn *badger.Txn) error {
        _, err := txn.Get(key[:])
        return err
    })
    return err == nil
}`, 'go')}
        </div>
      </div>

      <h3>2. Batch Indexing</h3>
      <p>Documents are now buffered and flushed to <a href="https://blevesearch.com/" target="_blank">Bleve</a> in batches:</p>
      <ul>
        <li><strong>Buffer size</strong>: 100 documents (configurable via <code>--batch-size</code>)</li>
        <li><strong>Flush interval</strong>: 5 seconds max (configurable via <code>--batch-flush-interval</code>)</li>
        <li><strong>Throughput</strong>: 10-50x faster than single-doc writes</li>
      </ul>

      <div class="docs-collapsible">
        <button class="docs-collapse-trigger">Why batching matters</button>
        <div class="docs-collapse-body">
          <p>Bleve (like most search indexes) uses an inverted index backed by segments. Each single-document write creates a new segment, triggers a merge, and flushes to disk. Batching amortizes this overhead across many documents.</p>
          <p>With 100-doc batches, the cost of a segment create/merge is shared across 100 documents instead of paid once per document. The 5-second flush interval ensures documents are still indexed promptly even at low throughput.</p>
        </div>
      </div>

      <h3>3. StaticScore Pre-computation</h3>
      <p>Quality signals are now combined into a single <strong>StaticScore</strong> at index time:</p>
      ${codeBlock(`StaticScore = (0.5 + qualitySignal * 2.0) * (1.0 - spamScore * 0.8)

// Search becomes:
final = BM25 * StaticScore * freshnessDecay`, 'go')}
      <p>This moves 10+ signal evaluations from <strong>query time</strong> to <strong>index time</strong>. Each search query now does three multiplications instead of a full scoring pipeline per result.</p>

      <h3>4. Incremental Reindexing</h3>
      <p>A background process re-scores stale documents every 10 minutes (configurable). It uses <strong>generation tracking</strong>:</p>
      <ul>
        <li>Each indexing pass increments a monotonic generation counter</li>
        <li>Only documents with a stale generation are re-processed</li>
        <li>Freshness decay, PageRank changes, and quality drift are updated without re-crawling</li>
      </ul>

      <h3>5. Shard-Aware Routing</h3>
      <p>Queries now route to <strong>shard owners</strong> instead of all peers:</p>
      <ul>
        <li><strong>Consistent hashing</strong> with 64 virtual nodes per peer assigns domains to shards</li>
        <li><strong>site: queries</strong> contact only the shard owner — O(1) routing</li>
        <li><strong>General queries</strong> use a <strong>CoveringSet</strong> — the minimal set of peers covering all shards — O(sqrt(N)) fan-out</li>
      </ul>
      <p>Reference: <a href="https://en.wikipedia.org/wiki/Consistent_hashing" target="_blank">Consistent Hashing (Karger et al.)</a></p>

      <h3>6. Document Replication (N=3)</h3>
      <p>Every document is replicated to N nodes (default 3) for fault tolerance:</p>
      <ul>
        <li><strong>Consistent hashing</strong> determines which N nodes store each document</li>
        <li><strong>Merkle root anti-entropy</strong> — nodes periodically compare tree roots and sync missing documents</li>
        <li><strong>Automatic rebalancing</strong> — when peers join or leave, replication adjusts to maintain the target factor</li>
      </ul>
      <p>If a node goes down, its replicas serve the data. When it comes back, anti-entropy sync brings it up to date.</p>
    `,
  },
  {
    id: 'running-a-node',
    title: 'Running Your Own Node',
    icon: 'monitor',
    color: 'var(--green)',
    date: '2026-03-01',
    tags: ['guide', 'setup'],
    summary: 'Everything you need to run a Doogle node — from system requirements to seed URLs to connecting peers.',
    content: () => `
      <h3>Requirements</h3>
      <p>Doogle is lightweight. Here's what you need:</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Component</th><th>Minimum</th><th>Recommended</th></tr></thead>
          <tbody>
            <tr><td>CPU</td><td>1 core</td><td>2-4 cores</td></tr>
            <tr><td>RAM</td><td>256 MB</td><td>512 MB - 1 GB</td></tr>
            <tr><td>Disk</td><td>30 MB (empty)</td><td>~50 MB per 1K pages</td></tr>
            <tr><td>Network</td><td colspan="2">Port 4001 (P2P) + Port 8080 (Web UI)</td></tr>
            <tr><td>External deps</td><td colspan="2">None — single binary</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Quick Start with Docker</h3>
      ${codeBlock(`# From your local source:
cd doogle-v2
make docker-up

# Open http://localhost:8080`, 'bash')}

      <h3>Quick Start with Go</h3>
      ${codeBlock(`cd doogle-v2
make build
./bin/doogle --seed https://en.wikipedia.org,https://developer.mozilla.org

# Open http://localhost:8080`, 'bash')}

      <h3>Seed URLs</h3>
      <p>Seeds are the starting points for crawling. The crawler follows links from these pages to discover new content.
      You can add seeds via:</p>
      <ul>
        <li>The <a href="#/wizard">onboarding wizard</a> (auto-triggers on first launch — 8 curated categories)</li>
        <li>The <code>--seed</code> CLI flag (comma-separated)</li>
        <li>The <a href="#/admin/crawler">Crawler dashboard</a> in the web UI</li>
        <li>The <code>POST /api/crawl/batch</code> API endpoint (up to 200 URLs at once)</li>
        <li>The <code>POST /api/crawl</code> API endpoint (single URL)</li>
      </ul>
      <p>Good seeds are high-quality sites with lots of outbound links — Wikipedia, MDN, documentation sites,
      news aggregators like Hacker News.</p>

      <h3>Connecting to Peers</h3>
      <p>Nodes discover each other automatically on the same network via mDNS. Across networks, use bootstrap:</p>
      ${codeBlock(`./doogle --bootstrap /ip4/<IP>/tcp/4001/p2p/<PEER_ID>`, 'bash')}
      <p>Connected peers share crawl discoveries via <a href="https://docs.libp2p.io/concepts/pubsub/overview/" target="_blank">GossipSub</a> and respond to search queries,
      expanding your effective index beyond what your single node has crawled.</p>

      <h3>Configuration</h3>
      <p>Key flags you might want to tweak:</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Flag</th><th>Default</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>--port</code></td><td>4001</td><td>P2P listen port</td></tr>
            <tr><td><code>--api-port</code></td><td>8080</td><td>Web UI + API port</td></tr>
            <tr><td><code>--workers</code></td><td>4</td><td>Concurrent crawler workers</td></tr>
            <tr><td><code>--max-depth</code></td><td>5</td><td>Max link depth from seeds</td></tr>
            <tr><td><code>--data-dir</code></td><td>./data</td><td>Where to store index + data</td></tr>
            <tr><td><code>--enable-headless</code></td><td>false</td><td>JS rendering for SPAs</td></tr>
            <tr><td><code>--batch-size</code></td><td>100</td><td>Docs per batch index flush</td></tr>
            <tr><td><code>--replication-factor</code></td><td>3</td><td>Replicas per document</td></tr>
          </tbody>
        </table>
      </div>
    `,
  },
  {
    id: 'whats-next',
    title: 'What to Expect (Roadmap)',
    icon: 'trendingUp',
    color: 'var(--amber)',
    date: '2026-03-01',
    tags: ['roadmap', 'wip'],
    summary: 'A five-phase plan to index every corner of the web — from foundation to dark web to intelligence.',
    content: () => `
      <h3>What Works Today</h3>
      <div class="learn-status-grid">
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Web Crawling</strong>
          <p>Multi-worker crawler with robots.txt compliance, rate limiting, redirect handling, and content extraction.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Full-Text Search</strong>
          <p>BM25 ranking with field boosting, phrase matching, synonym expansion, fuzzy queries, and language filtering.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Quality Scoring</strong>
          <p>10+ signals including E-E-A-T, readability, spam detection, PageRank, and freshness decay.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>P2P Networking</strong>
          <p>Kademlia DHT, mDNS discovery, GossipSub pub/sub, and distributed search across peers.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Web UI</strong>
          <p>Search page, admin dashboard, crawler/indexer/network monitoring, docs, 5 switchable themes with unique background animations and animated logo text.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Onboarding Wizard</strong>
          <p>5-step guided setup that auto-triggers on fresh nodes. Pick seed categories, see your node identity, and launch crawling with live progress counters.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Batch Crawl API</strong>
          <p><code>POST /api/crawl/batch</code> accepts up to 200 URLs at once. Used by the wizard and available for programmatic seed management.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Backlink Graph</strong>
          <p>LinkStore persists inbound links in BadgerDB. Feeds PageRank computation and anchor text indexing for authority-aware ranking.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Headless Rendering</strong>
          <p>Optional Chromium-based JS rendering for React, Vue, Angular, and other SPA frameworks.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Shard-Aware Search Routing</strong>
          <p>Queries route only to shard owners instead of all peers. <code>site:</code> queries contact the shard owner directly. General queries use a CoveringSet — O(sqrt(N)) instead of O(N) fan-out.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Document Replication (N=3)</strong>
          <p>Every document is stored on 3 nodes. If one goes down, replicas serve the data. Merkle root anti-entropy keeps replicas consistent.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Batch Indexing</strong>
          <p>Documents are buffered and flushed in batches of 100. 10-50x faster write throughput via <a href="https://blevesearch.com/" target="_blank">Bleve's</a> batch API.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Persistent URL Dedup</strong>
          <p>URL deduplication backed by <a href="https://dgraph.io/badger" target="_blank">BadgerDB</a> — survives node restarts. No more re-crawling the entire frontier after a reboot.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Pre-computed StaticScore</strong>
          <p>Quality and spam signals are combined into a single score at index time. Search becomes <code>BM25 * StaticScore * freshness</code> — no per-query recomputation.</p>
        </div>
        <div class="learn-status-card learn-status-done">
          <span class="badge badge-green">working</span>
          <strong>Incremental Reindexing</strong>
          <p>Background process re-scores stale documents every 10 minutes. Freshness decay updates without re-crawling. Generation tracking ensures only stale docs are touched.</p>
        </div>
      </div>

      <h3>What's Being Improved</h3>
      <div class="learn-status-grid">
        <div class="learn-status-card learn-status-wip">
          <span class="badge badge-amber">improving</span>
          <strong>Ranking Quality</strong>
          <p>Tuning BM25 weights, phrase proximity boosting, better snippet generation, and score normalization.</p>
        </div>
        <div class="learn-status-card learn-status-wip">
          <span class="badge badge-amber">improving</span>
          <strong>Language Support</strong>
          <p>Language detection for 14+ languages, lang: filter, and language-aware ranking.</p>
        </div>
        <div class="learn-status-card learn-status-wip">
          <span class="badge badge-amber">improving</span>
          <strong>Index Coverage</strong>
          <p>Growing from hundreds to thousands of pages with diverse, high-quality seed URLs.</p>
        </div>
      </div>

      <h3>Phase 2 — Quality & Scale</h3>
      <div class="learn-status-grid">
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 2</span>
          <strong>Horizontal Index Sharding</strong>
          <p>Bleve split by shard, distributed via <code>/doogle/index/1.0.0</code>. Hash ring rebalancing on peer join/leave.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 2</span>
          <strong>Multi-Language Search</strong>
          <p>15+ language stemmers in Bleve with language-aware analyzers for global coverage.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 2</span>
          <strong>PDF & Document Indexing</strong>
          <p>Parse and index PDF, DOCX, EPUB via tika/pdftotext. Structured data extraction (Schema.org, JSON-LD).</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 2</span>
          <strong>Boolean Operators & Caching</strong>
          <p>AND, OR, NOT with grouping. LRU search result cache with TTL invalidation.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 2</span>
          <strong>Peer Reputation & Content Verification</strong>
          <p>Trust scoring based on response quality and uptime. Ed25519-signed documents for tamper detection.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 2</span>
          <strong>Image Search</strong>
          <p>Index images by alt text, caption, and surrounding context.</p>
        </div>
      </div>

      <h3>Phase 3 — Dark Web & Privacy</h3>
      <div class="learn-status-grid">
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-purple">phase 3</span>
          <strong>Tor Integration & .onion Crawling</strong>
          <p>Bundled/sidecar Tor daemon with automatic SOCKS5 routing. Frontier accepts .onion URLs with per-hidden-service rate limiting.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-purple">phase 3</span>
          <strong>I2P Eepsite Support</strong>
          <p>SAM bridge integration for crawling .i2p eepsites. Full I2P network participation.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-purple">phase 3</span>
          <strong>Privacy-Preserving P2P</strong>
          <p>Optional libp2p-over-Tor transport so peers never expose IPs. End-to-end encrypted queries — relays can't read them.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-purple">phase 3</span>
          <strong>.onion Seed Directories</strong>
          <p>ahmia.fi, Haystak, Torch as built-in wizard seed categories for dark web bootstrapping.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-purple">phase 3</span>
          <strong>Content Safety Layer</strong>
          <p>CSAM hash matching, configurable blocklists, enabled by default. Network source tagging (clearnet/tor/i2p) filterable in search UI.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-purple">phase 3</span>
          <strong>Tor Circuit Management</strong>
          <p>Connection pooling, circuit rotation, and bandwidth-aware scheduling for efficient .onion crawling.</p>
        </div>
      </div>

      <h3>Phase 4 — Intelligence</h3>
      <div class="learn-status-grid">
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 4</span>
          <strong>Semantic Search</strong>
          <p>Sentence embeddings via ONNX with hybrid BM25 + vector scoring. Multilingual cross-language retrieval.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 4</span>
          <strong>Knowledge Graph</strong>
          <p>NER to entity graph in BadgerDB. Entity cards in search results with related topics.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 4</span>
          <strong>ML-Based Ranking</strong>
          <p>Learn-to-rank from local-only click signals (XGBoost/ONNX). Query intent classification.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 4</span>
          <strong>Summarization & Clustering</strong>
          <p>Extractive summaries or local LLM via llama.cpp. Topic clustering and trend detection across the network.</p>
        </div>
      </div>

      <h3>Phase 5 — Ecosystem</h3>
      <div class="learn-status-grid">
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 5</span>
          <strong>CLI & Browser Extension</strong>
          <p><code>doogle search "query"</code> with pipe-friendly JSON output. Browser address bar search with optional P2P query obfuscation.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 5</span>
          <strong>Light Nodes & Mobile</strong>
          <p>~50 MB RAM relay-only mode. Mobile client connects to remote Doogle nodes. More nodes = stronger mesh.</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 5</span>
          <strong>Plugin System & Releases</strong>
          <p>Pluggable analyzers, scorers, content extractors. goreleaser builds for Linux, macOS, Windows (amd64 + arm64).</p>
        </div>
        <div class="learn-status-card learn-status-planned">
          <span class="badge badge-blue">phase 5</span>
          <strong>Governance & Incentives</strong>
          <p>Community proposals, node operator voting. Reputation + credit for uptime/crawl contribution (not a blockchain). Public bootstrap network.</p>
        </div>
      </div>

      <h3>How You Can Help</h3>
      <ul>
        <li><strong>Run a node</strong> — more nodes means better coverage and more resilient search</li>
        <li><strong>Add seeds</strong> — submit quality URLs to grow the index</li>
        <li><strong>Report bugs</strong> — found something broken? Open an issue when the repo goes public (coming soon)</li>
        <li><strong>Contribute code</strong> — the project is open source, PRs welcome</li>
        <li><strong>Run a Tor relay</strong> — help the network reach .onion services when Phase 3 lands</li>
        <li><strong>Curate dark web seeds</strong> — know good .onion directories or I2P eepsites? We'll need seed lists</li>
      </ul>
    `,
  },
];

export function renderLearn(container) {
  if (activePost) {
    renderPost(container, activePost);
    return;
  }

  container.innerHTML = `
    <div class="learn-page">
      <div class="learn-header">
        <h1>Learn</h1>
        <p>Understand how Doogle works, what to expect, and how to get involved.</p>
      </div>
      <div class="learn-grid">
        ${posts.map(post => `
          <article class="learn-card" data-post="${post.id}">
            <div class="learn-card-icon" style="color:${post.color}">${icon(post.icon, 28)}</div>
            <div class="learn-card-body">
              <h2>${post.title}</h2>
              <p>${post.summary}</p>
              <div class="learn-card-meta">
                ${post.tags.map(t => `<span class="badge badge-default">${t}</span>`).join('')}
                <span class="learn-card-date">${post.date}</span>
              </div>
            </div>
            <div class="learn-card-arrow">${icon('arrowRight', 20, 'var(--text-muted)')}</div>
          </article>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('.learn-card').forEach(card => {
    card.addEventListener('click', () => {
      const post = posts.find(p => p.id === card.dataset.post);
      if (post) {
        activePost = post.id;
        renderPost(container, post.id);
      }
    });
  });
}

function renderPost(container, postId) {
  const post = posts.find(p => p.id === postId);
  if (!post) {
    activePost = null;
    renderLearn(container);
    return;
  }

  container.innerHTML = `
    <div class="learn-page">
      <button class="learn-back-btn" id="learn-back">
        ${icon('arrowLeft', 16)} Back to Learn
      </button>
      <article class="learn-post">
        <div class="learn-post-header">
          <div class="learn-post-icon" style="color:${post.color}">${icon(post.icon, 32)}</div>
          <div>
            <h1>${post.title}</h1>
            <div class="learn-post-meta">
              ${post.tags.map(t => `<span class="badge badge-default">${t}</span>`).join('')}
              <span class="learn-card-date">${post.date}</span>
            </div>
          </div>
        </div>
        <div class="learn-post-body">
          ${post.content()}
        </div>
      </article>
    </div>
  `;

  document.getElementById('learn-back').addEventListener('click', () => {
    activePost = null;
    renderLearn(container);
  });

  bindCopyButtons(container);
  bindCollapsibles(container);
}

// Reset active post when navigating away
window.addEventListener('hashchange', () => { activePost = null; });
