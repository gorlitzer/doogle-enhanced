// Doogle v2 — Documentation Page (interactive, visual, consistent with about page)
import { api } from '../api.js';
import { icon, escapeHtml, codeBlock, infoCard, bindCopyButtons, bindCollapsibles, showModal } from '../components.js';

let activeTab = 'quickstart';

export function renderDocs(container) {
  container.innerHTML = `
    <div class="docs-page">
      <div class="docs-header">
        <h1>Documentation</h1>
        <p>Everything you need to run, configure, and query your Doogle node.</p>
      </div>
      <div class="docs-nav" id="docs-tabs">
        <button class="docs-nav-btn active" data-tab="quickstart">
          ${icon('zap', 16)} Quick Start
        </button>
        <button class="docs-nav-btn" data-tab="architecture">
          ${icon('network', 16)} Architecture
        </button>
        <button class="docs-nav-btn" data-tab="api">
          ${icon('code', 16)} API Reference
        </button>
        <button class="docs-nav-btn" data-tab="query">
          ${icon('search', 16)} Query Syntax
        </button>
        <button class="docs-nav-btn" data-tab="config">
          ${icon('cpu', 16)} Configuration
        </button>
      </div>
      <div class="docs-body" id="docs-content"></div>
    </div>
  `;

  document.querySelectorAll('#docs-tabs .docs-nav-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('#docs-tabs .docs-nav-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTab();
    });
  });

  renderTab();
}

function renderTab() {
  const el = document.getElementById('docs-content');
  if (!el) return;

  const tabs = {
    quickstart: renderQuickstart,
    architecture: renderArchitecture,
    api: renderAPI,
    query: renderQuerySyntax,
    config: renderConfig,
  };

  (tabs[activeTab] || tabs.quickstart)(el);
}

// ---- Helpers ----

function stepCard(number, title, content) {
  return `
    <div class="docs-step">
      <div class="docs-step-number">${number}</div>
      <div class="docs-step-body">
        <h3>${title}</h3>
        <div>${content}</div>
      </div>
    </div>
  `;
}

// ---- Quick Start ----

function renderQuickstart(el) {
  el.innerHTML = `
    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('zap', 24, 'var(--accent)')}
        <h2>Quick Start</h2>
      </div>
      <p class="docs-section-desc">Get a Doogle search node running in under 2 minutes.</p>

      <div class="docs-method-toggle">
        <button class="docs-method-btn active" data-method="docker">${icon('database', 16)} Docker (recommended)</button>
        <button class="docs-method-btn" data-method="native">${icon('code', 16)} Go (native)</button>
      </div>

      <div id="docs-method-content"></div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('globe', 24, 'var(--blue)')}
        <h2>First Steps After Launch</h2>
      </div>
      <div class="docs-steps">
        ${stepCard(1, 'Run the setup wizard', `
          <p>On first launch, the <a href="#/wizard">onboarding wizard</a> auto-triggers and guides you through picking seed categories (Tech, Science, News, etc.), previewing settings, and launching the crawler. Alternatively, add seeds manually via the <a href="#/admin/crawler">Crawler dashboard</a> or API:</p>
          ${codeBlock(`curl -X POST http://localhost:8080/api/crawl/batch \\
  -H 'Content-Type: application/json' \\
  -d '{"urls":["https://go.dev","https://en.wikipedia.org"]}'`, 'bash')}
        `)}
        ${stepCard(2, 'Watch it crawl', `
          <p>Head to <a href="#/admin">Admin Overview</a> to see URLs being discovered and indexed in real time. The crawler follows links and broadcasts discoveries to peers via GossipSub.</p>
        `)}
        ${stepCard(3, 'Search', `
          <p>Once pages are crawled and indexed, go to the <a href="#/search">Search page</a> or use the API:</p>
          ${codeBlock(`curl 'http://localhost:8080/api/search?q=example&page=1&size=10'`, 'bash')}
        `)}
        ${stepCard(4, 'Connect peers', `
          <p>Run more nodes and they discover each other automatically via mDNS (same LAN) or bootstrap explicitly:</p>
          ${codeBlock(`./bin/doogle --port 4002 --api-port 8081 \\
  --bootstrap /ip4/127.0.0.1/tcp/4001/p2p/<PEER_ID>`, 'bash')}
        `)}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('alertTriangle', 24, 'var(--amber)')}
        <h2>Troubleshooting</h2>
      </div>
      <div class="docs-faq">
        <div class="docs-collapsible">
          <button class="docs-collapse-trigger">Port already in use</button>
          <div class="docs-collapse-body">
            <p>Change the ports with <code>--port</code> and <code>--api-port</code> flags. Default: 4001 (libp2p) and 8080 (HTTP).</p>
          </div>
        </div>
        <div class="docs-collapsible">
          <button class="docs-collapse-trigger">No peers connecting</button>
          <div class="docs-collapse-body">
            <p>On the same LAN, mDNS should work automatically. Across networks, use the <code>--bootstrap</code> flag with a peer's multiaddr. Check the <a href="#/admin/network">Network page</a> for connection status.</p>
          </div>
        </div>
        <div class="docs-collapsible">
          <button class="docs-collapse-trigger">Pages not being indexed</button>
          <div class="docs-collapse-body">
            <p>Check the <a href="#/admin/crawler">Crawler page</a> for errors. Common causes: robots.txt blocking, rate limiting active, or the page returned non-HTML content. Spam pages (score > 0.7) are also filtered out.</p>
          </div>
        </div>
        <div class="docs-collapsible">
          <button class="docs-collapse-trigger">Search returns no results</button>
          <div class="docs-collapse-body">
            <p>Verify documents are indexed on the <a href="#/admin/indexer">Indexer page</a>. If just started, wait for the crawler to process the seed URLs. Try a broader query or check the query syntax guide.</p>
          </div>
        </div>
        <div class="docs-collapsible">
          <button class="docs-collapse-trigger">Running behind a VPN</button>
          <div class="docs-collapse-body">
            <p>Doogle works behind a VPN with some P2P limitations:</p>
            <table style="width:100%;font-size:0.9em;margin:8px 0">
              <thead><tr><th style="text-align:left">Feature</th><th style="text-align:left">Status</th><th style="text-align:left">Why</th></tr></thead>
              <tbody>
                <tr><td>Web crawling</td><td><span class="badge badge-green">works</span></td><td>Outbound HTTP goes through the VPN tunnel normally</td></tr>
                <tr><td>Local search &amp; indexing</td><td><span class="badge badge-green">works</span></td><td>Purely local, no network involved</td></tr>
                <tr><td>Web UI</td><td><span class="badge badge-green">works</span></td><td>Served on localhost, unaffected by VPN routing</td></tr>
                <tr><td>Outbound peer connections</td><td><span class="badge badge-green">works</span></td><td>Connecting to <code>--bootstrap</code> peers goes through the tunnel</td></tr>
                <tr><td>GossipSub messaging</td><td><span class="badge badge-green">works</span></td><td>Uses existing outbound streams, no new inbound needed</td></tr>
                <tr><td>mDNS discovery</td><td><span class="badge badge-red">broken</span></td><td>Multicast stays on physical LAN; VPN tunnel interface does not relay mDNS</td></tr>
                <tr><td>NAT port mapping (UPnP)</td><td><span class="badge badge-red">broken</span></td><td>UPnP targets the local router, which the VPN bypasses entirely</td></tr>
                <tr><td>Hole punching</td><td><span class="badge badge-red">broken</span></td><td>VPN exit node won't forward unsolicited inbound connections</td></tr>
                <tr><td>Inbound peer connections</td><td><span class="badge badge-red">broken</span></td><td>Other nodes cannot dial your VPN-assigned IP; your node is a leaf/consumer</td></tr>
              </tbody>
            </table>
            <p><strong>Workaround:</strong> Use <code>--bootstrap</code> to explicitly connect outbound to known peers. Your node will crawl, index, and participate in gossip — it just can't accept new inbound connections from unknown peers.</p>
          </div>
        </div>
        <div class="docs-collapsible">
          <button class="docs-collapse-trigger">Machine went to sleep / lost power</button>
          <div class="docs-collapse-body">
            <p>When your machine sleeps, hibernates, or loses power, the Doogle process is killed without running its graceful shutdown sequence. Here's what survives and what doesn't:</p>
            <table style="width:100%;font-size:0.9em;margin:8px 0">
              <thead><tr><th style="text-align:left">Data</th><th style="text-align:left">Status</th><th style="text-align:left">Why</th></tr></thead>
              <tbody>
                <tr><td>Identity key (Peer ID)</td><td><span class="badge badge-green">safe</span></td><td>Written to disk on first run, never changes</td></tr>
                <tr><td>BadgerDB (URL store, links, dedup)</td><td><span class="badge badge-green">safe</span></td><td>Uses a write-ahead log — committed transactions survive crashes</td></tr>
                <tr><td>Bleve search index</td><td><span class="badge badge-green">safe</span></td><td>Self-repairs on next open; segments already flushed to disk are intact</td></tr>
                <tr><td>Batch indexer buffer</td><td><span class="badge badge-amber">lost</span></td><td>Up to 100 documents in memory may not have been flushed to Bleve yet</td></tr>
                <tr><td>Crawl queue</td><td><span class="badge badge-amber">lost</span></td><td>In-memory queue; re-add seeds or let peers re-share URLs via GossipSub</td></tr>
                <tr><td>Live crawl feed</td><td><span class="badge badge-amber">lost</span></td><td>In-memory ring buffer, resets on restart</td></tr>
                <tr><td>Peer connections</td><td><span class="badge badge-amber">lost</span></td><td>Reconnected automatically via mDNS / DHT / bootstrap on restart</td></tr>
              </tbody>
            </table>
            <p><strong>Recovery:</strong> Just restart the node. All indexed documents are immediately searchable. Add seed URLs again if the crawl queue was active, or wait for peer gossip to repopulate it.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Method toggle
  const methodBtns = el.querySelectorAll('.docs-method-btn');
  const methodContent = document.getElementById('docs-method-content');

  function showMethod(method) {
    methodBtns.forEach(b => b.classList.toggle('active', b.dataset.method === method));
    if (method === 'docker') {
      methodContent.innerHTML = `
        <div class="docs-steps">
          ${stepCard(1, 'Start a single node', codeBlock(`docker compose up -d node1`, 'bash'))}
          ${stepCard(2, 'Open the dashboard', `
            <p>Open <a href="http://localhost:8080" target="_blank">http://localhost:8080</a> — the setup wizard will guide you through picking seeds and launching the crawler.</p>
          `)}
          ${stepCard(3, 'Optional: full 3-node cluster', `
            ${codeBlock('docker compose up -d', 'bash')}
            <div class="docs-port-grid" style="margin-top:12px">
              <div class="docs-port-card">
                <span class="docs-port-label">Node 1</span>
                <code>http://localhost:8080</code>
              </div>
              <div class="docs-port-card">
                <span class="docs-port-label">Node 2</span>
                <code>http://localhost:8081</code>
              </div>
              <div class="docs-port-card">
                <span class="docs-port-label">Node 3</span>
                <code>http://localhost:8082</code>
              </div>
            </div>
            <p style="margin-top:8px;font-size:0.85em;color:var(--text-muted)">Three nodes auto-connected via mDNS.</p>
          `)}
        </div>
      `;
    } else {
      methodContent.innerHTML = `
        <div class="docs-steps">
          ${stepCard(1, 'Build from source', codeBlock(`cd doogle-v2
make build`, 'bash'))}
          ${stepCard(2, 'Run a node', codeBlock(`./bin/doogle --port 4001 --api-port 8080 \\
  --seed https://en.wikipedia.org`, 'bash'))}
          ${stepCard(3, 'Run a second node (another terminal)', codeBlock(`./bin/doogle --port 4002 --api-port 8081 \\
  --bootstrap /ip4/127.0.0.1/tcp/4001/p2p/<PEER_ID>`, 'bash'))}
        </div>
        ${infoCard('zap', 'Tip', 'The peer ID is printed to the console on startup. Copy it from Node 1\'s log output.', 'var(--amber)')}
      `;
    }
    bindCopyButtons(methodContent);
  }

  methodBtns.forEach(btn => btn.addEventListener('click', () => showMethod(btn.dataset.method)));
  showMethod('docker');

  bindCopyButtons(el);
  bindCollapsibles(el);
}

// ---- Architecture ----

const archCardDetails = [
  // Application layer
  { title: 'Crawler', html: `<p>Goroutine worker pool (default 4 workers) fetches pages via HTTP. Per-domain rate limiting (10 req/min), robots.txt compliance, and redirect following (up to 5 hops). Falls back to headless Chromium via <a href="https://github.com/go-rod/rod" target="_blank">go-rod</a> for JS-heavy SPAs.</p>` },
  { title: 'Indexer', html: `<p>NLP enrichment pipeline: language detection (14+ languages), keyword extraction (TF-IDF), E-E-A-T scoring, spam detection, and content deduplication (4-gram shingling). Documents are batch-indexed into <a href="https://blevesearch.com/" target="_blank">Bleve</a> with pre-computed StaticScore.</p>` },
  { title: 'Search', html: `<p>BM25 full-text search via <a href="https://blevesearch.com/" target="_blank">Bleve</a>. Query parsing supports phrases, synonyms, fuzzy matching, and site: filters. Results ranked by <code>BM25 * StaticScore * freshnessDecay</code>. Shard-aware distributed fan-out to peers.</p>` },
  { title: 'HTTP API', html: `<p>REST endpoints served by <a href="https://github.com/go-chi/chi" target="_blank">Chi router</a>. Embedded SPA with search UI, admin dashboard, crawler/indexer/network monitoring, docs, and 5 switchable themes.</p>` },
  // P2P layer
  { title: 'Kademlia DHT', html: `<p>Distributed peer routing via <a href="https://docs.libp2p.io/concepts/discovery-routing/kaddht/" target="_blank">Kademlia DHT</a>. Enables internet-wide peer discovery and routing. Bootstrap from known peers or rely on mDNS for LAN discovery. Part of <a href="https://docs.libp2p.io/" target="_blank">libp2p</a>.</p>` },
  { title: 'GossipSub', html: `<p>Pub/sub message propagation via <a href="https://docs.libp2p.io/concepts/pubsub/overview/" target="_blank">GossipSub</a>. Used for URL frontier broadcast (discovered URLs), shard catalog exchange (domain assignments), and peer coordination. Epidemic-style propagation ensures network-wide consistency.</p>` },
  { title: 'Stream Protocols', html: `<p>Request-reply protocols over <a href="https://docs.libp2p.io/" target="_blank">libp2p</a> streams:<br><code>/doogle/search/1.0.0</code> — distributed search fan-out<br><code>/doogle/crawl/1.0.0</code> — crawl task delegation to shard owners<br><code>/doogle/index/1.0.0</code> — document forwarding to shard owners</p>` },
  { title: 'Shard Protocol', html: `<p>Protocol <code>/doogle/shard/1.0.0</code> enables shard catalog exchange between peers. Nodes publish their domain assignments (which domains each node is responsible for) via GossipSub every 60 seconds. The shard catalog includes owned domains, document count, and generation counter.</p>` },
  { title: 'Replication', html: `<p>Protocol <code>/doogle/replicate/1.0.0</code> handles fire-and-forget document replication. Documents are replicated to N nodes (default 3) using consistent hashing. When peers join or leave, replication automatically rebalances to maintain the target factor.</p>` },
  { title: 'Anti-Entropy', html: `<p>Protocol <code>/doogle/antientropy/1.0.0</code> runs a background Merkle-based consistency check every 2 minutes (configurable). For each domain a node owns, it computes a Merkle root of all document IDs and compares it with replica peers. When roots diverge, the peer reports which IDs it's missing and the initiator sends the missing documents via the replication protocol. This is bidirectional — when each peer's loop runs, both sides converge.</p>` },
  // Storage layer
  { title: 'BadgerDB', html: `<p><a href="https://dgraph.io/badger" target="_blank">BadgerDB</a> is a fast, pure-Go key-value store. Doogle uses it for URL frontier storage, crawl metadata, link graph edges, PageRank counters, URL deduplication, and content hashes. All data persists across restarts.</p>` },
  { title: 'Bleve Index', html: `<p><a href="https://blevesearch.com/" target="_blank">Bleve</a> provides full-text search with BM25 scoring. Field boosts: title (3x), description (1.5x), content (1x), anchor text (2x). Batch writes of 100 docs per flush for 10-50x throughput. Pre-computed StaticScore stored per document.</p>` },
  { title: 'Link Graph', html: `<p>Directed edge store for PageRank computation. Stores inbound/outbound links per document. Cross-domain links receive 1.5x weight. Link graph is stored in BadgerDB and recomputed every 5 minutes.</p>` },
  { title: 'DedupStore', html: `<p>Persistent URL deduplication backed by <a href="https://dgraph.io/badger" target="_blank">BadgerDB</a>. Uses SHA-256 keys for O(1) lookup. Unlike in-memory dedup, survives node restarts — the crawl frontier persists across reboots without re-crawling.</p>` },
  { title: 'ContentStore', html: `<p>Content hash tracking for incremental reindexing. Stores a hash of each document's content at index time. On re-crawl, if the content hash hasn't changed, the document is skipped — avoiding unnecessary reindexing.</p>` },
  { title: 'GenerationStore', html: `<p>Monotonic generation counter for score freshness tracking. Each indexing pass increments the generation. The incremental re-scorer only re-processes documents whose generation is stale, ensuring efficient background updates.</p>` },
];

const protocolDetails = [
  { title: '/doogle/search/1.0.0 — Search Protocol', html: `<p><strong>Type:</strong> Request-reply over libp2p stream</p><p><strong>Flow:</strong></p><pre style="font-size:0.85em;color:var(--text-secondary)">Requester                    Shard Owner
    |--- SearchRequest --------&gt;|
    |    {query, page, size}     |
    |                            | (run local Bleve query)
    |&lt;-- SearchResponse ---------|
    |    {results[], total, ms}  |</pre><p>Queries route to shard owners via consistent hashing. For general queries, a CoveringSet of peers ensures all shards are queried. Results are merged, deduplicated by URL, and re-ranked.</p><p>Reference: <a href="https://docs.libp2p.io/" target="_blank">libp2p docs</a></p>` },
  { title: '/doogle/crawl/1.0.0 — Crawl Task Protocol', html: `<p><strong>Type:</strong> Request-reply over libp2p stream</p><p><strong>Flow:</strong></p><pre style="font-size:0.85em;color:var(--text-secondary)">Requester                    Shard Owner
    |--- CrawlRequest ---------&gt;|
    |    {url, depth, priority}  |
    |                            | (add to local queue)
    |&lt;-- CrawlResponse ---------|
    |    {status: "queued"}      |</pre><p>Delegates a URL to the correct shard owner based on consistent hashing of the domain. The receiving node adds it to its local crawl queue.</p>` },
  { title: '/doogle/index/1.0.0 — Index Doc Protocol', html: `<p><strong>Type:</strong> Request-reply over libp2p stream</p><p><strong>Flow:</strong></p><pre style="font-size:0.85em;color:var(--text-secondary)">Requester                    Shard Owner
    |--- IndexRequest ---------&gt;|
    |    {document, scores}      |
    |                            | (batch-index to Bleve)
    |&lt;-- IndexResponse ---------|
    |    {status: "indexed"}     |</pre><p>Forwards a fully-crawled and enriched document to the shard owner for batch indexing in their local Bleve store.</p>` },
  { title: 'doogle/url-frontier — URL Frontier (GossipSub)', html: `<p><strong>Type:</strong> GossipSub pub/sub topic</p><p>Broadcasts newly discovered URLs to all peers. Nodes check if the URL falls in their shard range (via consistent hashing) before scheduling a crawl. This prevents duplicate crawl work across the network.</p><p>Reference: <a href="https://docs.libp2p.io/concepts/pubsub/overview/" target="_blank">GossipSub spec</a></p>` },
  { title: '/doogle/shard/1.0.0 — Shard Catalog Protocol', html: `<p><strong>Type:</strong> Request-reply over libp2p stream</p><p>Peers exchange shard assignments — which domains each node is responsible for. Published via GossipSub every 60 seconds. The catalog includes owned domains, document count per shard, and the current generation counter.</p><p>Used to build the network's consistent hash ring and compute CoveringSets for query routing.</p>` },
  { title: '/doogle/replicate/1.0.0 — Replication Protocol', html: `<p><strong>Type:</strong> Request-reply over libp2p stream</p><p>Documents are replicated to N nodes (default 3) using consistent hashing. On crawl, documents are immediately pushed to replica peers. On peer join/leave, replication automatically rebalances to maintain the target replication factor.</p>` },
  { title: '/doogle/antientropy/1.0.0 — Anti-Entropy Protocol', html: `<p><strong>Type:</strong> Request-reply over libp2p stream</p><p><strong>Flow:</strong></p><pre style="font-size:0.85em;color:var(--text-secondary)">Initiator                    Replica Peer
    |--- AntiEntropyRequest ---&gt;|
    |    {domain, merkle_root,  |
    |     doc_ids}              |
    |                           | (compare local Merkle root)
    |&lt;-- AntiEntropyResponse ---|
    |    {status, merkle_root,  |
    |     missing_ids}          |
    |                           |
    | if diverged:              |
    |--- ReplicateRequest -----&gt;|
    |    {missing documents}    |</pre><p>Runs every 2 minutes (+random jitter). For each locally-owned domain, the node computes a Merkle root from sorted document IDs and sends it to replica peers. If roots match, the domain is in sync. If they diverge, the peer returns which IDs it's missing and the initiator sends those docs via the replicate protocol.</p>` },
  { title: 'doogle/shard-catalog — Shard Catalog (GossipSub)', html: `<p><strong>Type:</strong> GossipSub pub/sub topic</p><p>Nodes broadcast their shard catalog (owned domains, doc count, generation) to keep the network's hash ring in sync. Published every 60 seconds. All peers maintain a local copy of the network-wide shard map.</p>` },
];

function renderArchitecture(el) {
  el.innerHTML = `
    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('network', 24, 'var(--accent)')}
        <h2>System Architecture</h2>
      </div>
      <p class="docs-section-desc">A single Go binary — no microservices, no external dependencies at runtime. Click any card for details.</p>

      <div class="docs-arch-visual">
        <div class="docs-arch-layer" style="--layer-color: var(--accent)">
          <div class="docs-arch-layer-header">
            <span class="docs-arch-layer-badge" style="background:var(--accent)">Application</span>
          </div>
          <div class="docs-arch-layer-cards">
            <div class="docs-arch-card" data-arch-idx="0" style="cursor:pointer">
              ${icon('download', 18, 'var(--accent)')}
              <div>
                <strong>Crawler</strong>
                <p>Goroutine worker pool. Per-domain rate limiting. robots.txt. Headless JS fallback.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="1" style="cursor:pointer">
              ${icon('cpu', 18, 'var(--accent)')}
              <div>
                <strong>Indexer</strong>
                <p>NLP pipeline: language detect, keyword extract, E-E-A-T scoring, spam filter, batch indexing.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="2" style="cursor:pointer">
              ${icon('search', 18, 'var(--accent)')}
              <div>
                <strong>Search</strong>
                <p>BM25 full-text. Query parsing (phrases, synonyms, fuzzy). Shard-aware distributed routing.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="3" style="cursor:pointer">
              ${icon('monitor', 18, 'var(--accent)')}
              <div>
                <strong>HTTP API</strong>
                <p>REST endpoints + embedded SPA. Served by Chi router.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="docs-arch-connector">
          <svg width="100%" height="20" viewBox="0 0 200 20"><path d="M40 0 L40 20 M100 0 L100 20 M160 0 L160 20" stroke="var(--border-light)" stroke-width="2" stroke-dasharray="4,3" fill="none"/></svg>
        </div>

        <div class="docs-arch-layer" style="--layer-color: var(--blue)">
          <div class="docs-arch-layer-header">
            <span class="docs-arch-layer-badge" style="background:var(--blue)">P2P Network</span>
          </div>
          <div class="docs-arch-layer-cards">
            <div class="docs-arch-card" data-arch-idx="4" style="cursor:pointer">
              ${icon('network', 18, 'var(--blue)')}
              <div>
                <strong>Kademlia DHT</strong>
                <p>Distributed peer routing across the internet. Bootstrap from known peers.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="5" style="cursor:pointer">
              ${icon('megaphone', 18, 'var(--blue)')}
              <div>
                <strong>GossipSub</strong>
                <p>Pub/sub broadcast of discovered URLs and shard catalogs.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="6" style="cursor:pointer">
              ${icon('radio', 18, 'var(--blue)')}
              <div>
                <strong>Stream Protocols</strong>
                <p>/doogle/search, /doogle/crawl, /doogle/index — request-reply over libp2p streams.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="7" style="cursor:pointer">
              ${icon('database', 18, 'var(--blue)')}
              <div>
                <strong>Shard Protocol</strong>
                <p>/doogle/shard/1.0.0 — shard catalog exchange. Domain assignments via GossipSub.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="8" style="cursor:pointer">
              ${icon('shield', 18, 'var(--blue)')}
              <div>
                <strong>Replication</strong>
                <p>/doogle/replicate/1.0.0 — document replication to N replica peers.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="9" style="cursor:pointer">
              ${icon('refresh', 18, 'var(--blue)')}
              <div>
                <strong>Anti-Entropy</strong>
                <p>/doogle/antientropy/1.0.0 — Merkle root reconciliation between replicas.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="docs-arch-connector">
          <svg width="100%" height="20" viewBox="0 0 200 20"><path d="M40 0 L40 20 M100 0 L100 20 M160 0 L160 20" stroke="var(--border-light)" stroke-width="2" stroke-dasharray="4,3" fill="none"/></svg>
        </div>

        <div class="docs-arch-layer" style="--layer-color: var(--green)">
          <div class="docs-arch-layer-header">
            <span class="docs-arch-layer-badge" style="background:var(--green)">Storage</span>
          </div>
          <div class="docs-arch-layer-cards">
            <div class="docs-arch-card" data-arch-idx="9" style="cursor:pointer">
              ${icon('database', 18, 'var(--green)')}
              <div>
                <strong>BadgerDB</strong>
                <p>URL frontier, crawl metadata, link graph edges, page rank counters, dedup store.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="10" style="cursor:pointer">
              ${icon('fileText', 18, 'var(--green)')}
              <div>
                <strong>Bleve Index</strong>
                <p>Full-text search. BM25 with field boosts. Batch writes (100/flush). Pre-computed StaticScore per doc.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="11" style="cursor:pointer">
              ${icon('link', 18, 'var(--green)')}
              <div>
                <strong>Link Graph</strong>
                <p>Directed edge store for PageRank computation. Inbound/outbound link counts.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="12" style="cursor:pointer">
              ${icon('shield', 18, 'var(--green)')}
              <div>
                <strong>DedupStore</strong>
                <p>Persistent URL dedup (SHA-256 keyed, survives restarts).</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="13" style="cursor:pointer">
              ${icon('cpu', 18, 'var(--green)')}
              <div>
                <strong>ContentStore</strong>
                <p>Content hash tracking for incremental reindexing.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="14" style="cursor:pointer">
              ${icon('trendingUp', 18, 'var(--green)')}
              <div>
                <strong>GenerationStore</strong>
                <p>Monotonic generation counter for score freshness tracking.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('radio', 24, 'var(--blue)')}
        <h2>P2P Protocols</h2>
      </div>
      <p class="docs-section-desc">Click any protocol for message format and flow details.</p>
      <div class="docs-protocol-grid">
        ${protocolCard('/doogle/search/1.0.0', 'Search', 'Request-reply', 'Queries route to shard owners via consistent hashing. Each peer runs the query against its local Bleve index and returns scored results. The requesting node merges, deduplicates, and re-ranks all responses.', 'var(--accent)', 0)}
        ${protocolCard('/doogle/crawl/1.0.0', 'Crawl Task', 'Request-reply', 'Delegates a URL to the correct shard owner based on consistent hashing of the domain. The receiving node adds it to its local crawl queue.', 'var(--blue)', 1)}
        ${protocolCard('/doogle/index/1.0.0', 'Index Doc', 'Request-reply', 'Forwards a fully-crawled and enriched document to the shard owner for batch indexing in their local Bleve store.', 'var(--purple)', 2)}
        ${protocolCard('doogle/url-frontier', 'URL Frontier', 'GossipSub pub/sub', 'Broadcasts newly discovered URLs to all peers. Nodes check if the URL falls in their shard range before scheduling a crawl.', 'var(--green)', 3)}
        ${protocolCard('/doogle/shard/1.0.0', 'Shard Catalog', 'Request-reply', 'Peers exchange shard assignments — which domains each node is responsible for. Published via GossipSub every 60s.', 'var(--amber)', 4)}
        ${protocolCard('/doogle/replicate/1.0.0', 'Replication', 'Request-reply', 'Documents are replicated to N nodes (default 3) using consistent hashing. Immediate push on crawl.', 'var(--red)', 5)}
        ${protocolCard('/doogle/antientropy/1.0.0', 'Anti-Entropy', 'Request-reply', 'Periodic Merkle root comparison for each domain. Detects and repairs missing documents between replica peers.', 'var(--amber)', 6)}
        ${protocolCard('doogle/shard-catalog', 'Shard Catalog', 'GossipSub pub/sub', 'Nodes broadcast their shard catalog (owned domains, doc count, generation) to keep the network\'s hash ring in sync.', 'var(--purple)', 7)}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('trendingUp', 24, 'var(--purple)')}
        <h2>Scoring Pipeline</h2>
      </div>
      <p class="docs-section-desc">Every document passes through a multi-stage analysis pipeline before indexing. Click any step for details.</p>

      <div class="docs-scoring-flow">
        ${scoringStep('Dedup Check', 'Content fingerprinting via character 4-gram shingling + Jaccard similarity. >80% overlap = duplicate.', 'var(--border-light)', 0)}
        ${scoringStep('NLP Enrichment', 'Language detection, keyword extraction, category classification, readability analysis.', 'var(--blue)', 1)}
        ${scoringStep('Quality Scoring', '10+ signals: E-E-A-T, content depth, heading structure, media richness, citations, author credibility.', 'var(--green)', 2)}
        ${scoringStep('Spam Filter', 'Keyword stuffing, excessive caps, thin content, link farms. Score > 0.7 = rejected.', 'var(--red)', 3)}
        ${scoringStep('PageRank', 'Graph-based link authority. Iterative computation (damping=0.85). Cross-domain links get 1.5x weight.', 'var(--purple)', 4)}
        ${scoringStep('StaticScore Pre-computation', 'Quality signals combined into a single StaticScore at index time: <code>(0.5 + qualitySignal*2.0) * (1.0 - spamScore*0.8)</code>. Avoids recomputing on every search query.', 'var(--amber)', 5)}
        ${scoringStep('Batch Indexer', 'Documents buffered and flushed to Bleve in batches of 100 (or every 5s). Batch writes are 10-50x faster than single-doc indexing.', 'var(--accent)', 6)}
        ${scoringStep('Bleve Index', 'Full-text index with BM25 weighting. Title x3, description x1.5, content x1, anchor text x2. StaticScore stored per doc.', 'var(--green)', 7)}
      </div>

      <div class="docs-formula-card">
        <h3>Final Ranking Formula</h3>
        <div class="docs-formula">
          <code>final = BM25 &times; StaticScore &times; freshnessDecay</code>
        </div>
        <div class="docs-formula-breakdown">
          <div class="docs-formula-item">
            <span class="docs-formula-dot" style="background:var(--accent)"></span>
            <span>StaticScore = (0.5 + weightedSignals &times; 2.0) &times; (1 - spamScore &times; 0.8) &nbsp; <em>range [0.1, 2.5] — computed once at index time</em></span>
          </div>
          <div class="docs-formula-item">
            <span class="docs-formula-dot" style="background:var(--blue)"></span>
            <span>freshnessDecay = e<sup>-&lambda;t</sup> &nbsp; half-life: 30d (news), 120d (standard), 365d (evergreen)</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind architecture card modals
  el.querySelectorAll('.docs-arch-card[data-arch-idx]').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.archIdx, 10);
      const detail = archCardDetails[idx];
      if (detail) showModal(detail.title, detail.html);
    });
  });

  // Bind protocol card modals
  el.querySelectorAll('.docs-protocol-card[data-proto-idx]').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.protoIdx, 10);
      const detail = protocolDetails[idx];
      if (detail) showModal(detail.title, detail.html);
    });
  });

  // Bind scoring step modals
  const scoringDetails = [
    { title: 'Dedup Check', html: '<p>Content fingerprinting uses character 4-gram shingling to create a set of shingles per document. Jaccard similarity compares the overlap between document shingle sets. Documents with &gt;80% overlap are flagged as duplicates and skipped. The DedupStore (BadgerDB-backed, SHA-256 keyed) tracks URLs persistently.</p>' },
    { title: 'NLP Enrichment', html: '<p>Every crawled document passes through: language detection (14+ languages), TF-IDF keyword extraction, category classification, and Flesch-Kincaid readability scoring. These features feed into the quality scoring pipeline.</p>' },
    { title: 'Quality Scoring', html: '<p>10+ signals weighted: E-E-A-T (20%), Quality (20%), PageRank (20%), Readability (8%), Citation (8%), SEO (8%), Author credibility (5%), Link quality (5%), Relevance (6%). Combined into a weighted sum that feeds into the StaticScore computation.</p>' },
    { title: 'Spam Filter', html: '<p>Detects keyword stuffing (abnormal term frequencies), excessive capitalization, thin content (low word count), and link farm patterns (too many outbound links). Score &gt; 0.7 = rejected before indexing. Below threshold, spam score reduces the StaticScore via <code>(1.0 - spamScore * 0.8)</code>.</p>' },
    { title: 'PageRank', html: '<p>Graph-based link authority computed via iterative power method (damping factor = 0.85, 15 iterations). Cross-domain links receive 1.5x weight. Recomputed every 5 minutes via background goroutine. Reference: <a href="https://en.wikipedia.org/wiki/PageRank" target="_blank">PageRank (Wikipedia)</a></p>' },
    { title: 'StaticScore Pre-computation', html: '<p>All quality signals are combined into a single <strong>StaticScore</strong> at index time:</p><code style="display:block;padding:8px;background:var(--bg-code);border-radius:4px;margin:8px 0">StaticScore = (0.5 + weightedSignals * 2.0) * (1.0 - spamScore * 0.8)</code><p>Range: [0.1, 2.5]. This moves scoring work from query-time to index-time. The incremental re-scorer updates stale StaticScores every 10 minutes. <em>ref: ranker.go</em></p>' },
    { title: 'Batch Indexer', html: '<p>Documents are buffered in memory and flushed to <a href="https://blevesearch.com/" target="_blank">Bleve</a> in batches of 100 (configurable via <code>--batch-size</code>) or every 5 seconds (<code>--batch-flush-interval</code>). Bleve\'s batch API provides 10-50x faster write throughput compared to single-document indexing. <em>ref: Bleve batch API</em></p>' },
    { title: 'Bleve Index', html: '<p>Full-text search index via <a href="https://blevesearch.com/" target="_blank">Bleve</a>. BM25 weighting with field boosts: title (3x), description (1.5x), content (1x), anchor text (2x). Pre-computed StaticScore stored as a numeric field per document. Supports phrase matching, fuzzy queries, and synonym expansion.</p>' },
  ];

  el.querySelectorAll('.docs-scoring-step[data-scoring-idx]').forEach(step => {
    step.addEventListener('click', () => {
      const idx = parseInt(step.dataset.scoringIdx, 10);
      const detail = scoringDetails[idx];
      if (detail) showModal(detail.title, detail.html);
    });
  });

  bindCopyButtons(el);
}

function protocolCard(protocol, name, type, desc, color, idx) {
  return `
    <div class="docs-protocol-card" style="--proto-color:${color};cursor:pointer" data-proto-idx="${idx}">
      <div class="docs-protocol-header">
        <code>${protocol}</code>
        <span class="badge" style="background:${color};color:#fff;font-size:0.7em">${type}</span>
      </div>
      <p>${desc}</p>
    </div>
  `;
}

function scoringStep(title, desc, color, idx) {
  return `
    <div class="docs-scoring-step" data-scoring-idx="${idx}" style="cursor:pointer">
      <div class="docs-scoring-dot" style="background:${color}"></div>
      <div class="docs-scoring-content">
        <strong>${title}</strong>
        <p>${desc}</p>
      </div>
    </div>
  `;
}

// ---- API Reference ----

function renderAPI(el) {
  el.innerHTML = `
    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('code', 24, 'var(--accent)')}
        <h2>API Reference</h2>
      </div>
      <p class="docs-section-desc">All endpoints return JSON. The base URL is your node's HTTP address.</p>

      <div class="docs-endpoint-list">
        ${endpoint('GET', '/api/search', 'Search the distributed index', `
          <div class="docs-params">
            <h4>Query Parameters</h4>
            <div class="docs-param-grid">
              ${param('q', 'string', 'required', 'Search query. Supports phrases ("exact match"), site:domain, fuzzy matching.')}
              ${param('page', 'int', '1', 'Page number for pagination.')}
              ${param('size', 'int', '10', 'Results per page (max 50).')}
            </div>
          </div>
          <h4>Example</h4>
          ${codeBlock(`curl 'http://localhost:8080/api/search?q=golang+tutorial&page=1&size=10'`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{
  "query": "golang tutorial",
  "results": [
    {
      "url": "https://go.dev/tour/",
      "title": "A Tour of Go",
      "description": "An interactive introduction...",
      "domain": "go.dev",
      "score": 2.45,
      "eeat_score": 0.65,
      "quality_score": 0.78,
      "spam_score": 0.02,
      "pagerank_score": 0.89,
      "peer_id": "12D3KooW..."
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 10,
  "took_ms": 23,
  "peers_asked": 2
}`, 'json')}
        `)}
        ${endpoint('GET', '/api/status', 'Node health and statistics', `
          ${codeBlock(`curl http://localhost:8080/api/status`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{
  "peer_id": "12D3KooW...",
  "addrs": ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
  "connected_peers": 3,
  "peer_list": ["12D3KooW..."],
  "indexed_docs": 1542,
  "crawled_urls": 4210,
  "urls_in_queue": 856,
  "uptime": "2h15m30s",
  "started_at": "2025-01-15T10:30:00Z"
}`, 'json')}
        `)}
        ${endpoint('POST', '/api/crawl', 'Submit a seed URL for crawling', `
          ${codeBlock(`curl -X POST http://localhost:8080/api/crawl \\
  -H 'Content-Type: application/json' \\
  -d '{"url":"https://example.com"}'`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{"status": "queued", "url": "https://example.com"}`, 'json')}
        `)}
        ${endpoint('POST', '/api/crawl/batch', 'Submit multiple seed URLs at once (max 200)', `
          <div class="docs-params">
            <h4>Body Parameters</h4>
            <div class="docs-param-grid">
              ${param('urls', 'string[]', 'required', 'Array of URLs to crawl. Each must start with http:// or https://. Capped at 200.')}
            </div>
          </div>
          <h4>Example</h4>
          ${codeBlock(`curl -X POST http://localhost:8080/api/crawl/batch \\
  -H 'Content-Type: application/json' \\
  -d '{"urls":["https://go.dev","https://arxiv.org","https://en.wikipedia.org"]}'`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{"status": "queued", "queued": 3, "total": 3}`, 'json')}
          <p style="margin-top:8px;color:var(--text-muted);font-size:0.9em">Used by the <a href="#/wizard">onboarding wizard</a> to submit seed categories in bulk.</p>
        `)}
        ${endpoint('GET', '/api/admin/crawler', 'Crawler configuration and stats', `
          ${codeBlock(`{
  "workers": 4,
  "rate_limit": 10,
  "max_depth": 5,
  "user_agent": "DoogleBot/2.0",
  "total_crawled": 4210,
  "total_failed": 42,
  "active_workers": 3,
  "seen_urls": 8500,
  "js_rendered": 120
}`, 'json')}
        `)}
        ${endpoint('GET', '/api/admin/indexer', 'Indexer pipeline statistics', `
          ${codeBlock(`{
  "total_indexed": 3800,
  "avg_quality": 0.52,
  "avg_spam": 0.08,
  "spam_rejected": 95,
  "duplicates_skipped": 210,
  "empty_skipped": 105
}`, 'json')}
        `)}
        ${endpoint('GET', '/api/admin/peers', 'Connected peer details', `
          ${codeBlock(`[
  {
    "peer_id": "12D3KooWAbCdEf...",
    "addrs": ["/ip4/192.168.1.5/tcp/4001"]
  }
]`, 'json')}
        `)}
        ${endpoint('GET', '/api/admin/documents', 'Browse indexed documents', `
          <div class="docs-params">
            <h4>Query Parameters</h4>
            <div class="docs-param-grid">
              ${param('offset', 'int', '0', 'Pagination offset.')}
              ${param('limit', 'int', '20', 'Number of documents to return.')}
            </div>
          </div>
        `)}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('zap', 24, 'var(--amber)')}
        <h2>Live API Tester</h2>
      </div>
      <p class="docs-section-desc">Try the API against your running node.</p>
      <div class="docs-api-tester">
        <div class="docs-tester-row">
          <select id="tester-method">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <input type="text" id="tester-url" value="/api/status" placeholder="/api/search?q=test">
          <button class="btn btn-primary" id="tester-send">${icon('arrowRight', 14)} Send</button>
        </div>
        <div class="docs-tester-body-row" id="tester-body-row" style="display:none">
          <textarea id="tester-body" rows="3" placeholder='{"url":"https://example.com"}'></textarea>
        </div>
        <div class="docs-tester-result" id="tester-result">
          <div class="docs-tester-placeholder">Response will appear here</div>
        </div>
      </div>
    </div>
  `;

  // Tester logic
  const methodEl = document.getElementById('tester-method');
  const urlEl = document.getElementById('tester-url');
  const bodyRow = document.getElementById('tester-body-row');
  const bodyEl = document.getElementById('tester-body');
  const sendBtn = document.getElementById('tester-send');
  const resultEl = document.getElementById('tester-result');

  methodEl.addEventListener('change', () => {
    bodyRow.style.display = methodEl.value === 'POST' ? 'block' : 'none';
  });

  sendBtn.addEventListener('click', async () => {
    const method = methodEl.value;
    const url = urlEl.value.trim();
    if (!url) return;

    resultEl.innerHTML = `<div class="docs-tester-loading">Sending...</div>`;

    try {
      const opts = { method };
      if (method === 'POST' && bodyEl.value.trim()) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = bodyEl.value.trim();
      }
      const start = performance.now();
      const resp = await fetch(url, opts);
      const elapsed = Math.round(performance.now() - start);
      const data = await resp.json();
      const statusColor = resp.ok ? 'var(--green)' : 'var(--red)';

      resultEl.innerHTML = `
        <div class="docs-tester-status">
          <span style="color:${statusColor};font-weight:600">${resp.status} ${resp.statusText}</span>
          <span style="color:var(--text-muted)">${elapsed}ms</span>
        </div>
        <pre class="docs-tester-json"><code>${escapeHtml(JSON.stringify(data, null, 2))}</code></pre>
      `;
    } catch (err) {
      resultEl.innerHTML = `<div class="docs-tester-error">${icon('alertTriangle', 16, 'var(--red)')} ${escapeHtml(err.message)}</div>`;
    }
  });

  bindCopyButtons(el);
  bindCollapsibles(el);
}

function endpoint(method, path, desc, content) {
  const methodColor = method === 'GET' ? 'var(--green)' : 'var(--blue)';
  return `
    <div class="docs-collapsible docs-endpoint">
      <button class="docs-collapse-trigger docs-endpoint-trigger">
        <div class="docs-endpoint-method" style="background:${methodColor}">${method}</div>
        <code class="docs-endpoint-path">${path}</code>
        <span class="docs-endpoint-desc">${desc}</span>
        <span class="docs-endpoint-chevron">${icon('arrowRight', 14)}</span>
      </button>
      <div class="docs-collapse-body docs-endpoint-body">
        ${content}
      </div>
    </div>
  `;
}

function param(name, type, defaultVal, desc) {
  return `
    <div class="docs-param">
      <code class="docs-param-name">${name}</code>
      <span class="docs-param-type">${type}</span>
      <span class="docs-param-default">${defaultVal}</span>
      <span class="docs-param-desc">${desc}</span>
    </div>
  `;
}

// ---- Query Syntax ----

function renderQuerySyntax(el) {
  el.innerHTML = `
    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('search', 24, 'var(--accent)')}
        <h2>Query Syntax</h2>
      </div>
      <p class="docs-section-desc">Doogle supports rich query syntax for precise searching.</p>

      <div class="docs-syntax-grid">
        ${syntaxCard('Basic Search', 'golang tutorial', 'Matches documents containing both terms across title, description, content, and anchor text.')}
        ${syntaxCard('Exact Phrase', '"distributed systems"', 'Wrapping terms in quotes forces an exact phrase match. Boosted 5x on title, 4x on content.')}
        ${syntaxCard('Exclude Term', 'golang -tutorial', 'Prefix a term with - to exclude it. Documents containing "tutorial" are removed from results.')}
        ${syntaxCard('OR Operator', 'python OR ruby', 'Uppercase OR creates a disjunction. At least one side must match. Chain: python OR ruby OR go')}
        ${syntaxCard('Site Filter', 'site:go.dev concurrency', 'Restricts results to a specific domain. Combine with any other query syntax.')}
        ${syntaxCard('Language Filter', 'lang:de documentation', 'Restricts to a language and uses language-specific stemmer. 15 languages supported.')}
        ${syntaxCard('In Title', 'intitle:golang', 'Only match documents with the term in their title.')}
        ${syntaxCard('In URL', 'inurl:docs', 'Match documents with the substring in their URL.')}
        ${syntaxCard('In Body', 'intext:kubernetes', 'Only match documents with the term in their body content. Also: inbody:')}
        ${syntaxCard('File Type', 'filetype:pdf', 'Match documents whose URL ends with the given extension. Also: ext:')}
        ${syntaxCard('Date Range', 'after:2025-01-01 before:2025-12-31', 'Restrict to documents crawled within a date range.')}
        ${syntaxCard('HTTPS Only', 'has:https', 'Only show results from HTTPS pages.')}
        ${syntaxCard('Fuzzy Matching', 'pythn', 'Short queries (1-3 terms) automatically enable fuzzy matching. Catches typos for words 4+ characters.')}
        ${syntaxCard('Synonym Expansion', 'js tutorial', 'Common abbreviations are automatically expanded. "js" also searches for "javascript".')}
        ${syntaxCard('Combined', 'intitle:go -tutorial site:go.dev', 'Mix and match all operators. Phrases, site filters, dorks, and boolean operators all work together.')}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('monitor', 24, 'var(--green)')}
        <h2>UI Features</h2>
      </div>
      <p class="docs-section-desc">Keyboard shortcuts and result enhancements.</p>
      <div class="docs-syntax-grid">
        ${syntaxCard('Focus Search', '/ or Ctrl+K / Cmd+K', 'Press from any page to jump to the search input. Only works when not already typing in an input field.')}
        ${syntaxCard('Snippet Highlighting', 'automatic', 'Matched query terms are highlighted in search result descriptions. Operator tokens (site:, lang:, etc.) are excluded from highlighting.')}
        ${syntaxCard('Pagination', 'Prev / Next buttons', 'When results span multiple pages, prev/next buttons appear below results. Changing the query resets to page 1.')}
        ${syntaxCard('Result Details', 'Click "details" badge', 'Opens a modal with full scoring breakdown: E-E-A-T, quality, spam, PageRank, readability, citations, freshness, and more.')}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('zap', 24, 'var(--amber)')}
        <h2>Live Query Parser</h2>
      </div>
      <p class="docs-section-desc">Type a query to see how Doogle parses it in real time.</p>
      <div class="docs-query-tester">
        <input type="text" id="query-test-input" placeholder='Try: intitle:go -tutorial OR rust after:2025-01-01' value='intitle:go -tutorial OR rust after:2025-01-01 site:go.dev'>
        <div class="docs-query-result" id="query-test-result"></div>
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('trendingUp', 24, 'var(--purple)')}
        <h2>Synonym Map</h2>
      </div>
      <p class="docs-section-desc">These abbreviations are automatically expanded during search.</p>
      <div class="docs-synonym-grid">
        ${synonymRow('js', 'javascript')}
        ${synonymRow('ts', 'typescript')}
        ${synonymRow('py', 'python')}
        ${synonymRow('rb', 'ruby')}
        ${synonymRow('k8s', 'kubernetes')}
        ${synonymRow('db', 'database')}
        ${synonymRow('api', 'interface endpoint')}
        ${synonymRow('auth', 'authentication authorization')}
        ${synonymRow('config', 'configuration')}
        ${synonymRow('docs', 'documentation')}
        ${synonymRow('repo', 'repository')}
        ${synonymRow('deps', 'dependencies')}
        ${synonymRow('env', 'environment')}
        ${synonymRow('msg', 'message')}
        ${synonymRow('err', 'error')}
        ${synonymRow('req', 'request')}
        ${synonymRow('res', 'response')}
        ${synonymRow('fn', 'function')}
        ${synonymRow('pkg', 'package')}
        ${synonymRow('cmd', 'command')}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('star', 24, 'var(--green)')}
        <h2>Field Boosting</h2>
      </div>
      <p class="docs-section-desc">Search terms are weighted differently based on where they appear.</p>
      <div class="docs-boost-bars">
        ${boostBar('Phrase in Title', 5.0, 'var(--accent)')}
        ${boostBar('Phrase in Content', 4.0, 'var(--blue)')}
        ${boostBar('Term in Title', 3.0, 'var(--accent)')}
        ${boostBar('Term in Anchor Text', 2.0, 'var(--purple)')}
        ${boostBar('Synonym in Title', 1.5, 'var(--amber)')}
        ${boostBar('Term in Description', 1.5, 'var(--green)')}
        ${boostBar('Term in Content', 1.0, 'var(--text-muted)')}
        ${boostBar('Synonym in Content', 0.7, 'var(--text-muted)')}
        ${boostBar('Fuzzy Match', 0.5, 'var(--border-light)')}
      </div>
    </div>
  `;

  // Live query parser
  const input = document.getElementById('query-test-input');
  const result = document.getElementById('query-test-result');

  function parseDemo() {
    const raw = input.value;
    const parsed = demoParseQuery(raw);
    result.innerHTML = `
      <div class="docs-query-parsed">
        ${parsed.phrases.length ? `<div class="docs-qp-row"><span class="docs-qp-label">Phrases</span>${parsed.phrases.map(p => `<span class="badge badge-accent">"${escapeHtml(p)}"</span>`).join(' ')}</div>` : ''}
        ${parsed.site ? `<div class="docs-qp-row"><span class="docs-qp-label">Site Filter</span><span class="badge badge-green">${escapeHtml(parsed.site)}</span></div>` : ''}
        ${parsed.excludes.length ? `<div class="docs-qp-row"><span class="docs-qp-label">Excludes</span>${parsed.excludes.map(e => `<span class="badge badge-red">-${escapeHtml(e)}</span>`).join(' ')}</div>` : ''}
        ${parsed.orGroups.length ? `<div class="docs-qp-row"><span class="docs-qp-label">OR Groups</span>${parsed.orGroups.map(g => `<span class="badge badge-purple">${g.join(' OR ')}</span>`).join(' ')}</div>` : ''}
        ${parsed.lang ? `<div class="docs-qp-row"><span class="docs-qp-label">Language</span><span class="badge badge-green">${escapeHtml(parsed.lang)}</span></div>` : ''}
        ${parsed.inTitle ? `<div class="docs-qp-row"><span class="docs-qp-label">In Title</span><span class="badge badge-blue">${escapeHtml(parsed.inTitle)}</span></div>` : ''}
        ${parsed.inURL ? `<div class="docs-qp-row"><span class="docs-qp-label">In URL</span><span class="badge badge-blue">${escapeHtml(parsed.inURL)}</span></div>` : ''}
        ${parsed.inText ? `<div class="docs-qp-row"><span class="docs-qp-label">In Body</span><span class="badge badge-blue">${escapeHtml(parsed.inText)}</span></div>` : ''}
        ${parsed.fileTypes.length ? `<div class="docs-qp-row"><span class="docs-qp-label">File Type</span>${parsed.fileTypes.map(f => `<span class="badge badge-amber">.${escapeHtml(f)}</span>`).join(' ')}</div>` : ''}
        ${parsed.after || parsed.before ? `<div class="docs-qp-row"><span class="docs-qp-label">Date Range</span>${parsed.after ? `<span class="badge badge-amber">after: ${escapeHtml(parsed.after)}</span>` : ''}${parsed.before ? `<span class="badge badge-amber">before: ${escapeHtml(parsed.before)}</span>` : ''}</div>` : ''}
        ${parsed.hasHTTPS ? `<div class="docs-qp-row"><span class="docs-qp-label">HTTPS</span><span class="badge badge-green">required</span></div>` : ''}
        ${parsed.terms.length ? `<div class="docs-qp-row"><span class="docs-qp-label">Terms</span>${parsed.terms.map(t => `<span class="badge badge-blue">${escapeHtml(t)}</span>`).join(' ')}</div>` : ''}
        ${Object.keys(parsed.synonyms).length ? `<div class="docs-qp-row"><span class="docs-qp-label">Synonyms</span>${Object.entries(parsed.synonyms).map(([k, v]) => `<span class="badge badge-amber">${escapeHtml(k)} &rarr; ${v.join(', ')}</span>`).join(' ')}</div>` : ''}
        <div class="docs-qp-row"><span class="docs-qp-label">Fuzzy</span><span class="badge badge-${parsed.fuzzy ? 'green' : 'default'}">${parsed.fuzzy ? 'enabled' : 'disabled'}</span></div>
      </div>
    `;
  }

  input.addEventListener('input', parseDemo);
  parseDemo();
}

function syntaxCard(title, example, desc) {
  return `
    <div class="docs-syntax-card">
      <h4>${title}</h4>
      <code class="docs-syntax-example">${escapeHtml(example)}</code>
      <p>${desc}</p>
    </div>
  `;
}

function synonymRow(from, to) {
  return `
    <div class="docs-synonym-row">
      <code>${from}</code>
      <span class="docs-synonym-arrow">${icon('arrowRight', 12, 'var(--text-muted)')}</span>
      <span>${to}</span>
    </div>
  `;
}

function boostBar(label, boost, color) {
  const maxBoost = 5.0;
  const pct = Math.round((boost / maxBoost) * 100);
  return `
    <div class="docs-boost-row">
      <span class="docs-boost-label">${label}</span>
      <div class="docs-boost-track">
        <div class="docs-boost-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="docs-boost-value">${boost}x</span>
    </div>
  `;
}

const STOP_WORDS = new Set(['the','a','an','is','are','was','were','be','been','being','in','on','at','to','for','of','with','by','and','or','not','it','this','that','from','as','but','if','no','do','does','did','will','would','could','should','can','may','might','shall','has','have','had','its','than','them','they','their','what','which','who','whom','how','when','where','why','all','each','every','both','few','more','most','other','some','such','only','own']);
const SYNONYMS = { js:'javascript', ts:'typescript', py:'python', rb:'ruby', k8s:'kubernetes', db:'database', api:'interface endpoint', auth:'authentication authorization', config:'configuration', docs:'documentation', repo:'repository', deps:'dependencies', env:'environment', msg:'message', err:'error', req:'request', res:'response', fn:'function', pkg:'package', cmd:'command', golang:'go', rust:'rustlang', ml:'machine learning', ai:'artificial intelligence', css:'stylesheet', html:'markup', sql:'database query', http:'web protocol', url:'link address', gui:'graphical interface', cli:'command line', os:'operating system', oop:'object oriented', devops:'deployment operations', ci:'continuous integration', cd:'continuous deployment' };

function demoParseQuery(raw) {
  let text = raw.trim();
  const phrases = [];
  const phraseRe = /"([^"]+)"/g;
  let m;
  while ((m = phraseRe.exec(text))) phrases.push(m[1]);
  text = text.replace(phraseRe, '');

  let site = '';
  const siteRe = /site:(\S+)/i;
  const sm = text.match(siteRe);
  if (sm) { site = sm[1]; text = text.replace(siteRe, ''); }

  let lang = '';
  const langRe = /lang:(\S+)/i;
  const lm = text.match(langRe);
  if (lm) { lang = lm[1]; text = text.replace(langRe, ''); }

  let inTitle = '';
  const intitleRe = /intitle:(\S+)/i;
  const itm = text.match(intitleRe);
  if (itm) { inTitle = itm[1]; text = text.replace(intitleRe, ''); }

  let inURL = '';
  const inurlRe = /inurl:(\S+)/i;
  const ium = text.match(inurlRe);
  if (ium) { inURL = ium[1]; text = text.replace(inurlRe, ''); }

  let inText = '';
  const intextRe = /(?:intext|inbody):(\S+)/i;
  const ixm = text.match(intextRe);
  if (ixm) { inText = ixm[1]; text = text.replace(intextRe, ''); }

  const fileTypes = [];
  const filetypeRe = /(?:filetype|ext):(\S+)/gi;
  let ftm;
  while ((ftm = filetypeRe.exec(text))) fileTypes.push(ftm[1]);
  text = text.replace(/(?:filetype|ext):\S+/gi, '');

  let before = '';
  const beforeRe = /before:(\S+)/i;
  const bm = text.match(beforeRe);
  if (bm) { before = bm[1]; text = text.replace(beforeRe, ''); }

  let after = '';
  const afterRe = /after:(\S+)/i;
  const am = text.match(afterRe);
  if (am) { after = am[1]; text = text.replace(afterRe, ''); }

  let hasHTTPS = false;
  const hasRe = /has:(\S+)/i;
  const hm = text.match(hasRe);
  if (hm && hm[1].toLowerCase() === 'https') { hasHTTPS = true; }
  text = text.replace(/has:\S+/gi, '');

  // Tokenize with -excludes and OR groups
  const words = text.split(/\s+/).filter(Boolean);
  const excludes = [];
  const orGroups = [];
  const rawTerms = [];
  let pendingOR = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length > 1 && w[0] === '-') { excludes.push(w.slice(1).toLowerCase()); continue; }
    if (w === 'OR' && i > 0 && i < words.length - 1) {
      if (pendingOR.length === 0 && rawTerms.length > 0) {
        pendingOR.push(rawTerms.pop());
      }
      continue;
    }
    const lower = w.toLowerCase();
    if (pendingOR.length > 0) {
      pendingOR.push(lower);
      if (i + 1 < words.length && words[i + 1] === 'OR') continue;
      orGroups.push([...pendingOR]);
      pendingOR = [];
      continue;
    }
    if (!STOP_WORDS.has(lower)) rawTerms.push(lower);
  }

  const terms = rawTerms;
  const synonyms = {};
  for (const t of terms) {
    if (SYNONYMS[t]) synonyms[t] = SYNONYMS[t].split(' ');
  }
  const fuzzy = terms.length <= 3;

  return { phrases, site, lang, inTitle, inURL, inText, fileTypes, before, after, hasHTTPS, excludes, orGroups, terms, synonyms, fuzzy };
}

// ---- Configuration ----

const configDetails = [
  { title: '--name', html: '<p>Human-readable name for this node. Shown in the navbar, admin dashboard, and wizard. Persists via config (not DB).</p><p>YAML: <code>node_name: "My Node"</code></p>' },
  { title: '--port', html: '<p>libp2p listen port for P2P communication. Uses TCP and UDP (QUIC-v1). Default: 4001.</p><p>Environment variable: <code>DOOGLE_PORT</code></p><p>YAML: <code>p2p.port: 4001</code></p>' },
  { title: '--api-port', html: '<p>HTTP API and web UI port. Serves the REST API and embedded SPA. Default: 8080.</p><p>Environment variable: <code>DOOGLE_API_PORT</code></p><p>YAML: <code>api.port: 8080</code></p>' },
  { title: '--data-dir', html: '<p>Directory for Bleve index, BadgerDB databases, identity keys, and all persistent state. Default: ./data</p><p>Environment variable: <code>DOOGLE_DATA_DIR</code></p><p>YAML: <code>storage.data_dir: "./data"</code></p>' },
  { title: '--bootstrap', html: '<p>Bootstrap peer multiaddr for joining an existing network. Format: <code>/ip4/&lt;IP&gt;/tcp/4001/p2p/&lt;PEER_ID&gt;</code></p><p>If not provided, relies on mDNS for local peer discovery.</p><p>YAML: <code>p2p.bootstrap_peers: ["/ip4/.../tcp/4001/p2p/..."]</code></p>' },
  { title: '--seed', html: '<p>Seed URL(s) to start crawling on launch. Comma-separated for multiple URLs.</p><p>YAML: <code>seed_urls: ["https://..."]</code></p>' },
  { title: '--workers', html: '<p>Number of concurrent crawler workers. More workers = faster crawling but higher CPU/memory. Default: 4.</p><p>YAML: <code>crawler.workers: 4</code></p>' },
  { title: '--max-depth', html: '<p>Maximum link depth the crawler will follow from a seed URL. Higher values discover more pages but take longer. Default: 5.</p><p>YAML: <code>crawler.max_depth: 5</code></p>' },
  { title: '--config', html: '<p>Path to YAML config file. CLI flags override config values. See the full YAML example below for all options.</p>' },
  { title: '--batch-size', html: '<p>Number of documents to buffer before flushing to the Bleve index. Larger batches = higher throughput but more memory. Default: 100.</p><p>YAML: <code>index.batch_size: 100</code></p><p>Edge case: setting to 1 disables batching (not recommended for production).</p>' },
  { title: '--batch-flush-interval', html: '<p>Maximum time between batch flushes. Ensures documents are indexed even with low throughput. Default: 5s.</p><p>YAML: <code>index.batch_flush_interval: 5s</code></p>' },
  { title: '--incremental-interval', html: '<p>How often the incremental re-scorer runs to update stale StaticScores. Handles freshness decay, PageRank changes, and quality drift. Default: 10m.</p><p>YAML: <code>index.incremental_interval: 10m</code></p>' },
  { title: '--replication-factor', html: '<p>Number of nodes each document is replicated to for fault tolerance. Higher values = more redundancy but more storage/bandwidth. Default: 3.</p><p>YAML: <code>index.replication_factor: 3</code></p>' },
  { title: '--anti-entropy-interval', html: '<p>How often the anti-entropy reconciliation loop runs. Each tick, the node compares Merkle roots with replica peers and repairs any missing documents. Default: 2m. Random jitter (0-30s) is added per tick to avoid thundering herd.</p><p>YAML: <code>index.anti_entropy_interval: 2m</code></p>' },
];

function renderConfig(el) {
  el.innerHTML = `
    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('monitor', 24, 'var(--green)')}
        <h2>System Requirements</h2>
      </div>
      <p class="docs-section-desc">Minimum and recommended specs for running a Doogle node.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Component</th><th>Minimum</th><th>Recommended</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>OS</td><td colspan="2">Linux, macOS, Windows</td><td>Docker image uses Alpine</td></tr>
            <tr><td>Go</td><td colspan="2">1.22+</td><td>Build from source only</td></tr>
            <tr><td>CPU</td><td>1 core</td><td>2-4 cores</td><td>More cores = faster crawling</td></tr>
            <tr><td>RAM</td><td>256 MB</td><td>512 MB - 1 GB</td><td>Scales with index size + workers</td></tr>
            <tr><td>Disk</td><td>30 MB (empty)</td><td>~50 MB per 1K pages</td><td>BadgerDB + Bleve index</td></tr>
            <tr><td>P2P Port</td><td colspan="2">4001 (TCP + UDP)</td><td>QUIC-v1 on UDP, configurable</td></tr>
            <tr><td>API Port</td><td colspan="2">8080 (TCP)</td><td>Web UI + REST API, configurable</td></tr>
            <tr><td>Ext. deps</td><td colspan="2">None</td><td>Single binary, zero runtime deps</td></tr>
            <tr><td>Chromium</td><td colspan="2">Optional</td><td>Only if <code>--enable-headless</code> is set</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('cpu', 24, 'var(--accent)')}
        <h2>Configuration</h2>
      </div>
      <p class="docs-section-desc">Configure Doogle via CLI flags or a YAML config file. Click any flag for details.</p>

      <h3>CLI Flags</h3>
      <div class="docs-config-grid">
        ${configCard('--name', '(none)', 'Human-readable node name shown in UI and to peers.', 'monitor', 0)}
        ${configCard('--port', '4001', 'libp2p listen port for P2P communication.', 'network', 1)}
        ${configCard('--api-port', '8080', 'HTTP API and web UI port.', 'monitor', 2)}
        ${configCard('--data-dir', './data', 'Directory for Bleve index, BadgerDB, and identity keys.', 'database', 3)}
        ${configCard('--bootstrap', '(none)', 'Bootstrap peer multiaddr for joining an existing network.', 'network', 4)}
        ${configCard('--seed', '(none)', 'Seed URL(s) to start crawling on launch.', 'globe', 5)}
        ${configCard('--workers', '4', 'Number of concurrent crawler workers.', 'download', 6)}
        ${configCard('--max-depth', '5', 'Maximum link depth the crawler will follow from a seed URL.', 'link', 7)}
        ${configCard('--config', '(none)', 'Path to YAML config file. Flags override config values.', 'fileText', 8)}
        ${configCard('--batch-size', '100', 'Number of documents to buffer before flushing to Bleve index.', 'database', 9)}
        ${configCard('--batch-flush-interval', '5s', 'Maximum time between batch flushes.', 'zap', 10)}
        ${configCard('--incremental-interval', '10m', 'How often the incremental re-scorer runs to update stale StaticScores.', 'trendingUp', 11)}
        ${configCard('--replication-factor', '3', 'Number of nodes each document is replicated to for fault tolerance.', 'shield', 12)}
        ${configCard('--anti-entropy-interval', '2m', 'How often the anti-entropy Merkle reconciliation loop runs.', 'refresh', 13)}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('fileText', 24, 'var(--blue)')}
        <h2>YAML Config File</h2>
      </div>
      <p class="docs-section-desc">Full configuration example with all available options.</p>
      ${codeBlock(`node_name: ""              # human-readable name (shown in UI)

p2p:
  port: 4001
  mdns: true
  bootstrap_peers: []

api:
  port: 8080
  bind: "0.0.0.0"

crawler:
  workers: 4
  rate_limit: 10          # requests per minute per domain
  max_depth: 5
  respect_robots: true
  user_agent: "DoogleBot/2.0"
  request_timeout: 30s
  enable_headless: false   # enable JS rendering fallback
  headless_threshold: 3    # min <script> tags to trigger headless
  headless_timeout: 30s

index:
  bleve_dir: "bleve"
  pagerank_interval: 5m   # how often PageRank is recomputed
  batch_size: 100          # docs per batch flush
  batch_flush_interval: 5s # max time between flushes
  incremental_interval: 10m # how often stale docs are re-scored
  replication_factor: 3    # replicas per document
  anti_entropy_interval: 2m # Merkle reconciliation interval

storage:
  data_dir: "./data"
  badger_dir: "badger"

search:
  peer_timeout: 5s        # max time to wait for peer responses
  max_peers: 10            # max peers to fan out queries to

seed_urls:
  - "https://en.wikipedia.org"
  - "https://developer.mozilla.org"
  - "https://docs.python.org/3/"
  - "https://go.dev"
  - "https://news.ycombinator.com"`, 'yaml')}
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('shield', 24, 'var(--green)')}
        <h2>Environment Notes</h2>
      </div>
      <div class="docs-env-grid">
        ${infoCard('database', 'Data Persistence', 'All data is stored in --data-dir. Back up this directory to preserve your index, crawl history, and identity key.', 'var(--blue)')}
        ${infoCard('shield', 'Identity', 'A libp2p identity key is auto-generated on first run and stored in data-dir/identity.key. This key determines your Peer ID.', 'var(--green)')}
        ${infoCard('network', 'Firewall', 'Ensure the libp2p port (default 4001) is reachable if you want peers from outside your LAN to connect.', 'var(--amber)')}
        ${infoCard('shield', 'VPN / Proxy', 'Crawling and local search work fine behind a VPN. However, mDNS discovery breaks (broadcasts stay on the physical LAN), NAT port-mapping and hole-punching are bypassed, and your node becomes unreachable for inbound P2P connections. You can still connect outbound to bootstrap peers. See Troubleshooting for details.', 'var(--red)')}
        ${infoCard('monitor', 'Headless Chrome', 'If enable_headless is true, Chromium will be downloaded automatically on first use via go-rod. Requires ~300MB disk space.', 'var(--purple)')}
        ${infoCard('zap', 'Graceful Shutdown (Ctrl+C)', 'On SIGINT/SIGTERM the node flushes the batch indexer, closes the Bleve index and BadgerDB cleanly. Crawler workers finish their current page. Zero data loss — safe to stop and restart anytime.', 'var(--green)')}
        ${infoCard('alertTriangle', 'Sleep / Standby / Power Loss', 'If the machine sleeps, hibernates, or loses power, the process is killed without cleanup. BadgerDB uses a write-ahead log so committed data survives, but up to 100 documents in the batch indexer memory buffer may be lost. The Bleve index self-repairs on next startup. Crawl queue state in memory is also lost — seed URLs will need to be re-added or re-discovered from peers.', 'var(--amber)')}
        ${infoCard('refresh', 'Restart Behavior', 'On restart the node reloads its identity key (same Peer ID), reopens BadgerDB and Bleve from disk, and resumes normal operation. Previously indexed documents are immediately searchable. The crawl queue starts empty — add seeds via CLI, API, or let GossipSub peers share discovered URLs.', 'var(--blue)')}
      </div>
    </div>
  `;

  // Bind config card modals
  el.querySelectorAll('.docs-config-card[data-config-idx]').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.configIdx, 10);
      const detail = configDetails[idx];
      if (detail) showModal(detail.title, detail.html);
    });
  });

  bindCopyButtons(el);
}

function configCard(flag, defaultVal, desc, iconName, idx) {
  return `
    <div class="docs-config-card" data-config-idx="${idx}" style="cursor:pointer">
      <div class="docs-config-icon">${icon(iconName, 18, 'var(--accent)')}</div>
      <div>
        <code class="docs-config-flag">${flag}</code>
        <span class="docs-config-default">${defaultVal}</span>
        <p>${desc}</p>
      </div>
    </div>
  `;
}
