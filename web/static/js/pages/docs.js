// Doogle v2 — Documentation Page (interactive, visual, consistent with about page)
import { api } from '../api.js';
import { icon, escapeHtml, codeBlock, infoCard, bindCopyButtons, bindCollapsibles } from '../components.js';

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
        ${stepCard(1, 'Add seed URLs', `
          <p>Seed URLs are the starting points for crawling. Add them via the <a href="#/admin/crawler">Crawler dashboard</a> or via API:</p>
          ${codeBlock(`curl -X POST http://localhost:8080/api/crawl \\
  -H 'Content-Type: application/json' \\
  -d '{"url":"https://example.com"}'`, 'bash')}
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
          ${stepCard(1, 'Build and start a 3-node cluster', codeBlock(`# Clone and start
git clone https://github.com/peppapig450/doogle-p2p.git
cd doogle-p2p/doogle-v2
make docker-up`, 'bash'))}
          ${stepCard(2, 'Open the UI', `
            <div class="docs-port-grid">
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
          `)}
          ${stepCard(3, 'View logs', codeBlock('make docker-logs', 'bash'))}
        </div>
      `;
    } else {
      methodContent.innerHTML = `
        <div class="docs-steps">
          ${stepCard(1, 'Build from source', codeBlock(`git clone https://github.com/peppapig450/doogle-p2p.git
cd doogle-p2p/doogle-v2
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

function renderArchitecture(el) {
  el.innerHTML = `
    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('network', 24, 'var(--accent)')}
        <h2>System Architecture</h2>
      </div>
      <p class="docs-section-desc">A single Go binary — no microservices, no external dependencies at runtime.</p>

      <div class="docs-arch-visual">
        <div class="docs-arch-layer" style="--layer-color: var(--accent)">
          <div class="docs-arch-layer-header">
            <span class="docs-arch-layer-badge" style="background:var(--accent)">Application</span>
          </div>
          <div class="docs-arch-layer-cards">
            <div class="docs-arch-card">
              ${icon('download', 18, 'var(--accent)')}
              <div>
                <strong>Crawler</strong>
                <p>Goroutine worker pool. Per-domain rate limiting. robots.txt. Headless JS fallback.</p>
              </div>
            </div>
            <div class="docs-arch-card">
              ${icon('cpu', 18, 'var(--accent)')}
              <div>
                <strong>Indexer</strong>
                <p>NLP pipeline: language detect, keyword extract, E-E-A-T scoring, spam filter, dedup.</p>
              </div>
            </div>
            <div class="docs-arch-card">
              ${icon('search', 18, 'var(--accent)')}
              <div>
                <strong>Search</strong>
                <p>BM25 full-text. Query parsing (phrases, synonyms, fuzzy). Distributed fan-out to peers.</p>
              </div>
            </div>
            <div class="docs-arch-card">
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
            <div class="docs-arch-card">
              ${icon('network', 18, 'var(--blue)')}
              <div>
                <strong>Kademlia DHT</strong>
                <p>Distributed peer routing across the internet. Bootstrap from known peers.</p>
              </div>
            </div>
            <div class="docs-arch-card">
              ${icon('megaphone', 18, 'var(--blue)')}
              <div>
                <strong>GossipSub</strong>
                <p>Pub/sub broadcast of discovered URLs. Shared crawl frontier.</p>
              </div>
            </div>
            <div class="docs-arch-card">
              ${icon('radio', 18, 'var(--blue)')}
              <div>
                <strong>Stream Protocols</strong>
                <p>/doogle/search, /doogle/crawl, /doogle/index — request-reply over libp2p streams.</p>
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
            <div class="docs-arch-card">
              ${icon('database', 18, 'var(--green)')}
              <div>
                <strong>BadgerDB</strong>
                <p>URL frontier, crawl metadata, link graph edges, page rank counters.</p>
              </div>
            </div>
            <div class="docs-arch-card">
              ${icon('fileText', 18, 'var(--green)')}
              <div>
                <strong>Bleve Index</strong>
                <p>Full-text search index. BM25 scoring with field boosts. Anchor text + PageRank stored per doc.</p>
              </div>
            </div>
            <div class="docs-arch-card">
              ${icon('link', 18, 'var(--green)')}
              <div>
                <strong>Link Graph</strong>
                <p>Directed edge store for PageRank computation. Inbound/outbound link counts.</p>
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
      <div class="docs-protocol-grid">
        ${protocolCard('/doogle/search/1.0.0', 'Search', 'Request-reply', 'Queries fan out to peers. Each peer runs the query against its local Bleve index and returns scored results. The requesting node merges, deduplicates, and re-ranks all responses.', 'var(--accent)')}
        ${protocolCard('/doogle/crawl/1.0.0', 'Crawl Task', 'Request-reply', 'Delegates a URL to the correct shard owner based on consistent hashing of the domain. The receiving node adds it to its local crawl queue.', 'var(--blue)')}
        ${protocolCard('/doogle/index/1.0.0', 'Index Doc', 'Request-reply', 'Forwards a fully-crawled and enriched document to the shard owner for indexing in their local Bleve store.', 'var(--purple)')}
        ${protocolCard('doogle/url-frontier', 'URL Frontier', 'GossipSub pub/sub', 'Broadcasts newly discovered URLs to all peers. Nodes check if the URL falls in their shard range before scheduling a crawl.', 'var(--green)')}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('trendingUp', 24, 'var(--purple)')}
        <h2>Scoring Pipeline</h2>
      </div>
      <p class="docs-section-desc">Every document passes through a multi-stage analysis pipeline before indexing.</p>

      <div class="docs-scoring-flow">
        ${scoringStep('Dedup Check', 'Content fingerprinting via character 4-gram shingling + Jaccard similarity. >80% overlap = duplicate.', 'var(--border-light)')}
        ${scoringStep('NLP Enrichment', 'Language detection, keyword extraction, category classification, readability analysis.', 'var(--blue)')}
        ${scoringStep('Quality Scoring', '10+ signals: E-E-A-T, content depth, heading structure, media richness, citations, author credibility.', 'var(--green)')}
        ${scoringStep('Spam Filter', 'Keyword stuffing, excessive caps, thin content, link farms. Score > 0.7 = rejected.', 'var(--red)')}
        ${scoringStep('PageRank', 'Graph-based link authority. Iterative computation (damping=0.85). Cross-domain links get 1.5x weight.', 'var(--purple)')}
        ${scoringStep('Bleve Index', 'Full-text index with BM25 weighting. Title x3, description x1.5, content x1, anchor text x2.', 'var(--accent)')}
      </div>

      <div class="docs-formula-card">
        <h3>Final Ranking Formula</h3>
        <div class="docs-formula">
          <code>final = BM25 &times; qualityMultiplier &times; freshnessDecay &times; (1 - spamPenalty)</code>
        </div>
        <div class="docs-formula-breakdown">
          <div class="docs-formula-item">
            <span class="docs-formula-dot" style="background:var(--accent)"></span>
            <span>qualityMultiplier = 0.5 + weightedSignals &times; 2.0 &nbsp; <em>range [0.5, 2.5]</em></span>
          </div>
          <div class="docs-formula-item">
            <span class="docs-formula-dot" style="background:var(--blue)"></span>
            <span>freshnessDecay = e<sup>-&lambda;t</sup> &nbsp; half-life: 30d (news), 120d (standard), 365d (evergreen)</span>
          </div>
          <div class="docs-formula-item">
            <span class="docs-formula-dot" style="background:var(--red)"></span>
            <span>spamPenalty = min(0.8, spam_score) &nbsp; capped to never fully zero out results</span>
          </div>
        </div>
      </div>
    </div>
  `;

  bindCopyButtons(el);
}

function protocolCard(protocol, name, type, desc, color) {
  return `
    <div class="docs-protocol-card" style="--proto-color:${color}">
      <div class="docs-protocol-header">
        <code>${protocol}</code>
        <span class="badge" style="background:${color};color:#fff;font-size:0.7em">${type}</span>
      </div>
      <p>${desc}</p>
    </div>
  `;
}

function scoringStep(title, desc, color) {
  return `
    <div class="docs-scoring-step">
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
        ${syntaxCard('Site Filter', 'site:go.dev concurrency', 'Restricts results to a specific domain. Combine with any other query syntax.')}
        ${syntaxCard('Fuzzy Matching', 'pythn', 'Short queries (1-3 terms) automatically enable fuzzy matching. Catches typos for words 4+ characters.')}
        ${syntaxCard('Synonym Expansion', 'js tutorial', 'Common abbreviations are automatically expanded. "js" also searches for "javascript".')}
        ${syntaxCard('Combined', '"error handling" site:go.dev', 'Mix and match. Phrases, site filters, and regular terms all work together.')}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('zap', 24, 'var(--amber)')}
        <h2>Live Query Parser</h2>
      </div>
      <p class="docs-section-desc">Type a query to see how Doogle parses it in real time.</p>
      <div class="docs-query-tester">
        <input type="text" id="query-test-input" placeholder='Try: "error handling" site:go.dev kubernetes' value='"error handling" site:go.dev kubernetes'>
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

  const terms = text.toLowerCase().split(/\s+/).filter(t => t && !STOP_WORDS.has(t));
  const synonyms = {};
  for (const t of terms) {
    if (SYNONYMS[t]) synonyms[t] = SYNONYMS[t].split(' ');
  }
  const fuzzy = terms.length <= 3;

  return { phrases, site, terms, synonyms, fuzzy };
}

// ---- Configuration ----

function renderConfig(el) {
  el.innerHTML = `
    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('cpu', 24, 'var(--accent)')}
        <h2>Configuration</h2>
      </div>
      <p class="docs-section-desc">Configure Doogle via CLI flags or a YAML config file.</p>

      <h3>CLI Flags</h3>
      <div class="docs-config-grid">
        ${configCard('--port', '4001', 'libp2p listen port for P2P communication.', 'network')}
        ${configCard('--api-port', '8080', 'HTTP API and web UI port.', 'monitor')}
        ${configCard('--data-dir', './data', 'Directory for Bleve index, BadgerDB, and identity keys.', 'database')}
        ${configCard('--bootstrap', '(none)', 'Bootstrap peer multiaddr for joining an existing network.', 'network')}
        ${configCard('--seed', '(none)', 'Seed URL(s) to start crawling on launch.', 'globe')}
        ${configCard('--workers', '4', 'Number of concurrent crawler workers.', 'download')}
        ${configCard('--max-depth', '5', 'Maximum link depth the crawler will follow from a seed URL.', 'link')}
        ${configCard('--config', '(none)', 'Path to YAML config file. Flags override config values.', 'fileText')}
      </div>
    </div>

    <div class="docs-section">
      <div class="docs-section-header">
        ${icon('fileText', 24, 'var(--blue)')}
        <h2>YAML Config File</h2>
      </div>
      <p class="docs-section-desc">Full configuration example with all available options.</p>
      ${codeBlock(`p2p:
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

storage:
  data_dir: "./data"
  badger_dir: "badger"

search:
  peer_timeout: 5s        # max time to wait for peer responses
  max_peers: 10            # max peers to fan out queries to

seed_urls:
  - "https://en.wikipedia.org"
  - "https://go.dev"`, 'yaml')}
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
        ${infoCard('monitor', 'Headless Chrome', 'If enable_headless is true, Chromium will be downloaded automatically on first use via go-rod. Requires ~300MB disk space.', 'var(--purple)')}
      </div>
    </div>
  `;

  bindCopyButtons(el);
}

function configCard(flag, defaultVal, desc, iconName) {
  return `
    <div class="docs-config-card">
      <div class="docs-config-icon">${icon(iconName, 18, 'var(--accent)')}</div>
      <div>
        <code class="docs-config-flag">${flag}</code>
        <span class="docs-config-default">${defaultVal}</span>
        <p>${desc}</p>
      </div>
    </div>
  `;
}
