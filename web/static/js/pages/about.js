// Doogle v2 — About Page: Interactive, visual, simple explanations
import { api } from '../api.js';
import { icon, getCSS, hexToRgba } from '../components.js';

// ---- Data ----
const pipelineSteps = [
  {
    icon: 'globe', title: 'Seed URL', color: 'var(--accent)',
    eli5: 'You give Doogle a website address, like telling a puppy "go fetch!"',
    detail: 'A URL is added to the frontier via seed, peer gossip, or discovery. The scheduler deduplicates and prioritizes by domain.',
  },
  {
    icon: 'download', title: 'Crawl', color: 'var(--blue)',
    eli5: 'Doogle visits the webpage and reads everything on it, like reading a book.',
    detail: 'Workers fetch pages via HTTP (or headless Chromium for JS-heavy SPAs). Respects robots.txt and per-domain rate limits.',
  },
  {
    icon: 'cpu', title: 'Understand', color: 'var(--purple)',
    eli5: 'Doogle figures out what the page is about — is it about cats? Coding? Pizza recipes?',
    detail: 'NLP pipeline: language detection, keyword extraction, readability scoring, category classification, and content enrichment.',
  },
  {
    icon: 'star', title: 'Score', color: 'var(--amber)',
    eli5: 'Doogle gives the page a report card — is it well-written? Trustworthy? Useful?',
    detail: 'E-E-A-T scoring evaluates expertise, authority, trustworthiness, link structure, freshness, and 10+ quality signals.',
  },
  {
    icon: 'shield', title: 'Filter Spam', color: 'var(--red)',
    eli5: 'Doogle throws away the junk — pages that are fake or trying to trick you.',
    detail: 'Keyword stuffing, cloaking patterns, and low-quality signals are detected. Spam score > 0.7 = rejected before indexing.',
  },
  {
    icon: 'database', title: 'Index', color: 'var(--green)',
    eli5: 'Doogle puts the good pages in a giant filing cabinet so it can find them fast later.',
    detail: 'Bleve full-text search indexes with BM25 weighting (title x3, desc x1.5, content x1, anchor text x2). Stored in BadgerDB.',
  },
  {
    icon: 'search', title: 'Search', color: 'var(--accent)',
    eli5: 'You ask a question, and Doogle looks through its filing cabinet super fast to find the best answers.',
    detail: 'Queries are parsed (phrases, synonyms, fuzzy matching), matched against Bleve, then ranked by BM25 x quality x freshness.',
  },
  {
    icon: 'radio', title: 'Share', color: 'var(--purple)',
    eli5: 'Doogle asks its friends (other computers) if they found anything good too, and combines all the answers.',
    detail: 'Queries fan out to connected peers via libp2p streams. Results are merged, deduplicated, and re-ranked before display.',
  },
];

const capabilities = [
  { icon: 'download', title: 'Distributed Crawling', desc: 'Multi-worker crawl engine with per-domain rate limiting, robots.txt respect, and configurable depth.' },
  { icon: 'search', title: 'Full-Text Search (BM25)', desc: 'Bleve-powered full-text search with field boosting, phrase matching, synonym expansion, and fuzzy queries.' },
  { icon: 'star', title: 'Quality Scoring (E-E-A-T)', desc: '10+ scoring signals including expertise, authority, trustworthiness, readability, freshness, and citation analysis.' },
  { icon: 'cpu', title: 'NLP Analysis Pipeline', desc: 'Language detection, keyword extraction, category classification, and readability scoring for every crawled document.' },
  { icon: 'shield', title: 'Spam Detection', desc: 'Keyword stuffing detection, cloaking analysis, and quality threshold filtering to keep the index clean.' },
  { icon: 'monitor', title: 'Headless JS Rendering', desc: 'go-rod powered headless Chromium fallback for React, Next.js, Angular, and Vue single-page applications.' },
  { icon: 'network', title: 'P2P Network (Kademlia)', desc: 'libp2p-based peer discovery via Kademlia DHT and mDNS. No central server — every node is equal.' },
  { icon: 'megaphone', title: 'GossipSub Frontier', desc: 'Discovered URLs are broadcast to peers via pub/sub, creating a shared crawl frontier across the network.' },
  { icon: 'trendingUp', title: 'PageRank Authority', desc: 'Graph-based link analysis computes authority scores. Cross-domain links get 1.5x weight. Updated every 5 minutes.' },
  { icon: 'link', title: 'Anchor Text Signals', desc: 'Inbound anchor text is aggregated and indexed, boosting pages for terms used to link to them.' },
];

const techStack = [
  { name: 'Go', color: 'var(--accent)' },
  { name: 'libp2p', color: 'var(--blue)' },
  { name: 'Bleve', color: 'var(--green)' },
  { name: 'BadgerDB', color: 'var(--amber)' },
  { name: 'GossipSub', color: 'var(--purple)' },
  { name: 'Kademlia', color: 'var(--red)' },
  { name: 'goquery', color: 'var(--accent)' },
  { name: 'go-rod', color: 'var(--green)' },
  { name: 'chi', color: 'var(--blue)' },
];

const limitations = [
  { title: 'Single-node storage limits', desc: 'Index size is bounded by local disk. Sharding distributes load but each node stores its own shard.', badge: 'by design' },
  { title: 'No PDF/doc extraction', desc: 'Binary document formats like PDF, DOCX, and PPTX are not yet parsed or indexed.', badge: 'planned' },
  { title: 'No login-gated content', desc: 'Pages behind authentication walls cannot be crawled. Only publicly accessible content is indexed.', badge: 'by design' },
  { title: 'Rate-limited by politeness', desc: 'Strict per-domain rate limiting and robots.txt compliance means some sites crawl slowly. This is intentional.', badge: 'by design' },
];

// ---- Main Render ----
export function renderAbout(container) {
  container.innerHTML = `
    <div class="about-page">
      <section class="about-hero">
        <div class="about-hero-bg"></div>
        <h1 class="about-title">DOOGLE</h1>
        <div class="about-tagline-wrap">
          <p class="about-tagline"></p>
          <span class="about-cursor">|</span>
        </div>
        <p class="about-subtitle">Open source. Zero tracking. Every node is a search engine.</p>
        <button class="btn btn-primary about-explore-btn" onclick="document.getElementById('about-pipeline').scrollIntoView({behavior:'smooth'})">
          Explore How It Works
        </button>
      </section>

      <section class="about-stats-bar about-reveal">
        <div class="about-stat-item">
          <span class="about-stat-value" id="about-stat-docs">--</span>
          <span class="about-stat-label">Indexed Docs</span>
        </div>
        <div class="about-stat-item">
          <span class="about-stat-value" id="about-stat-crawled">--</span>
          <span class="about-stat-label">Crawled URLs</span>
        </div>
        <div class="about-stat-item">
          <span class="about-stat-value" id="about-stat-peers">--</span>
          <span class="about-stat-label">Connected Peers</span>
        </div>
        <div class="about-stat-item">
          <span class="about-stat-value" id="about-stat-uptime">--</span>
          <span class="about-stat-label">Uptime</span>
        </div>
      </section>

      <!-- Pipeline: How It Works -->
      <section class="about-section about-reveal" id="about-pipeline">
        <h2 class="about-section-title">How It Works</h2>
        <p class="about-section-desc">From a website address to a search result — explained simply.</p>
        <div class="about-pipeline">
          ${pipelineSteps.map((step, i) => `
            <div class="about-pipeline-step" data-step="${i}">
              <div class="about-pipeline-icon" style="color:${step.color}">${icon(step.icon, 28)}</div>
              <div class="about-pipeline-label">${step.title}</div>
            </div>
            ${i < pipelineSteps.length - 1 ? `<div class="about-pipeline-arrow">${icon('arrowRight', 16, 'var(--text-muted)')}</div>` : ''}
          `).join('')}
        </div>
        <div class="about-pipeline-detail" id="pipeline-detail">
          <p class="about-eli5-hint">Click a step above to learn more</p>
        </div>
      </section>

      <!-- Interactive PageRank Demo -->
      <section class="about-section about-reveal" id="about-pagerank">
        <h2 class="about-section-title">PageRank: The Popularity Contest</h2>
        <p class="about-section-desc">Pages that lots of other pages link to are probably more important — just like the popular kid at school.</p>
        <div class="about-interactive-demo">
          <canvas id="pagerank-demo" width="600" height="360"></canvas>
          <div class="about-demo-controls">
            <button class="btn btn-primary" id="pr-add-link">Add a Link</button>
            <button class="btn" id="pr-reset">Reset</button>
          </div>
          <p class="about-demo-caption">Click "Add a Link" to see how linking to a page increases its score. The bigger the circle, the higher the PageRank.</p>
        </div>
      </section>

      <!-- Search Pipeline Demo -->
      <section class="about-section about-reveal" id="about-search-demo">
        <h2 class="about-section-title">Smart Search: Understanding You</h2>
        <p class="about-section-desc">Doogle doesn't just match words — it understands what you mean.</p>
        <div class="about-search-demo-wrap">
          <div class="about-search-demo-input">
            <input type="text" id="demo-query" placeholder='Try: "js tutorial" or site:go.dev golang' value="js tutorial">
            <button class="btn btn-primary" id="demo-parse-btn">Parse</button>
          </div>
          <div class="about-search-demo-result" id="demo-parse-result"></div>
        </div>
        <div class="about-search-features">
          <div class="about-search-feature">
            <div class="about-sf-icon" style="color:var(--accent)">${icon('search', 20)}</div>
            <div>
              <strong>Synonym Expansion</strong>
              <p>"js" also searches for "javascript"</p>
            </div>
          </div>
          <div class="about-search-feature">
            <div class="about-sf-icon" style="color:var(--purple)">${icon('fileText', 20)}</div>
            <div>
              <strong>Phrase Matching</strong>
              <p>"exact phrase" matches those exact words together</p>
            </div>
          </div>
          <div class="about-search-feature">
            <div class="about-sf-icon" style="color:var(--green)">${icon('globe', 20)}</div>
            <div>
              <strong>Site Filter</strong>
              <p>site:example.com restricts results to one domain</p>
            </div>
          </div>
          <div class="about-search-feature">
            <div class="about-sf-icon" style="color:var(--amber)">${icon('zap', 20)}</div>
            <div>
              <strong>Fuzzy Matching</strong>
              <p>Typos like "pythn" still find "python"</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Ranking Formula Visual -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">How Results Are Ranked</h2>
        <p class="about-section-desc">Like a recipe — mix the right ingredients in the right amounts.</p>
        <div class="about-ranking-visual">
          <div class="about-rank-formula">
            <div class="about-rank-block" style="--color:var(--accent)">
              <div class="about-rank-bar" style="height:70%"></div>
              <span>BM25<br>Text Match</span>
            </div>
            <span class="about-rank-op">x</span>
            <div class="about-rank-block" style="--color:var(--green)">
              <div class="about-rank-bar" style="height:55%"></div>
              <span>Quality<br>Score</span>
            </div>
            <span class="about-rank-op">x</span>
            <div class="about-rank-block" style="--color:var(--blue)">
              <div class="about-rank-bar" style="height:60%"></div>
              <span>PageRank<br>Authority</span>
            </div>
            <span class="about-rank-op">x</span>
            <div class="about-rank-block" style="--color:var(--amber)">
              <div class="about-rank-bar" style="height:80%"></div>
              <span>Freshness<br>Decay</span>
            </div>
            <span class="about-rank-op">x</span>
            <div class="about-rank-block" style="--color:var(--red)">
              <div class="about-rank-bar" style="height:90%"></div>
              <span>Anti-Spam<br>Factor</span>
            </div>
            <span class="about-rank-op">=</span>
            <div class="about-rank-block about-rank-result" style="--color:var(--purple)">
              <div class="about-rank-bar" style="height:65%"></div>
              <span>Final<br>Score</span>
            </div>
          </div>
          <div class="about-rank-weights">
            <div><span class="about-dot" style="background:var(--accent)"></span> E-E-A-T: 20%</div>
            <div><span class="about-dot" style="background:var(--green)"></span> Quality: 20%</div>
            <div><span class="about-dot" style="background:var(--blue)"></span> PageRank: 20%</div>
            <div><span class="about-dot" style="background:var(--amber)"></span> Readability: 8%</div>
            <div><span class="about-dot" style="background:var(--purple)"></span> Citation: 8%</div>
            <div><span class="about-dot" style="background:var(--red)"></span> SEO: 8%</div>
          </div>
        </div>
      </section>

      <!-- Capabilities -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Capabilities</h2>
        <p class="about-section-desc">Everything packed into a single Go binary.</p>
        <div class="about-capabilities-grid">
          ${capabilities.map(cap => `
            <div class="about-cap-card">
              <div class="about-cap-icon" style="color:var(--accent)">${icon(cap.icon, 28)}</div>
              <h3>${cap.title}</h3>
              <p>${cap.desc}</p>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Architecture -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Architecture</h2>
        <p class="about-section-desc">A single binary. No microservices. No external dependencies at runtime.</p>
        <div class="about-arch-layers">
          <div class="about-arch-layer" style="--layer-color:var(--accent)">
            <div class="about-arch-layer-label">Application Layer</div>
            <div class="about-arch-layer-items">
              <span>${icon('download', 16)} Crawler</span>
              <span>${icon('cpu', 16)} Indexer</span>
              <span>${icon('search', 16)} Search Engine</span>
              <span>${icon('code', 16)} HTTP API</span>
            </div>
          </div>
          <div class="about-arch-layer" style="--layer-color:var(--blue)">
            <div class="about-arch-layer-label">P2P Layer</div>
            <div class="about-arch-layer-items">
              <span>${icon('network', 16)} Kademlia DHT</span>
              <span>${icon('megaphone', 16)} GossipSub</span>
              <span>${icon('radio', 16)} Stream Protocols</span>
            </div>
          </div>
          <div class="about-arch-layer" style="--layer-color:var(--green)">
            <div class="about-arch-layer-label">Storage Layer</div>
            <div class="about-arch-layer-items">
              <span>${icon('database', 16)} BadgerDB</span>
              <span>${icon('fileText', 16)} Bleve Index</span>
              <span>${icon('link', 16)} Link Graph</span>
            </div>
          </div>
        </div>
        <div class="about-tech-badges">
          ${techStack.map(t => `<span class="about-tech-badge" style="border-color:${t.color};color:${t.color}">${t.name}</span>`).join('')}
        </div>
      </section>

      <!-- Limitations -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Limitations &amp; Trade-offs</h2>
        <p class="about-section-desc">Honest disclosure — what Doogle can't do (yet), and why.</p>
        <div class="about-limitations-grid">
          ${limitations.map(lim => `
            <div class="about-limit-card">
              <div class="about-limit-header">
                <h3>${lim.title}</h3>
                <span class="badge ${lim.badge === 'planned' ? 'badge-amber' : 'badge-blue'}">${lim.badge}</span>
              </div>
              <p>${lim.desc}</p>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Get Started -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Get Started</h2>
        <p class="about-section-desc">Three ways to run your own Doogle node.</p>
        <div class="about-getstarted-grid">
          <div class="about-terminal">
            <div class="about-terminal-header">
              <span class="about-terminal-dot" style="background:var(--red)"></span>
              <span class="about-terminal-dot" style="background:var(--amber)"></span>
              <span class="about-terminal-dot" style="background:var(--green)"></span>
              <span class="about-terminal-title">Native Go</span>
            </div>
            <pre class="about-terminal-body"><code>go build -o doogle ./cmd/doogle
./doogle --seed "https://example.com"

# Open http://localhost:8080</code></pre>
          </div>
          <div class="about-terminal">
            <div class="about-terminal-header">
              <span class="about-terminal-dot" style="background:var(--red)"></span>
              <span class="about-terminal-dot" style="background:var(--amber)"></span>
              <span class="about-terminal-dot" style="background:var(--green)"></span>
              <span class="about-terminal-title">Docker</span>
            </div>
            <pre class="about-terminal-body"><code>docker build -t doogle .
docker run -p 8080:8080 -p 4001:4001 \\
  doogle --seed "https://example.com"</code></pre>
          </div>
          <div class="about-terminal">
            <div class="about-terminal-header">
              <span class="about-terminal-dot" style="background:var(--red)"></span>
              <span class="about-terminal-dot" style="background:var(--amber)"></span>
              <span class="about-terminal-dot" style="background:var(--green)"></span>
              <span class="about-terminal-title">Cluster</span>
            </div>
            <pre class="about-terminal-body"><code>make docker-up

# Scales to N nodes:
docker compose up --scale node=3</code></pre>
          </div>
        </div>
      </section>

      <footer class="about-footer">
        <p>Built with purpose. <a href="https://github.com/gorlitzer/doogle-enhanced" target="_blank">View on GitHub</a></p>
      </footer>
    </div>
  `;

  typewriter('A decentralized, peer-to-peer search engine where every node crawls, indexes, and searches together.');
  loadStats();
  startPipelineAnimation();
  setupScrollReveal();
  setupPageRankDemo();
  setupSearchDemo();
}

// ---- Typewriter ----
function typewriter(text) {
  const el = document.querySelector('.about-tagline');
  if (!el) return;
  let i = 0;
  function tick() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      i++;
      setTimeout(tick, 35);
    }
  }
  tick();
}

// ---- Live Stats ----
async function loadStats() {
  try {
    const s = await api.status();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('about-stat-docs', s.indexed_docs?.toLocaleString() ?? '0');
    set('about-stat-crawled', s.crawled_urls?.toLocaleString() ?? '0');
    set('about-stat-peers', s.connected_peers ?? '0');
    set('about-stat-uptime', s.uptime ?? '--');
  } catch { /* decorative */ }
}

// ---- Pipeline Animation ----
function startPipelineAnimation() {
  const steps = document.querySelectorAll('.about-pipeline-step');
  const detail = document.getElementById('pipeline-detail');
  if (!steps.length || !detail) return;

  let current = 0;
  let autoPlay = true;

  function highlight(index) {
    steps.forEach((s, i) => s.classList.toggle('active', i === index));
    const step = pipelineSteps[index];
    detail.innerHTML = `
      <div class="about-pipeline-detail-inner">
        <div class="about-pipeline-detail-icon" style="color:${step.color}">${icon(step.icon, 32)}</div>
        <div>
          <h4>${step.title}</h4>
          <p class="about-eli5">${step.eli5}</p>
          <p class="about-technical">${step.detail}</p>
        </div>
      </div>
    `;
  }

  steps.forEach((s, i) => {
    s.addEventListener('click', () => {
      autoPlay = false;
      current = i;
      highlight(i);
      setTimeout(() => { autoPlay = true; }, 8000);
    });
  });

  highlight(0);
  window._pageInterval = setInterval(() => {
    if (!autoPlay) return;
    current = (current + 1) % pipelineSteps.length;
    highlight(current);
  }, 3000);
}

// ---- PageRank Interactive Demo ----
function setupPageRankDemo() {
  const canvas = document.getElementById('pagerank-demo');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.offsetWidth || 600;
  const H = 360;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const pages = [
    { id: 'A', x: W * 0.5, y: 60, score: 0.2, label: 'Your Page' },
    { id: 'B', x: W * 0.2, y: 180, score: 0.2, label: 'Blog' },
    { id: 'C', x: W * 0.8, y: 180, score: 0.2, label: 'News Site' },
    { id: 'D', x: W * 0.35, y: 300, score: 0.2, label: 'Wiki' },
    { id: 'E', x: W * 0.65, y: 300, score: 0.2, label: 'Forum' },
  ];
  let links = [];
  let linkCount = 0;

  const possibleLinks = [
    { from: 1, to: 0 }, { from: 2, to: 0 }, { from: 3, to: 0 },
    { from: 4, to: 0 }, { from: 3, to: 1 }, { from: 4, to: 2 },
    { from: 1, to: 3 }, { from: 2, to: 4 },
  ];

  function recalcScores() {
    const n = pages.length;
    const scores = new Array(n).fill(1 / n);
    for (let iter = 0; iter < 15; iter++) {
      const next = new Array(n).fill((1 - 0.85) / n);
      for (const lnk of links) {
        const outDeg = links.filter(l => l.from === lnk.from).length || 1;
        next[lnk.to] += 0.85 * scores[lnk.from] / outDeg;
      }
      for (let i = 0; i < n; i++) scores[i] = next[i];
    }
    const max = Math.max(...scores, 0.01);
    pages.forEach((p, i) => { p.score = scores[i] / max; });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw links
    for (const lnk of links) {
      const from = pages[lnk.from];
      const to = pages[lnk.to];
      ctx.strokeStyle = hexToRgba(getCSS('--accent'), 0.3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const r = 12 + to.score * 25;
      const ax = to.x - Math.cos(angle) * r;
      const ay = to.y - Math.sin(angle) * r;
      ctx.fillStyle = hexToRgba(getCSS('--accent'), 0.5);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 8 * Math.cos(angle - 0.4), ay - 8 * Math.sin(angle - 0.4));
      ctx.lineTo(ax - 8 * Math.cos(angle + 0.4), ay - 8 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }

    // Draw pages
    for (const p of pages) {
      const r = 12 + p.score * 25;
      ctx.fillStyle = p.id === 'A'
        ? hexToRgba(getCSS('--accent'), 0.3 + p.score * 0.5)
        : hexToRgba(getCSS('--purple'), 0.2 + p.score * 0.4);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = p.id === 'A' ? 'var(--accent)' : 'var(--purple)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = getCSS('--canvas-text');
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, p.x, p.y - r - 8);

      ctx.fillStyle = getCSS('--canvas-text-bold');
      ctx.font = '10px system-ui';
      ctx.fillText((p.score * 100).toFixed(0) + '%', p.x, p.y + 4);
    }
  }

  recalcScores();
  draw();

  document.getElementById('pr-add-link')?.addEventListener('click', () => {
    if (linkCount >= possibleLinks.length) return;
    links.push(possibleLinks[linkCount]);
    linkCount++;
    recalcScores();
    draw();
  });

  document.getElementById('pr-reset')?.addEventListener('click', () => {
    links = [];
    linkCount = 0;
    recalcScores();
    draw();
  });

  // Redraw on theme change
  window.addEventListener('themechange', draw);
}

// ---- Search Demo ----
const synonymMap = {
  js: ['javascript'], javascript: ['js'], ts: ['typescript'], typescript: ['ts'],
  py: ['python'], python: ['py'], k8s: ['kubernetes'], kubernetes: ['k8s'],
  docs: ['documentation'], doc: ['documentation'], db: ['database'], database: ['db'],
  golang: ['go'], go: ['golang'], rust: ['rustlang'], tutorial: ['guide', 'howto'],
  fix: ['repair', 'resolve'], error: ['bug', 'issue'], ml: ['machine learning'],
};

const stopWords = new Set(['a','an','the','is','are','was','were','be','been','to','of','in','for','on','with','at','by','from','as','and','but','or','not','this','that','it','i','you','he','she','we','they','my','your','his','her','its','our','their','how','what','which','who']);

function parseQueryDemo(raw) {
  const result = { raw, terms: [], phrases: [], site: '', synonyms: {}, fuzzy: false };
  let remaining = raw.trim();

  // Phrases
  const phraseRe = /"([^"]+)"/g;
  let m;
  while ((m = phraseRe.exec(remaining)) !== null) result.phrases.push(m[1]);
  remaining = remaining.replace(phraseRe, ' ');

  // Site
  const siteRe = /site:(\S+)/i;
  const siteMatch = remaining.match(siteRe);
  if (siteMatch) result.site = siteMatch[1].toLowerCase();
  remaining = remaining.replace(siteRe, ' ');

  // Terms
  for (const w of remaining.split(/\s+/)) {
    const lower = w.toLowerCase();
    if (lower && !stopWords.has(lower)) result.terms.push(lower);
  }

  // Synonyms
  for (const t of result.terms) {
    if (synonymMap[t]) result.synonyms[t] = synonymMap[t];
  }

  result.fuzzy = result.terms.length <= 3;
  return result;
}

function setupSearchDemo() {
  const btn = document.getElementById('demo-parse-btn');
  const input = document.getElementById('demo-query');
  if (!btn || !input) return;

  function runDemo() {
    const pq = parseQueryDemo(input.value);
    const el = document.getElementById('demo-parse-result');
    if (!el) return;

    el.innerHTML = `
      <div class="about-parse-grid">
        <div class="about-parse-item">
          <span class="about-parse-label">Terms</span>
          <span class="about-parse-value">${pq.terms.map(t => `<span class="badge badge-accent">${t}</span>`).join(' ') || '<span class="about-parse-empty">none</span>'}</span>
        </div>
        ${pq.phrases.length ? `<div class="about-parse-item">
          <span class="about-parse-label">Phrases</span>
          <span class="about-parse-value">${pq.phrases.map(p => `<span class="badge badge-purple">"${p}"</span>`).join(' ')}</span>
        </div>` : ''}
        ${pq.site ? `<div class="about-parse-item">
          <span class="about-parse-label">Site Filter</span>
          <span class="about-parse-value"><span class="badge badge-green">${pq.site}</span></span>
        </div>` : ''}
        ${Object.keys(pq.synonyms).length ? `<div class="about-parse-item">
          <span class="about-parse-label">Synonyms</span>
          <span class="about-parse-value">${Object.entries(pq.synonyms).map(([k, v]) => `<span class="badge badge-blue">${k} → ${v.join(', ')}</span>`).join(' ')}</span>
        </div>` : ''}
        <div class="about-parse-item">
          <span class="about-parse-label">Fuzzy</span>
          <span class="about-parse-value"><span class="badge ${pq.fuzzy ? 'badge-amber' : 'badge-default'}">${pq.fuzzy ? 'enabled (short query)' : 'disabled'}</span></span>
        </div>
      </div>
    `;
  }

  btn.addEventListener('click', runDemo);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') runDemo(); });
  runDemo();
}

// ---- Scroll Reveal ----
function setupScrollReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.about-reveal').forEach(el => observer.observe(el));
}
