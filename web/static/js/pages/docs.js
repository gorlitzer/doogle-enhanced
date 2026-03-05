// Doogle v2 — Documentation Page (interactive, visual, consistent with about page)
import { api } from '../api.js';
import { icon, escapeHtml, codeBlock, infoCard, bindCopyButtons, bindCollapsibles, showModal, getCSS, hexToRgba } from '../components.js';

let activeTab = 'quickstart';
let dhtViz = null;

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
        <button class="docs-nav-btn" data-tab="platforms">
          ${icon('monitor', 16)} Platforms
        </button>
      </div>
      <div class="docs-body" id="docs-content"></div>
    </div>
  `;

  window._pageCleanup = () => {
    if (dhtViz) { dhtViz.stop(); dhtViz = null; }
  };

  document.querySelectorAll('#docs-tabs .docs-nav-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      if (dhtViz) { dhtViz.stop(); dhtViz = null; }
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
    platforms: renderPlatforms,
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
        <button class="docs-method-btn active" data-method="native">${icon('code', 16)} Make (recommended)</button>
        <button class="docs-method-btn" data-method="docker">${icon('database', 16)} Docker</button>
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
          ${codeBlock(`curl -X POST http://localhost:7002/api/crawl/batch \\
  -H 'Content-Type: application/json' \\
  -d '{"urls":["https://go.dev","https://en.wikipedia.org"]}'`, 'bash')}
        `)}
        ${stepCard(2, 'Watch it crawl', `
          <p>Head to <a href="#/admin">Admin Overview</a> to see URLs being discovered and indexed in real time. The crawler follows links and broadcasts discoveries to peers via GossipSub.</p>
        `)}
        ${stepCard(3, 'Search', `
          <p>Once pages are crawled and indexed, go to the <a href="#/search">Search page</a> or use the API:</p>
          ${codeBlock(`curl 'http://localhost:7002/api/search?q=example&page=1&size=10'`, 'bash')}
        `)}
        ${stepCard(4, 'Connect peers', `
          <p>Nodes discover each other <strong>automatically</strong> via the IPFS public DHT — no manual bootstrap needed. Just start another node:</p>
          ${codeBlock(`./bin/doogle --port 7003 --api-port 7004 --data-dir ./data/node2`, 'bash')}
          <p style="font-size:0.85em;color:var(--text-muted);margin-top:8px">Peers appear within 30–60 seconds. mDNS also works for LAN discovery. For manual bootstrap: <code>--bootstrap /ip4/HOST/tcp/PORT/p2p/PEER_ID</code></p>
        `)}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('network', 24, 'var(--purple)')}
        <h2>Your Role in the Network</h2>
      </div>
      <p class="docs-section-desc">There's no sign-up, no commitment, and no special skills required. You contribute just by being yourself.</p>
      <div class="docs-env-grid">
        ${infoCard('globe', 'The Explorer', 'Pick the topics that interest you — cooking, science, gaming, local news. Your node crawls and indexes those corners of the web. You build a specialized index just by following your curiosity.', 'var(--accent)')}
        ${infoCard('shield', 'The Guardian', 'When you spot spam, phishing, or junk, flag it. Reports propagate across the network and bad actors get quarantined. The more people who flag, the cleaner the index becomes for everyone.', 'var(--green)')}
        ${infoCard('network', 'The Connector', 'Keep your node running. The longer it stays online, the more peers it serves. You don\'t have to do anything — just leave it on and the network gets stronger.', 'var(--blue)')}
        ${infoCard('search', 'The Specialist', 'Over time your node becomes an expert in your topics. Other nodes route queries your way when they need answers in your domain. Stale nodes get replaced by fresh ones — people who care about a topic keep that corner alive.', 'var(--purple)')}
        ${infoCard('eye', 'The Curator', 'Your browsing patterns, flags, and topic choices train the network\'s quality signals. The pages you keep coming back to rise; the junk you skip fades. You shape relevance without writing a single rule.', 'var(--amber)')}
        ${infoCard('megaphone', 'The Amplifier', 'You share seeds with friends, tell communities about Doogle, and help people set up their first node. Every person you bring in adds new topics and new corners of the web to the collective index.', 'var(--red, #ef4444)')}
        ${infoCard('trendingUp', 'The Archivist', 'You keep your node running for months, years. Pages that disappear from the live web still live in your index. Your long-running node becomes a time capsule — preserving knowledge that would otherwise be lost.', 'var(--green)')}
        ${infoCard('code', 'The Builder', 'You see what\'s missing and build it. A better crawler, a new ranking signal, a browser extension. Doogle is open source — the people who use it are the same people who improve it.', 'var(--accent)')}
      </div>
      <p class="docs-section-desc" style="margin-top:12px;font-size:0.85em">These roles aren't assigned — they emerge. Some don't exist yet and will take shape as the network grows. You might invent a role we never imagined.</p>
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
            <p>Change the ports with <code>--port</code> and <code>--api-port</code> flags. Default: 7001 (libp2p) and 7002 (HTTP).</p>
          </div>
        </div>
        <div class="docs-collapsible">
          <button class="docs-collapse-trigger">No peers connecting</button>
          <div class="docs-collapse-body">
            <p>DHT discovery is enabled by default — nodes find each other via the IPFS public DHT within 30–60 seconds. On the same LAN, mDNS also works automatically. If both fail, use <code>--bootstrap</code> with a peer's multiaddr. Check the <a href="#/admin/network">Network page</a> for connection status. Disable DHT discovery with <code>--dht-discovery=false</code>.</p>
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
                <tr><td>DHT discovery (IPFS)</td><td><span class="badge badge-green">works</span></td><td>Outbound connections to IPFS bootstrap peers go through the tunnel; DHT advertising and peer finding work normally</td></tr>
                <tr><td>Outbound peer connections</td><td><span class="badge badge-green">works</span></td><td>Connecting to <code>--bootstrap</code> peers goes through the tunnel</td></tr>
                <tr><td>GossipSub messaging</td><td><span class="badge badge-green">works</span></td><td>Uses existing outbound streams, no new inbound needed</td></tr>
                <tr><td>mDNS discovery</td><td><span class="badge badge-red">broken</span></td><td>Multicast stays on physical LAN; VPN tunnel interface does not relay mDNS</td></tr>
                <tr><td>NAT port mapping (UPnP)</td><td><span class="badge badge-red">broken</span></td><td>UPnP targets the local router, which the VPN bypasses entirely</td></tr>
                <tr><td>Hole punching</td><td><span class="badge badge-red">broken</span></td><td>VPN exit node won't forward unsolicited inbound connections</td></tr>
                <tr><td>Inbound peer connections</td><td><span class="badge badge-red">broken</span></td><td>Other nodes cannot dial your VPN-assigned IP; your node is a leaf/consumer</td></tr>
              </tbody>
            </table>
            <p><strong>Good news:</strong> DHT discovery works behind a VPN — your node will find and connect to other Doogle nodes automatically via the IPFS public DHT. You can also use <code>--bootstrap</code> for explicit connections. Your node will crawl, index, and participate in gossip — it just can't accept new inbound connections from unknown peers.</p>
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
            <p>Open <a href="http://localhost:7002" target="_blank">http://localhost:7002</a> — the setup wizard will guide you through picking seeds and launching the crawler.</p>
          `)}
          ${stepCard(3, 'Optional: full 3-node cluster', `
            ${codeBlock('docker compose up -d', 'bash')}
            <div class="docs-port-grid" style="margin-top:12px">
              <div class="docs-port-card">
                <span class="docs-port-label">Node 1</span>
                <code>http://localhost:7002</code>
              </div>
              <div class="docs-port-card">
                <span class="docs-port-label">Node 2</span>
                <code>http://localhost:7004</code>
              </div>
              <div class="docs-port-card">
                <span class="docs-port-label">Node 3</span>
                <code>http://localhost:7006</code>
              </div>
            </div>
            <p style="margin-top:8px;font-size:0.85em;color:var(--text-muted)">Three nodes auto-connected via IPFS DHT discovery and mDNS.</p>
          `)}
        </div>
      `;
    } else {
      methodContent.innerHTML = `
        <div class="docs-steps">
          ${stepCard(1, 'Clone and install dependencies', `
            ${codeBlock(`git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
make setup`, 'bash')}
            <p style="font-size:0.85em;color:var(--text-muted);margin-top:8px">This checks for <code>git</code>, <code>curl</code>, and <code>docker</code>, and auto-installs Go locally if you don't have it. Works on macOS and Linux. On Windows, use WSL2 or the Docker method.</p>
          `)}
          ${stepCard(2, 'Start the node', codeBlock(`make run`, 'bash'))}
          ${stepCard(3, 'Open the dashboard', `
            <p>Open <a href="http://localhost:7002" target="_blank">http://localhost:7002</a> — the setup wizard will guide you through picking topics and launching the crawler. The default bind is <code>0.0.0.0</code>, so other devices on your LAN can also reach the UI at <code>http://&lt;your-ip&gt;:7002</code>.</p>
          `)}
          ${stepCard(4, 'Connect a second node (another terminal — auto-discovers via DHT)', codeBlock(`./bin/doogle --port 7003 --api-port 7004 \\
  --data-dir ./data/node2`, 'bash'))}
        </div>
        ${infoCard('zap', 'Tip', 'The peer ID is printed to the console on startup. Copy it from Node 1\'s log output.', 'var(--amber)')}
      `;
    }
    bindCopyButtons(methodContent);
  }

  methodBtns.forEach(btn => btn.addEventListener('click', () => showMethod(btn.dataset.method)));
  showMethod('native');

  bindCopyButtons(el);
  bindCollapsibles(el);
}

// ---- Architecture ----

const archCardDetails = [
  // Application layer
  { title: 'Crawler', html: `<p>Goroutine worker pool (default 4 workers) fetches pages via HTTP. Per-domain rate limiting (10 req/min), robots.txt compliance, and redirect following (up to 10 hops). Falls back to headless Chromium via <a href="https://github.com/go-rod/rod" target="_blank">go-rod</a> for JS-heavy SPAs.</p>` },
  { title: 'Indexer', html: `<p>12-signal scoring pipeline: language detection (15 languages), keyword extraction (TF-IDF), E-E-A-T scoring, domain authority, URL quality analysis, readability extraction (Arc90 algorithm), PageRank, spam detection, and content deduplication (4-gram shingling). Documents are batch-indexed into <a href="https://blevesearch.com/" target="_blank">Bleve</a> with pre-computed StaticScore.</p>` },
  { title: 'Search', html: `<p>BM25 full-text search via <a href="https://blevesearch.com/" target="_blank">Bleve</a>. Intent classification, synonym expansion (100+ pairs), spelling correction ("Did you mean?"), phrases, fuzzy matching, boolean operators, and site: filters. Domain diversity (max 2 per domain in top 10) and passage-based snippets with highlights. Results ranked by <code>BM25 * StaticScore * freshnessDecay * intentMultiplier</code>. Shard-aware distributed fan-out to peers.</p>` },
  { title: 'HTTP API', html: `<p>REST endpoints served by <a href="https://github.com/go-chi/chi" target="_blank">Chi router</a>. Embedded SPA with search UI, admin dashboard, crawler/indexer/network monitoring, docs, and 6 switchable themes.</p>` },
  // P2P layer
  { title: 'Kademlia DHT', html: `<p>Distributed peer routing via <a href="https://docs.libp2p.io/concepts/discovery-routing/kaddht/" target="_blank">Kademlia DHT</a>. Enables internet-wide peer discovery and routing. By default, connects to IPFS public bootstrap peers and uses <code>RoutingDiscovery</code> to advertise under <code>doogle/network/v2</code> — peers find each other automatically within 30–60 seconds. Also supports mDNS for LAN discovery and manual <code>--bootstrap</code>. Part of <a href="https://docs.libp2p.io/" target="_blank">libp2p</a>.</p>` },
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
  { title: '/doogle/fleet/heartbeat/1.0.0 — Fleet Heartbeat', html: `<p><strong>Type:</strong> Request-reply over libp2p stream</p><p><strong>Flow:</strong></p><pre style="font-size:0.85em;color:var(--text-secondary)">Worker                       Coordinator
    |--- HeartbeatRequest ------&gt;|
    |    {peer_id, name, stats,  |
    |     timestamp, signature}  |
    |                            | (verify HMAC + allowlist)
    |&lt;-- HeartbeatResponse ------|
    |    {status: "ok"}          |</pre><p>Workers send heartbeats every 15 seconds (configurable). The coordinator verifies HMAC-SHA256 signatures and peer identity. Nodes go stale after 60s, offline after 180s of missed heartbeats.</p>` },
  { title: '/doogle/fleet/proxy/1.0.0 — Fleet Proxy', html: `<p><strong>Type:</strong> Request-reply over libp2p stream (two-phase)</p><p><strong>Flow:</strong></p><pre style="font-size:0.85em;color:var(--text-secondary)">Coordinator                  Worker
    |--- ProxyRequest ----------&gt;|
    |    {method, path, query,   |
    |     headers, body,         |
    |     timestamp, signature}  |
    |    &lt;CloseWrite&gt;            |
    |                            | (verify sender + HMAC)
    |                            | (forward to local API)
    |&lt;-- ProxyResponseHeader ----|
    |    {status_code, headers}  |
    |&lt;-- raw body bytes ---------|</pre><p>The coordinator proxies HTTP requests to workers over encrypted libp2p streams. Workers bind their API to <code>127.0.0.1</code> — the ONLY remote access path is this tunnel. Request limit: 5 MB, response limit: 100 MB, timeout: 60s.</p>` },
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
                <p>12-signal scoring, domain authority, URL quality, readability extraction (Arc90), PageRank, spam filter, batch indexing.</p>
              </div>
            </div>
            <div class="docs-arch-card" data-arch-idx="2" style="cursor:pointer">
              ${icon('search', 18, 'var(--accent)')}
              <div>
                <strong>Search</strong>
                <p>Hybrid BM25+vector (RRF). Learn-to-rank ML model. Entity cards, intent classification, multilingual semantic search. Shard-aware routing.</p>
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
                <p>Distributed peer routing with IPFS DHT auto-discovery. Zero-config peer finding.</p>
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
        ${protocolCard('/doogle/fleet/heartbeat/1.0.0', 'Fleet Heartbeat', 'Request-reply', 'Workers send stats to coordinator every 15s. HMAC-signed with shared fleet secret. Coordinator tracks online/stale/offline status.', 'var(--green)', 8)}
        ${protocolCard('/doogle/fleet/proxy/1.0.0', 'Fleet Proxy', 'Request-reply', 'Coordinator proxies HTTP requests to workers over encrypted libp2p streams. Two-phase: JSON header + raw body. Workers bind API to localhost only.', 'var(--accent)', 9)}
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

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('radio', 24, 'var(--amber)')}
        <h2>DHT Discovery Flow</h2>
      </div>
      <p class="docs-section-desc">Live visualization of the IPFS DHT peer discovery flow. Your node connects to IPFS bootstrap peers, advertises on the DHT, and discovers other Doogle nodes automatically.</p>
      <div class="graph-container" style="position:relative">
        <canvas id="dht-discovery-graph"></canvas>
        <div class="graph-legend">
          <span><span class="dot" style="background:var(--accent)"></span> This node</span>
          <span><span class="dot" style="background:var(--amber)"></span> IPFS bootstrap</span>
          <span><span class="dot" style="background:var(--green)"></span> Doogle peer</span>
          <span><span class="dot" style="background:var(--purple);opacity:0.5"></span> DHT signal</span>
        </div>
      </div>
    </div>
  `;

  // Start DHT discovery visualization
  if (dhtViz) dhtViz.stop();
  const dhtCanvas = document.getElementById('dht-discovery-graph');
  if (dhtCanvas) {
    dhtViz = new DHTDiscoveryViz(dhtCanvas);
    dhtViz.start();
  }

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
    { title: 'NLP Enrichment', html: '<p>Every crawled document passes through: language detection (15 languages), TF-IDF keyword extraction, category classification, and Flesch-Kincaid readability scoring. These features feed into the quality scoring pipeline.</p>' },
    { title: 'Quality Scoring', html: '<p>10+ signals weighted: E-E-A-T (20%), Quality (20%), PageRank (20%), Readability (8%), Citation (8%), SEO (8%), Author credibility (5%), Link quality (5%), Relevance (6%). Combined into a weighted sum that feeds into the StaticScore computation.</p>' },
    { title: 'Spam Filter', html: '<p>Detects keyword stuffing (abnormal term frequencies), excessive capitalization, thin content (low word count), and link farm patterns (too many outbound links). Score &gt; 0.7 = rejected before indexing. Below threshold, spam score reduces the StaticScore via <code>(1.0 - spamScore * 0.8)</code>.</p>' },
    { title: 'PageRank', html: '<p>Graph-based link authority computed via iterative power method (damping factor = 0.85, 15 iterations). Cross-domain links receive 1.5x weight. Recomputed every 5 minutes via background goroutine. Reference: <a href="https://en.wikipedia.org/wiki/PageRank" target="_blank">PageRank (Wikipedia)</a></p>' },
    { title: 'StaticScore Pre-computation', html: '<p>All quality signals are combined into a single <strong>StaticScore</strong> at index time:</p><code style="display:block;padding:8px;background:var(--bg-code);border-radius:4px;margin:8px 0">StaticScore = (0.5 + weightedSignals * 2.0) * (1.0 - spamScore * 0.8)</code><p>Range: [0.1, 2.5]. This moves scoring work from query-time to index-time. The incremental re-scorer updates stale StaticScores every 10 minutes. <em>ref: ranker.go</em></p>' },
    { title: 'Batch Indexer', html: '<p>Documents are buffered in memory and flushed to <a href="https://blevesearch.com/" target="_blank">Bleve</a> in batches of 100 (configurable via <code>--batch-size</code>) or every 5 seconds (<code>--batch-flush-interval</code>). Bleve\'s batch API provides 10-50x faster write throughput compared to single-document indexing. <em>ref: Bleve batch API</em></p>' },
    { title: 'Bleve Index', html: '<p>Full-text search index via <a href="https://blevesearch.com/" target="_blank">Bleve</a>. BM25 weighting with field boosts: title (3x), description (1.5x), content (1x), anchor text (2x). Pre-computed StaticScore stored as a numeric field per document. Supports phrase matching and fuzzy queries.</p>' },
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
      <p class="docs-section-desc">All endpoints return JSON. The base URL is your node's HTTP address (default <code>http://localhost:7002</code>, LAN-accessible at <code>http://&lt;your-ip&gt;:7002</code> since the default bind is <code>0.0.0.0</code>).</p>

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
          ${codeBlock(`curl 'http://localhost:7002/api/search?q=golang+tutorial&page=1&size=10'`, 'bash')}
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
      "peer_id": "12D3KooW...",
      "vector_similarity": 0.82
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 10,
  "took_ms": 23,
  "peers_asked": 2,
  "suggestion": "",
  "intent": "informational",
  "search_mode": "hybrid",
  "entity_card": {
    "name": "Go (programming language)",
    "type": "technology",
    "description": "Statically typed, compiled language...",
    "doc_count": 15
  },
  "related_topics": ["go concurrency", "go web framework"]
}`, 'json')}
        `)}
        ${endpoint('GET', '/api/status', 'Node health and statistics', `
          ${codeBlock(`curl http://localhost:7002/api/status`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{
  "peer_id": "12D3KooW...",
  "addrs": ["/ip4/127.0.0.1/tcp/7001/p2p/12D3KooW..."],
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
          ${codeBlock(`curl -X POST http://localhost:7002/api/crawl \\
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
          ${codeBlock(`curl -X POST http://localhost:7002/api/crawl/batch \\
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
  "max_depth": 3,
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
    "addrs": ["/ip4/192.168.1.5/tcp/7001"]
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
        ${endpoint('POST', '/api/report', 'Report a URL as spam, malware, or phishing', `
          ${codeBlock(`curl -X POST http://localhost:7002/api/report \\
  -H 'Content-Type: application/json' \\
  -d '{"url":"https://spam.example.com","reason":"spam"}'`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{"status": "reported", "url": "https://spam.example.com"}`, 'json')}
        `)}
        ${endpoint('POST', '/api/config/name', 'Set the human-readable node name', `
          ${codeBlock(`curl -X POST http://localhost:7002/api/config/name \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"My Search Node"}'`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{"status": "ok", "name": "My Search Node"}`, 'json')}
        `)}
        ${endpoint('GET', '/api/admin/trust', 'Trust system overview: reports, quarantined peers, flagged domains', `
          ${codeBlock(`curl http://localhost:7002/api/admin/trust`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{
  "reports": [...],
  "quarantined_peers": [...],
  "flagged_domains": [...]
}`, 'json')}
        `)}
        ${endpoint('DELETE', '/api/admin/data', 'Delete all local data (index, crawl history)', `
          ${codeBlock(`curl -X DELETE http://localhost:7002/api/admin/data`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{"status": "deleted"}`, 'json')}
          <p style="margin-top:8px;color:var(--text-muted);font-size:0.9em">Caution: this permanently removes all indexed documents and crawl data. The node identity key is preserved.</p>
        `)}
        ${endpoint('GET', '/api/trends', 'Trending queries and domains (Intelligence)', `
          ${codeBlock(`curl http://localhost:7002/api/trends`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{
  "trending_queries": [
    { "name": "golang", "current_rate": 5.2, "average_rate": 1.1, "velocity_ratio": 4.7, "volume": 42 }
  ],
  "trending_domains": [
    { "name": "go.dev", "current_rate": 3.1, "average_rate": 0.8, "velocity_ratio": 3.9, "volume": 28 }
  ],
  "computed_at": "2026-03-05T12:00:00Z"
}`, 'json')}
        `)}
        ${endpoint('POST', '/api/click', 'Record a search result click (used for learn-to-rank training)', `
          ${codeBlock(`curl -X POST http://localhost:7002/api/click \\
  -H 'Content-Type: application/json' \\
  -d '{"query":"golang tutorial","url":"https://go.dev/tour/","position":1}'`, 'bash')}
          <h4>Response</h4>
          ${codeBlock(`{"status": "recorded"}`, 'json')}
          <p style="margin-top:8px;color:var(--text-muted);font-size:0.9em">Click data is stored locally and used to train the learn-to-rank model. Training auto-triggers every 6 hours when 200+ click pairs are available.</p>
        `)}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        \${icon('network', 24, 'var(--purple)')}
        <h2>Fleet Management API</h2>
      </div>
      <p class="docs-section-desc">Fleet endpoints are available on every node by default (all nodes run as coordinators). All require a Bearer token derived from the fleet secret. Find your token in <strong>Admin &gt; Actions &gt; Fleet</strong> (localhost only), terminal logs, or via <code>GET /api/status</code> (token is only returned to localhost requests for security).</p>

      <div class="docs-endpoint-list">
        \${endpoint('GET', '/api/fleet/nodes', 'Fleet overview: all registered workers (requires Bearer token)', \`
          <div class="docs-params">
            <h4>Authentication</h4>
            <p>Header: <code>Authorization: Bearer &lt;fleet-api-token&gt;</code> — or query param: <code>?_token=&lt;token&gt;</code></p>
          </div>
          <h4>Example</h4>
          \${codeBlock(\`curl -H 'Authorization: Bearer <token>' http://localhost:7002/api/fleet/nodes\`, 'bash')}
          <h4>Response</h4>
          \${codeBlock(\`{
  "coordinator_id": "12D3KooW...",
  "total_nodes": 2,
  "online_nodes": 1,
  "total_docs": 3200,
  "nodes": [
    {
      "peer_id": "12D3KooW...",
      "name": "worker-1",
      "status": "online",
      "stats": { "indexed_docs": 1600, "crawled_urls": 5000, "urls_in_queue": 120, "connected_peers": 3, "uptime": "2h30m" },
      "last_seen": "2026-03-02T12:00:00Z",
      "first_seen": "2026-03-01T08:00:00Z"
    }
  ]
}\`, 'json')}
        \`)}
        \${endpoint('GET', '/api/fleet/nodes/{peerID}', 'Single worker node details (requires Bearer token)', \`
          \${codeBlock(\`curl -H 'Authorization: Bearer <token>' http://localhost:7002/api/fleet/nodes/12D3KooW...\`, 'bash')}
        \`)}
        \${endpoint('GET', '/api/fleet/nodes/{peerID}/proxy/*', 'Proxy any request to a worker via encrypted libp2p tunnel (requires Bearer token)', \`
          <p>The path after <code>/proxy</code> is forwarded to the worker's local API. For example, <code>/api/fleet/nodes/PEER/proxy/api/status</code> returns the worker's <code>/api/status</code>.</p>
          <h4>Example</h4>
          \${codeBlock(\`curl -H 'Authorization: Bearer <token>' \\
  http://localhost:7002/api/fleet/nodes/12D3KooW.../proxy/api/status\`, 'bash')}
          <p style="margin-top:8px;color:var(--text-muted);font-size:0.9em">Workers bind their API to 127.0.0.1 — the only remote access path is this proxy tunnel. Requests are HMAC-signed and verified.</p>
        \`)}
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
        ${icon('star', 24, 'var(--green)')}
        <h2>Field Boosting</h2>
      </div>
      <p class="docs-section-desc">Search terms are weighted differently based on where they appear.</p>
      <div class="docs-boost-bars">
        ${boostBar('Phrase in Title', 5.0, 'var(--accent)')}
        ${boostBar('Phrase in Content', 4.0, 'var(--blue)')}
        ${boostBar('Term in Title', 3.0, 'var(--accent)')}
        ${boostBar('Term in Anchor Text', 2.0, 'var(--purple)')}
        ${boostBar('Term in Description', 1.5, 'var(--green)')}
        ${boostBar('Term in Content', 1.0, 'var(--text-muted)')}
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
  const fuzzy = terms.length <= 3;

  return { phrases, site, lang, inTitle, inURL, inText, fileTypes, before, after, hasHTTPS, excludes, orGroups, terms, fuzzy };
}

// ---- Configuration ----

const configDetails = [
  { title: '--name', html: '<p>Human-readable name for this node. Shown in the navbar, admin dashboard, and wizard. Persists via config (not DB).</p><p>YAML: <code>node_name: "My Node"</code></p>' },
  { title: '--port', html: '<p>libp2p listen port for P2P communication. Uses TCP and UDP (QUIC-v1). Default: 7001.</p><p>Environment variable: <code>DOOGLE_PORT</code></p><p>YAML: <code>p2p.port: 7001</code></p>' },
  { title: '--api-port', html: '<p>HTTP API and web UI port. Serves the REST API and embedded SPA. Default: 7002.</p><p>Environment variable: <code>DOOGLE_API_PORT</code></p><p>YAML: <code>api.port: 7002</code></p>' },
  { title: '--data-dir', html: '<p>Directory for Bleve index, BadgerDB databases, identity keys, and all persistent state. Default: ./data</p><p>Environment variable: <code>DOOGLE_DATA_DIR</code></p><p>YAML: <code>storage.data_dir: "./data"</code></p>' },
  { title: '--bootstrap', html: '<p>Bootstrap peer multiaddr for manual connection to a specific peer. Format: <code>/ip4/&lt;IP&gt;/tcp/7001/p2p/&lt;PEER_ID&gt;</code></p><p>Usually not needed — DHT discovery finds peers automatically via the IPFS public DHT. Use this for faster initial connections or private networks.</p><p>YAML: <code>p2p.bootstrap_peers: ["/ip4/.../tcp/7001/p2p/..."]</code></p>' },
  { title: '--dht-discovery', html: '<p>Enable or disable automatic peer discovery via the IPFS public DHT. When enabled (default), the node connects to IPFS bootstrap peers, advertises under the rendezvous namespace <code>doogle/network/v2</code>, and periodically searches for other Doogle nodes. Peers are found within 30–60 seconds.</p><p>Disable for air-gapped or private networks: <code>--dht-discovery=false</code></p><p>YAML: <code>p2p.dht_discovery: true</code></p>' },
  { title: '--seed', html: '<p>Seed URL(s) to start crawling on launch. Comma-separated for multiple URLs.</p><p>YAML: <code>seed_urls: ["https://..."]</code></p>' },
  { title: '--workers', html: '<p>Number of concurrent crawler workers. More workers = faster crawling but higher CPU/memory. Default: 4.</p><p>YAML: <code>crawler.workers: 4</code></p>' },
  { title: '--max-depth', html: '<p>Maximum link depth the crawler will follow from a seed URL. Higher values discover more pages but take longer. Default: 3.</p><p>YAML: <code>crawler.max_depth: 3</code></p>' },
  { title: '--config', html: '<p>Path to YAML config file. CLI flags override config values. See the full YAML example below for all options.</p>' },
  { title: '--batch-size', html: '<p>Number of documents to buffer before flushing to the Bleve index. Larger batches = higher throughput but more memory. Default: 100.</p><p>YAML: <code>index.batch_size: 100</code></p><p>Edge case: setting to 1 disables batching (not recommended for production).</p>' },
  { title: '--batch-flush-interval', html: '<p>Maximum time between batch flushes. Ensures documents are indexed even with low throughput. Default: 5s.</p><p>YAML: <code>index.batch_flush_interval: 5s</code></p>' },
  { title: '--incremental-interval', html: '<p>How often the incremental re-scorer runs to update stale StaticScores. Handles freshness decay, PageRank changes, and quality drift. Default: 10m.</p><p>YAML: <code>index.incremental_interval: 10m</code></p>' },
  { title: '--replication-factor', html: '<p>Number of nodes each document is replicated to for fault tolerance. Higher values = more redundancy but more storage/bandwidth. Default: 3.</p><p>YAML: <code>index.replication_factor: 3</code></p>' },
  { title: '--anti-entropy-interval', html: '<p>How often the anti-entropy reconciliation loop runs. Each tick, the node compares Merkle roots with replica peers and repairs any missing documents. Default: 2m. Random jitter (0-30s) is added per tick to avoid thundering herd.</p><p>YAML: <code>index.anti_entropy_interval: 2m</code></p>' },
  { title: '--log-level', html: '<p>Controls log verbosity. Accepts: <code>debug</code>, <code>info</code>, <code>warn</code>, <code>error</code>. Default: <code>info</code>. Logs use <code>log/slog</code> with tint for colored console output (format: <code>15:04:05 INF msg key=val</code>).</p><p>YAML: <code>log_level: "info"</code></p>' },
  { title: '--bind', html: '<p>API server bind address. Default: <code>0.0.0.0</code> (LAN-accessible). Set to <code>127.0.0.1</code> to restrict to localhost only.</p><p>YAML: <code>api.bind: "0.0.0.0"</code></p>' },
  { title: '--fleet-role', html: '<p>Fleet management role. Options: <code>coordinator</code> (default &mdash; fleet-ready), <code>worker</code> (reports to coordinator), <code>standalone</code> (disables fleet).</p><p>YAML: <code>fleet.role: "coordinator"</code></p>' },
  { title: '--fleet-coordinator', html: '<p>Coordinator multiaddr for worker mode. Format: <code>/ip4/&lt;IP&gt;/tcp/&lt;PORT&gt;/p2p/&lt;PEER_ID&gt;</code></p><p>Required when <code>--fleet-role worker</code>. Workers use this to send heartbeats and accept proxy requests.</p><p>YAML: <code>fleet.coordinator_peer: "/ip4/.../tcp/.../p2p/..."</code></p>' },
  { title: '--fleet-secret', html: '<p>256-bit shared secret (64 hex characters). Used for HMAC-SHA256 signing of all fleet messages. Auto-generated on coordinator if not provided. <strong>Required</strong> for workers.</p><p>YAML: <code>fleet.fleet_secret: "aabbcc..."</code></p>' },
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
            <tr><td>OS</td><td colspan="2">macOS (verified on Apple Silicon &amp; Intel), Linux / Windows (untested)</td><td>Go cross-compiles; see <a href="#" onclick="document.querySelector('[data-tab=platforms]').click();return false">Platforms</a></td></tr>
            <tr><td>Go</td><td colspan="2">1.22+</td><td>Build from source only</td></tr>
            <tr><td>CPU</td><td>1 core</td><td>2-4 cores</td><td>More cores = faster crawling</td></tr>
            <tr><td>RAM</td><td>256 MB</td><td>512 MB - 1 GB</td><td>Scales with index size + workers</td></tr>
            <tr><td>Disk</td><td>30 MB (empty)</td><td>~50 MB per 1K pages</td><td>BadgerDB + Bleve index</td></tr>
            <tr><td>P2P Port</td><td colspan="2">7001 (TCP + UDP)</td><td>QUIC-v1 on UDP, configurable</td></tr>
            <tr><td>API Port</td><td colspan="2">7002 (TCP)</td><td>Web UI + REST API, configurable</td></tr>
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
        ${configCard('--port', '7001', 'libp2p listen port for P2P communication.', 'network', 1)}
        ${configCard('--api-port', '7002', 'HTTP API and web UI port.', 'monitor', 2)}
        ${configCard('--data-dir', './data', 'Directory for Bleve index, BadgerDB, and identity keys.', 'database', 3)}
        ${configCard('--bootstrap', '(none)', 'Bootstrap peer multiaddr for manual connection (usually not needed).', 'network', 4)}
        ${configCard('--dht-discovery', 'true', 'Auto-discover peers via IPFS public DHT.', 'radio', 14)}
        ${configCard('--seed', '(none)', 'Seed URL(s) to start crawling on launch.', 'globe', 5)}
        ${configCard('--workers', '4', 'Number of concurrent crawler workers.', 'download', 6)}
        ${configCard('--max-depth', '3', 'Maximum link depth the crawler will follow from a seed URL.', 'link', 7)}
        ${configCard('--config', '(none)', 'Path to YAML config file. Flags override config values.', 'fileText', 8)}
        ${configCard('--batch-size', '100', 'Number of documents to buffer before flushing to Bleve index.', 'database', 9)}
        ${configCard('--batch-flush-interval', '5s', 'Maximum time between batch flushes.', 'zap', 10)}
        ${configCard('--incremental-interval', '10m', 'How often the incremental re-scorer runs to update stale StaticScores.', 'trendingUp', 11)}
        ${configCard('--replication-factor', '3', 'Number of nodes each document is replicated to for fault tolerance.', 'shield', 12)}
        ${configCard('--anti-entropy-interval', '2m', 'How often the anti-entropy Merkle reconciliation loop runs.', 'refresh', 13)}
        ${configCard('--log-level', 'info', 'Log level: debug, info, warn, error. Uses slog with tint colored output.', 'fileText', 15)}
        ${configCard('--bind', '0.0.0.0', 'API server bind address. LAN-accessible by default.', 'globe', 16)}
        ${configCard('--fleet-role', 'coordinator', 'Fleet role: coordinator (default), worker, or standalone.', 'network', 17)}
        ${configCard('--fleet-coordinator', '(none)', 'Coordinator multiaddr (worker mode only).', 'network', 18)}
        ${configCard('--fleet-secret', '(auto)', 'Shared fleet secret (hex). Auto-generated on coordinator.', 'shield', 19)}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('fileText', 24, 'var(--blue)')}
        <h2>YAML Config File</h2>
      </div>
      <p class="docs-section-desc">Full configuration example with all available options.</p>
      ${codeBlock(`node_name: ""              # human-readable name (shown in UI)
log_level: "info"              # debug, info, warn, error

p2p:
  port: 7001
  mdns: true
  dht_discovery: true            # auto-discover peers via IPFS public DHT
  dht_rendezvous: "doogle/network/v2"
  dht_discovery_interval: 30s
  dht_max_peers: 50
  bootstrap_peers: []

api:
  port: 7002
  bind: "0.0.0.0"

crawler:
  workers: 4
  rate_limit: 10          # requests per minute per domain
  max_depth: 3
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

fleet:
  role: "coordinator"          # coordinator (default), worker, or standalone
  coordinator_peer: ""         # multiaddr (worker mode only)
  fleet_secret: ""             # hex, 64 chars (auto-generated on coordinator)
  heartbeat_interval: 15s
  node_timeout: 60s
  allowlist: []                # coordinator only, empty = accept all

seed_urls:
  - "https://en.wikipedia.org"
  - "https://developer.mozilla.org"
  - "https://docs.python.org/3/"
  - "https://go.dev"
  - "https://news.ycombinator.com"`, 'yaml')}
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('database', 24, 'var(--amber)')}
        <h2>Backup & Restore</h2>
      </div>
      <p class="docs-section-desc">Back up your node's data (index, crawl history, identity key) and restore it on the same or different machine.</p>

      <h3>What's Backed Up</h3>
      <div class="docs-env-grid">
        ${infoCard('database', 'BadgerDB', 'URL queue, link graph (backlinks for PageRank), dedup fingerprints, and all metadata.', 'var(--blue)')}
        ${infoCard('search', 'Bleve Index', 'Full-text search index with all crawled documents and BM25 scores.', 'var(--green)')}
        ${infoCard('shield', 'Identity Key', 'Your libp2p identity key (identity.key) — determines your Peer ID on the network.', 'var(--amber)')}
      </div>

      <h3>Via Makefile</h3>
      ${codeBlock(`# Create a timestamped backup
make backup

# Restore from a backup archive
make restore BACKUP=doogle-backup-20260301T120000.tar.gz`, 'bash')}

      <h3>Via CLI</h3>
      ${codeBlock(`# Dump data directory to archive
doogle dump [--data-dir PATH] [--output FILE]

# Restore from archive (errors if data dir exists unless --force)
doogle restore [--data-dir PATH] [--force] <archive.tar.gz>`, 'bash')}

      ${infoCard('alertTriangle', 'Stop the Node First', 'For a consistent backup, stop the node before running dump or backup. BadgerDB and Bleve may have in-flight writes that won\'t be captured if the node is running.', 'var(--red)')}
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('shield', 24, 'var(--green)')}
        <h2>Environment Notes</h2>
      </div>
      <div class="docs-env-grid">
        ${infoCard('database', 'Data Persistence', 'All data is stored in --data-dir. Back up this directory to preserve your index, crawl history, and identity key.', 'var(--blue)')}
        ${infoCard('shield', 'Identity', 'A libp2p identity key is auto-generated on first run and stored in data-dir/identity.key. This key determines your Peer ID.', 'var(--green)')}
        ${infoCard('network', 'Firewall', 'Ensure the libp2p port (default 7001) is reachable if you want peers from outside your LAN to connect.', 'var(--amber)')}
        ${infoCard('shield', 'VPN / Proxy', 'Crawling and local search work fine behind a VPN. DHT discovery also works — your node finds peers via the IPFS public DHT through the VPN tunnel. However, mDNS breaks (broadcasts stay on the physical LAN), NAT port-mapping and hole-punching are bypassed, and inbound P2P connections are blocked. See Troubleshooting for details.', 'var(--red)')}
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

// ---- Platforms ----

const testedPlatforms = [
  {
    os: 'macOS',
    icon: 'monitor',
    color: 'var(--accent)',
    devices: [
      { device: 'Apple Silicon Mac', os: 'macOS 15 Sequoia', arch: 'arm64', status: 'verified', notes: 'Primary development platform. All features tested.' },
      { device: 'Intel Mac', os: 'macOS', arch: 'amd64', status: 'verified', notes: 'Tested and confirmed working.' },
    ],
  },
  {
    os: 'Docker',
    icon: 'database',
    color: 'var(--purple)',
    devices: [
      { device: 'Docker Desktop (macOS)', os: 'Docker 25.x', arch: 'arm64', status: 'verified', notes: 'Docker Compose multi-node clusters tested.' },
      { device: 'Docker Engine (Linux)', os: 'Docker 24.x+', arch: 'amd64/arm64', status: 'untested', notes: 'Dockerfile exists but not tested on native Linux. Help wanted!' },
    ],
  },
  {
    os: 'Linux',
    icon: 'code',
    color: 'var(--green)',
    devices: [
      { device: 'Linux (amd64)', os: 'Any modern distro', arch: 'amd64', status: 'untested', notes: 'Go cross-compiles cleanly. Should work — needs someone to confirm.' },
      { device: 'Linux (arm64)', os: 'Raspberry Pi / ARM servers', arch: 'arm64', status: 'untested', notes: 'Go supports arm64. Not yet tested — help wanted!' },
    ],
  },
  {
    os: 'Windows',
    icon: 'monitor',
    color: 'var(--blue)',
    devices: [
      { device: 'Windows (WSL2)', os: 'Ubuntu on WSL2', arch: 'amd64', status: 'untested', notes: 'Should behave like native Linux. Not yet tested.' },
      { device: 'Windows (native)', os: 'Windows 10/11', arch: 'amd64', status: 'untested', notes: 'Go supports Windows. Needs testing — help wanted!' },
    ],
  },
];

function renderPlatforms(el) {
  const verifiedCount = testedPlatforms.reduce((n, p) => n + p.devices.filter(d => d.status === 'verified').length, 0);
  const untestedCount = testedPlatforms.reduce((n, p) => n + p.devices.filter(d => d.status !== 'verified').length, 0);

  el.innerHTML = `
    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('monitor', 24, 'var(--accent)')}
        <h2>Platform Support</h2>
      </div>
      <p class="docs-section-desc">We're being honest here. Only platforms we've actually tested are marked as verified. Everything else <em>should</em> work (Go cross-compiles cleanly) but we haven't confirmed it yet. If you test on a new platform, let us know!</p>

      <div class="platform-legend">
        <span class="platform-legend-item"><span class="badge badge-green">verified</span> Actually tested by us</span>
        <span class="platform-legend-item"><span class="badge badge-amber">untested</span> Should work, not yet confirmed</span>
      </div>

      ${testedPlatforms.map(platform => `
        <div class="platform-group">
          <h3 class="platform-group-title">
            <span class="platform-group-icon" style="color:${platform.color}">${icon(platform.icon, 20)}</span>
            ${platform.os}
          </h3>
          <div class="table-wrap">
            <table class="platform-table">
              <thead>
                <tr>
                  <th>Environment</th>
                  <th>OS</th>
                  <th>Arch</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${platform.devices.map(d => `
                  <tr>
                    <td><strong>${escapeHtml(d.device)}</strong></td>
                    <td>${escapeHtml(d.os)}</td>
                    <td><code>${d.arch}</code></td>
                    <td><span class="badge ${d.status === 'verified' ? 'badge-green' : 'badge-amber'}">${d.status}</span></td>
                    <td class="platform-notes">${escapeHtml(d.notes)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('cpu', 24, 'var(--green)')}
        <h2>Build Targets</h2>
      </div>
      <p class="docs-section-desc">Doogle compiles to a single binary. Go supports cross-compilation out of the box. We've verified macOS on both Apple Silicon and Intel. The rest should compile fine — we just haven't run them yet.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>GOOS</th><th>GOARCH</th><th>Status</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>darwin</td><td>arm64</td><td><span class="badge badge-green">verified</span></td><td>Apple Silicon Macs — primary dev target</td></tr>
            <tr><td>darwin</td><td>amd64</td><td><span class="badge badge-green">verified</span></td><td>Intel Macs — tested and confirmed</td></tr>
            <tr><td>linux</td><td>amd64</td><td><span class="badge badge-amber">untested</span></td><td>Most common server/desktop target</td></tr>
            <tr><td>linux</td><td>arm64</td><td><span class="badge badge-amber">untested</span></td><td>Raspberry Pi 4/5, ARM servers</td></tr>
            <tr><td>windows</td><td>amd64</td><td><span class="badge badge-amber">untested</span></td><td>Native Windows build</td></tr>
          </tbody>
        </table>
      </div>

      <h3 style="margin-top:24px">Cross-Compile</h3>
      ${codeBlock(`# Build for Linux AMD64
GOOS=linux GOARCH=amd64 go build -o doogle-linux ./cmd/doogle

# Build for Linux ARM64 (e.g. Raspberry Pi)
GOOS=linux GOARCH=arm64 go build -o doogle-arm64 ./cmd/doogle

# Build for Windows
GOOS=windows GOARCH=amd64 go build -o doogle.exe ./cmd/doogle`, 'bash')}
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('globe', 24, 'var(--blue)')}
        <h2>Browser Compatibility</h2>
      </div>
      <p class="docs-section-desc">The web UI uses vanilla JS with ES modules. It should work in any modern browser, but here's what we've actually tested.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Browser</th><th>Status</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>Chrome / Chromium</td><td><span class="badge badge-green">verified</span></td><td>Primary development browser</td></tr>
            <tr><td>Safari (macOS)</td><td><span class="badge badge-green">verified</span></td><td>Tested on macOS Sequoia</td></tr>
            <tr><td>Firefox</td><td><span class="badge badge-amber">untested</span></td><td>Should work — standard APIs only</td></tr>
            <tr><td>Edge</td><td><span class="badge badge-amber">untested</span></td><td>Chromium-based, likely identical to Chrome</td></tr>
            <tr><td>Mobile browsers</td><td><span class="badge badge-amber">untested</span></td><td>Layout is responsive but not yet tested on phones</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('heart', 24, 'var(--red)')}
        <h2>Help Us Test</h2>
      </div>
      <p class="docs-section-desc">We've verified Doogle on macOS (Apple Silicon and Intel). If you run it on Linux, Windows, Raspberry Pi, or anything else — we'd love to hear about it.</p>
      <div class="docs-env-grid">
        ${infoCard('code', 'Run It', 'Build from source or use Docker on your platform. Try crawling, searching, and multi-node P2P.', 'var(--accent)')}
        ${infoCard('megaphone', 'Report Back', 'Open an issue or PR on GitHub with your platform, what worked, and what didn\'t. We\'ll mark it as verified.', 'var(--green)')}
        ${infoCard('shield', 'Fix Issues', 'If something breaks on your platform, even better — send a fix. Platform-specific patches are always welcome.', 'var(--blue)')}
      </div>
    </div>
  `;

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

// ============================================================
// DHT DISCOVERY ANIMATED VISUALIZATION
// ============================================================

class DHTDiscoveryViz {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.animFrame = null;
    this.running = false;
    this.t = 0;
    this.particles = [];
    this.discoveredPeers = [];
    this.pulses = [];
    this.phase = 0;
    this.phaseTimer = 0;
    this.hovered = null;
    this.mouse = { x: 0, y: 0 };

    this._resize();
    this._initNodes();
    this._bindEvents();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const parent = this.canvas.parentElement;
    const W = parent.offsetWidth || 600;
    const H = 380;
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx.scale(dpr, dpr);
    this.W = W;
    this.H = H;
    this.cx = W / 2;
    this.cy = H / 2;
  }

  _initNodes() {
    const cx = this.cx, cy = this.cy;
    this.selfNode = { x: cx, y: cy, r: 22, label: 'You', type: 'self' };

    const bootstrapNames = ['IPFS-1', 'IPFS-2', 'IPFS-3', 'IPFS-4', 'IPFS-5'];
    const innerR = 100;
    this.bootstrapNodes = bootstrapNames.map((name, i) => {
      const angle = (i / bootstrapNames.length) * Math.PI * 2 - Math.PI / 2;
      return {
        x: cx + Math.cos(angle) * innerR,
        y: cy + Math.sin(angle) * innerR,
        r: 10, label: name, type: 'bootstrap',
        angle, connected: false, connectProgress: 0,
      };
    });

    const outerR = 175;
    const peerCount = 4;
    this.discoveredPeers = [];
    for (let i = 0; i < peerCount; i++) {
      const angle = (i / peerCount) * Math.PI * 2 + Math.PI / 6;
      this.discoveredPeers.push({
        x: cx + Math.cos(angle) * outerR,
        y: cy + Math.sin(angle) * outerR,
        r: 12, label: `Peer ${i + 1}`, type: 'doogle',
        angle, discovered: false, discoverProgress: 0, connectProgress: 0,
      });
    }
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.hovered = this._hitTest(this.mouse.x, this.mouse.y);
      this.canvas.style.cursor = this.hovered ? 'pointer' : 'default';
    });
  }

  _hitTest(mx, my) {
    const all = [this.selfNode, ...this.bootstrapNodes, ...this.discoveredPeers.filter(p => p.discovered)];
    for (const n of all) {
      const dx = n.x - mx, dy = n.y - my;
      if (dx * dx + dy * dy < (n.r + 6) ** 2) return n;
    }
    return null;
  }

  start() {
    this.running = true;
    this.phase = 0;
    this.phaseTimer = 0;
    const tick = () => {
      if (!this.running) return;
      this.t++;
      this._update();
      this._draw();
      this.animFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  stop() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  _update() {
    this.phaseTimer++;

    if (this.phase === 0) {
      this.bootstrapNodes.forEach((n, i) => {
        if (this.phaseTimer > i * 15) {
          n.connectProgress = Math.min(1, n.connectProgress + 0.03);
          if (n.connectProgress >= 1) n.connected = true;
        }
      });
      if (this.bootstrapNodes.every(n => n.connected)) {
        this.phase = 1;
        this.phaseTimer = 0;
      }
    }

    if (this.phase === 1) {
      if (this.phaseTimer % 30 === 0 && this.pulses.length < 6) {
        this.pulses.push({ x: this.cx, y: this.cy, r: 0, maxR: 200, alpha: 0.7, type: 'advertise' });
      }
      if (this.phaseTimer > 120) {
        this.phase = 2;
        this.phaseTimer = 0;
      }
    }

    if (this.phase === 2) {
      if (this.phaseTimer % 20 === 0) {
        const src = this.bootstrapNodes[Math.floor(Math.random() * this.bootstrapNodes.length)];
        const target = this.discoveredPeers[Math.floor(Math.random() * this.discoveredPeers.length)];
        this.particles.push({
          x: src.x, y: src.y,
          tx: target.x, ty: target.y,
          progress: 0, speed: 0.02 + Math.random() * 0.02,
        });
      }

      this.discoveredPeers.forEach((p, i) => {
        if (this.phaseTimer > 40 + i * 25) {
          if (!p.discovered) {
            p.discovered = true;
            this.pulses.push({ x: p.x, y: p.y, r: 0, maxR: 40, alpha: 0.8, type: 'discover' });
          }
          p.discoverProgress = Math.min(1, p.discoverProgress + 0.03);
        }
        if (p.discovered && p.discoverProgress >= 0.5) {
          p.connectProgress = Math.min(1, p.connectProgress + 0.02);
        }
      });

      if (this.discoveredPeers.every(p => p.connectProgress >= 1)) {
        this.phase = 3;
        this.phaseTimer = 0;
      }
    }

    if (this.phase === 3) {
      if (this.phaseTimer % 90 === 0) {
        this.pulses.push({ x: this.cx, y: this.cy, r: 0, maxR: 200, alpha: 0.3, type: 'advertise' });
      }
      if (this.phaseTimer > 600) {
        this._resetAnimation();
      }
    }

    this.particles = this.particles.filter(p => {
      p.progress += p.speed;
      p.x = p.x + (p.tx - p.x) * p.speed * 3;
      p.y = p.y + (p.ty - p.y) * p.speed * 3;
      return p.progress < 1;
    });

    this.pulses = this.pulses.filter(p => {
      p.r += 2;
      p.alpha -= 0.008;
      return p.alpha > 0 && p.r < p.maxR;
    });
  }

  _resetAnimation() {
    this.phase = 0;
    this.phaseTimer = 0;
    this.particles = [];
    this.pulses = [];
    this.bootstrapNodes.forEach(n => { n.connected = false; n.connectProgress = 0; });
    this.discoveredPeers.forEach(p => { p.discovered = false; p.discoverProgress = 0; p.connectProgress = 0; });
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = getCSS('--bg-card');
    ctx.fillRect(0, 0, W, H);

    const accent = getCSS('--accent');
    const amber = getCSS('--amber');
    const green = getCSS('--green');
    const purple = getCSS('--purple');
    const textColor = getCSS('--canvas-text') || getCSS('--text-primary');
    const textMuted = getCSS('--text-muted');

    for (const p of this.pulses) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.strokeStyle = p.type === 'advertise'
        ? hexToRgba(purple, p.alpha * 0.6)
        : hexToRgba(green, p.alpha * 0.8);
      ctx.lineWidth = p.type === 'advertise' ? 2 : 1.5;
      ctx.setLineDash(p.type === 'advertise' ? [6, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const n of this.bootstrapNodes) {
      if (n.connectProgress > 0) {
        const dx = n.x - this.cx, dy = n.y - this.cy;
        ctx.beginPath();
        ctx.moveTo(this.cx, this.cy);
        ctx.lineTo(this.cx + dx * n.connectProgress, this.cy + dy * n.connectProgress);
        ctx.strokeStyle = hexToRgba(amber, 0.3 + n.connectProgress * 0.3);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    for (const p of this.discoveredPeers) {
      if (p.connectProgress > 0) {
        const dx = p.x - this.cx, dy = p.y - this.cy;
        ctx.beginPath();
        ctx.moveTo(this.cx, this.cy);
        ctx.lineTo(this.cx + dx * p.connectProgress, this.cy + dy * p.connectProgress);
        ctx.strokeStyle = hexToRgba(green, 0.2 + p.connectProgress * 0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    for (const p of this.particles) {
      const alpha = 1 - p.progress;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(purple, alpha * 0.8);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(purple, alpha * 0.2);
      ctx.fill();
    }

    for (const n of this.bootstrapNodes) {
      const isHov = this.hovered === n;
      if (isHov) { ctx.shadowColor = amber; ctx.shadowBlur = 12; }
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.connected ? amber : hexToRgba(amber, 0.3);
      ctx.fill();
      ctx.strokeStyle = isHov ? amber : hexToRgba(amber, 0.5);
      ctx.lineWidth = isHov ? 2 : 1;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = textMuted;
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y + n.r + 12);
    }

    for (const p of this.discoveredPeers) {
      if (!p.discovered) continue;
      const scale = Math.min(1, p.discoverProgress * 2);
      const isHov = this.hovered === p;
      if (isHov) { ctx.shadowColor = green; ctx.shadowBlur = 12; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * scale, 0, Math.PI * 2);
      ctx.fillStyle = p.connectProgress >= 1 ? green : hexToRgba(green, 0.4 + p.connectProgress * 0.6);
      ctx.fill();
      ctx.strokeStyle = isHov ? green : hexToRgba(green, 0.6);
      ctx.lineWidth = isHov ? 2 : 1;
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (scale >= 0.8) {
        ctx.fillStyle = textColor;
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(p.label, p.x, p.y + p.r + 14);
      }
    }

    const selfGlow = Math.sin(this.t * 0.05) * 0.15 + 0.85;
    const isHovSelf = this.hovered === this.selfNode;
    if (isHovSelf) { ctx.shadowColor = accent; ctx.shadowBlur = 20; }
    else { ctx.shadowColor = accent; ctx.shadowBlur = 8 * selfGlow; }
    ctx.beginPath();
    ctx.arc(this.selfNode.x, this.selfNode.y, this.selfNode.r, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = isHovSelf ? '#fff' : hexToRgba(accent, 0.6);
    ctx.lineWidth = isHovSelf ? 2.5 : 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('You', this.selfNode.x, this.selfNode.y);
    ctx.textBaseline = 'alphabetic';

    const phaseLabels = [
      'Connecting to IPFS bootstrap peers...',
      'Advertising on DHT as "doogle/network/v2"...',
      'Finding Doogle peers on the DHT...',
      'Connected — re-advertising periodically',
    ];
    ctx.fillStyle = textMuted;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(phaseLabels[this.phase], this.cx, H - 14);

    if (this.hovered) {
      const n = this.hovered;
      let tip = '';
      if (n.type === 'self') tip = 'Your Doogle node';
      else if (n.type === 'bootstrap') tip = `IPFS Bootstrap — ${n.connected ? 'Connected' : 'Connecting...'}`;
      else if (n.type === 'doogle') tip = `Doogle Peer — ${n.connectProgress >= 1 ? 'Connected' : 'Discovering...'}`;

      ctx.fillStyle = getCSS('--canvas-tooltip-bg') || 'rgba(0,0,0,0.8)';
      const tw = ctx.measureText(tip).width + 16;
      const tx = n.x - tw / 2;
      const ty = n.y - n.r - 30;
      _roundRect(ctx, tx, ty, tw, 22, 4);
      ctx.fill();
      ctx.fillStyle = getCSS('--canvas-text-bold') || '#fff';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(tip, n.x, ty + 14);
    }
  }
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
