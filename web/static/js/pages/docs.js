// Doogle v2 — Documentation Page

export function renderDocs(container) {
  container.innerHTML = `
    <div style="max-width:800px;margin:0 auto;padding:40px 20px">
      <div class="page-header">
        <h2>Documentation</h2>
        <p>Doogle v2 — P2P Decentralized Search Engine</p>
      </div>
      <div class="tabs" id="docs-tabs">
        <button class="tab active" data-tab="quickstart">Quick Start</button>
        <button class="tab" data-tab="architecture">Architecture</button>
        <button class="tab" data-tab="api">API Reference</button>
        <button class="tab" data-tab="config">Configuration</button>
      </div>
      <div id="docs-content" class="docs-content"></div>
    </div>
  `;

  document.querySelectorAll('#docs-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#docs-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderDocTab(tab.dataset.tab);
    });
  });

  renderDocTab('quickstart');
}

function renderDocTab(tab) {
  const el = document.getElementById('docs-content');
  if (!el) return;

  const docs = {
    quickstart: quickstartDoc,
    architecture: architectureDoc,
    api: apiDoc,
    config: configDoc,
  };

  el.innerHTML = (docs[tab] || docs.quickstart)();
}

function quickstartDoc() {
  return `
    <h1>Quick Start</h1>
    <h2>With Docker (recommended)</h2>
    <pre><code># Build and start a 3-node cluster
make docker-up

# View logs
make docker-logs

# Open the UI
# Node 1: http://localhost:8080
# Node 2: http://localhost:8081
# Node 3: http://localhost:8082</code></pre>

    <h2>With Go (native)</h2>
    <pre><code># Build
make build

# Run first node
./bin/doogle --port 4001 --api-port 8080 --seed https://example.com

# In another terminal: run second node
./bin/doogle --port 4002 --api-port 8081 \\
  --bootstrap /ip4/127.0.0.1/tcp/4001</code></pre>

    <h2>Add Seed URLs</h2>
    <p>Seed URLs are the starting points for crawling. Add them via the Admin dashboard or the API:</p>
    <pre><code>curl -X POST http://localhost:8080/api/crawl \\
  -H 'Content-Type: application/json' \\
  -d '{"url":"https://example.com"}'</code></pre>

    <h2>Search</h2>
    <p>Once pages are crawled and indexed, search via the web UI or the API:</p>
    <pre><code>curl 'http://localhost:8080/api/search?q=example&page=1&size=10'</code></pre>
  `;
}

function architectureDoc() {
  return `
    <h1>Architecture</h1>
    <h2>Single Binary, Full Node</h2>
    <p>Every Doogle node is a single Go binary that runs all subsystems:</p>
    <ul>
      <li><strong>libp2p Host</strong> — TCP + QUIC transports, Noise encryption, Kademlia DHT, mDNS</li>
      <li><strong>Crawler</strong> — Goroutine worker pool with per-domain rate limiting</li>
      <li><strong>Indexer</strong> — NLP analysis, E-E-A-T scoring, spam detection, content classification</li>
      <li><strong>Search Engine</strong> — Local Bleve full-text index + distributed fan-out to peers</li>
      <li><strong>HTTP API + Web UI</strong> — Embedded static files served by Chi router</li>
      <li><strong>Local Storage</strong> — BadgerDB for metadata + Bleve for full-text search</li>
    </ul>

    <h2>P2P Protocols</h2>
    <p>Three custom libp2p stream protocols plus GossipSub pub/sub:</p>
    <ul>
      <li><code>/doogle/search/1.0.0</code> — Distributed query fan-out and response merging</li>
      <li><code>/doogle/crawl/1.0.0</code> — Crawl task delegation to shard owners</li>
      <li><code>/doogle/index/1.0.0</code> — Document forwarding to shard owners</li>
      <li><code>doogle/url-frontier</code> — GossipSub topic for broadcasting discovered URLs</li>
    </ul>

    <h2>Data Flow</h2>
    <p>Seed URLs &rarr; GossipSub broadcast &rarr; nodes claim URLs by consistent hash(domain) &rarr;
    crawl &rarr; extract content &rarr; NLP enrich &rarr; score &rarr; spam filter &rarr; index to Bleve &rarr;
    search queries fan out to peers &rarr; merge &amp; re-rank results.</p>

    <h2>Shard Assignment</h2>
    <p>Each domain is assigned to a node via consistent hashing (64 virtual nodes per peer).
    This ensures even distribution and minimal reshuffling when peers join or leave.</p>

    <h2>Scoring Pipeline</h2>
    <p>Every document is scored across 6 dimensions:</p>
    <ul>
      <li><strong>E-E-A-T</strong> — Experience, Expertise, Authoritativeness, Trustworthiness</li>
      <li><strong>Quality</strong> — Content depth, structure, media richness, semantic density</li>
      <li><strong>Spam</strong> — Spam phrases, keyword stuffing, link farms, thin content</li>
      <li><strong>Link Score</strong> — Link count, internal/external mix, PageRank-style heuristic</li>
      <li><strong>SEO Score</strong> — Title length, meta description, headings, images, canonical URL</li>
      <li><strong>Readability</strong> — Flesch Reading Ease, citations, author credibility</li>
    </ul>
  `;
}

function apiDoc() {
  return `
    <h1>API Reference</h1>

    <h2>GET /api/search</h2>
    <p>Full-text search across the distributed index.</p>
    <pre><code>GET /api/search?q=golang+tutorial&page=1&size=10</code></pre>
    <p><strong>Query parameters:</strong></p>
    <ul>
      <li><code>q</code> (required) — Search query string</li>
      <li><code>page</code> — Page number (default: 1)</li>
      <li><code>size</code> — Results per page (default: 10, max: 50)</li>
    </ul>
    <p><strong>Response:</strong></p>
    <pre><code>{
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
      "spam_score": 0.02
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 10,
  "took_ms": 23,
  "peers_asked": 2
}</code></pre>

    <h2>GET /api/status</h2>
    <p>Node health and statistics.</p>
    <pre><code>{
  "peer_id": "12D3KooW...",
  "addrs": ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
  "connected_peers": 3,
  "indexed_docs": 1542,
  "crawled_urls": 4210,
  "urls_in_queue": 856,
  "uptime": "2h15m30s"
}</code></pre>

    <h2>POST /api/crawl</h2>
    <p>Submit a seed URL for crawling.</p>
    <pre><code>POST /api/crawl
Content-Type: application/json

{"url": "https://example.com"}</code></pre>
    <p><strong>Response:</strong> <code>{"status": "queued", "url": "https://example.com"}</code></p>
  `;
}

function configDoc() {
  return `
    <h1>Configuration</h1>
    <h2>CLI Flags</h2>
    <table>
      <thead><tr><th>Flag</th><th>Default</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><code>--port</code></td><td>4001</td><td>libp2p listen port</td></tr>
        <tr><td><code>--api-port</code></td><td>8080</td><td>HTTP API port</td></tr>
        <tr><td><code>--data-dir</code></td><td>./data</td><td>Data directory for index and metadata</td></tr>
        <tr><td><code>--bootstrap</code></td><td></td><td>Bootstrap peer multiaddr</td></tr>
        <tr><td><code>--seed</code></td><td></td><td>Seed URL(s) to start crawling</td></tr>
        <tr><td><code>--workers</code></td><td>4</td><td>Number of crawler workers</td></tr>
        <tr><td><code>--max-depth</code></td><td>5</td><td>Maximum crawl depth</td></tr>
        <tr><td><code>--config</code></td><td></td><td>Path to YAML config file</td></tr>
      </tbody>
    </table>

    <h2>YAML Config</h2>
    <pre><code>p2p:
  port: 4001
  mdns: true
  bootstrap_peers: []

api:
  port: 8080
  bind: "0.0.0.0"

crawler:
  workers: 4
  rate_limit: 10
  max_depth: 5
  respect_robots: true
  user_agent: "DoogleBot/2.0"
  request_timeout: 30s

storage:
  data_dir: "./data"

search:
  peer_timeout: 5s
  max_peers: 10</code></pre>
  `;
}
