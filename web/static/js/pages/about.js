// Doogle v2 — Interactive About / Disclosure Page
import { api } from '../api.js';

const pipelineSteps = [
  { icon: '&#x1F310;', title: 'Seed URL', desc: 'A URL is added to the frontier — either manually, via peer gossip, or discovered during a previous crawl. The scheduler deduplicates and prioritizes.' },
  { icon: '&#x1F577;', title: 'Crawl', desc: 'A worker fetches the page via HTTP (or headless Chromium for JS-rendered SPAs). Respects robots.txt, rate limits per domain, and follows redirects.' },
  { icon: '&#x1F9E0;', title: 'NLP Enrich', desc: 'Language detection, keyword extraction, readability scoring, and category classification enrich the raw document with semantic signals.' },
  { icon: '&#x2B50;', title: 'Score', desc: 'E-E-A-T quality scoring evaluates expertise, authority, trustworthiness, link structure, freshness, and SEO signals into a composite quality score.' },
  { icon: '&#x1F6E1;', title: 'Spam Filter', desc: 'Keyword stuffing, cloaking patterns, and low-quality signals are detected. Documents above the spam threshold are rejected before indexing.' },
  { icon: '&#x1F4DA;', title: 'Index', desc: 'Bleve full-text search indexes the document with BM25 weighting (title x3, description x1.5, content x1). Stored in BadgerDB.' },
  { icon: '&#x1F50D;', title: 'Search', desc: 'Queries are parsed and matched against the local Bleve index. Results are ranked by a combination of BM25 relevance and quality signals.' },
  { icon: '&#x1F4E1;', title: 'P2P Fan-out', desc: 'Search queries fan out to connected peers via libp2p streams. Results are merged, deduplicated, and re-ranked before being returned.' },
];

const capabilities = [
  { icon: '&#x1F577;', title: 'Distributed Crawling', desc: 'Multi-worker crawl engine with per-domain rate limiting, robots.txt respect, and configurable depth.' },
  { icon: '&#x1F50D;', title: 'Full-Text Search (BM25)', desc: 'Bleve-powered full-text search with field boosting, faceted results, and sub-second query times.' },
  { icon: '&#x2B50;', title: 'Quality Scoring (E-E-A-T)', desc: '10+ scoring signals including expertise, authority, trustworthiness, readability, freshness, and citation analysis.' },
  { icon: '&#x1F9E0;', title: 'NLP Analysis Pipeline', desc: 'Language detection, keyword extraction, category classification, and readability scoring for every crawled document.' },
  { icon: '&#x1F6E1;', title: 'Spam Detection', desc: 'Keyword stuffing detection, cloaking analysis, and quality threshold filtering to keep the index clean.' },
  { icon: '&#x1F4BB;', title: 'Headless JS Rendering', desc: 'go-rod powered headless Chromium fallback for React, Next.js, Angular, and Vue single-page applications.' },
  { icon: '&#x1F310;', title: 'P2P Network (Kademlia DHT)', desc: 'libp2p-based peer discovery via Kademlia DHT and mDNS. No central server — every node is equal.' },
  { icon: '&#x1F4E2;', title: 'GossipSub URL Frontier', desc: 'Discovered URLs are broadcast to peers via GossipSub pub/sub, creating a shared crawl frontier across the network.' },
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
  { title: 'No global PageRank', desc: 'Each node scores documents locally. There is no global link graph analysis across the network.', badge: 'by design' },
  { title: 'Single-node storage limits', desc: 'Index size is bounded by local disk. Sharding distributes load but each node stores its own shard.', badge: 'by design' },
  { title: 'No PDF/doc extraction', desc: 'Binary document formats like PDF, DOCX, and PPTX are not yet parsed or indexed.', badge: 'planned' },
  { title: 'No login-gated content', desc: 'Pages behind authentication walls cannot be crawled. Only publicly accessible content is indexed.', badge: 'by design' },
  { title: 'Rate-limited by politeness', desc: 'Strict per-domain rate limiting and robots.txt compliance means some sites crawl slowly. This is intentional.', badge: 'by design' },
];

export function renderAbout(container) {
  container.innerHTML = `
    <div class="about-page">
      <!-- Hero Section -->
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

      <!-- Live Stats Bar -->
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

      <!-- Pipeline Section -->
      <section class="about-section about-reveal" id="about-pipeline">
        <h2 class="about-section-title">How It Works</h2>
        <p class="about-section-desc">From seed URL to search result — the complete pipeline running on every node.</p>
        <div class="about-pipeline">
          ${pipelineSteps.map((step, i) => `
            <div class="about-pipeline-step" data-step="${i}">
              <div class="about-pipeline-icon">${step.icon}</div>
              <div class="about-pipeline-label">${step.title}</div>
              <div class="about-pipeline-connector"></div>
            </div>
          `).join('')}
        </div>
        <div class="about-pipeline-detail" id="pipeline-detail">
          <p>Click a step above to learn more, or watch the animation cycle through.</p>
        </div>
      </section>

      <!-- Capabilities Section -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Capabilities</h2>
        <p class="about-section-desc">Everything packed into a single Go binary.</p>
        <div class="about-capabilities-grid">
          ${capabilities.map(cap => `
            <div class="about-cap-card">
              <div class="about-cap-icon">${cap.icon}</div>
              <h3>${cap.title}</h3>
              <p>${cap.desc}</p>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Architecture Section -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Architecture</h2>
        <p class="about-section-desc">A single binary. No microservices. No external dependencies at runtime.</p>
        <div class="about-architecture">
          <pre class="about-arch-diagram">
┌─────────────────────────────────────────────────────┐
│                   doogle binary                     │
├──────────────┬──────────────┬───────────────────────┤
│   Crawler    │   Indexer    │     Search Engine      │
│  ┌────────┐  │  ┌────────┐  │  ┌─────────────────┐  │
│  │Workers │  │  │  NLP   │  │  │  Bleve (BM25)   │  │
│  │Pool    │  │  │Pipeline│  │  │  + Quality Rank  │  │
│  ├────────┤  │  ├────────┤  │  ├─────────────────┤  │
│  │Headless│  │  │ Scorer │  │  │  Distributed    │  │
│  │Browser │  │  │(E-E-A-T)│ │  │  Fan-out        │  │
│  ├────────┤  │  ├────────┤  │  └─────────────────┘  │
│  │Robots  │  │  │  Spam  │  │                       │
│  │Cache   │  │  │ Filter │  │                       │
│  └────────┘  │  └────────┘  │                       │
├──────────────┴──────────────┴───────────────────────┤
│                   libp2p Layer                       │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │Kademlia  │  │ GossipSub │  │ Stream Protocols │  │
│  │DHT + mDNS│  │ Pub/Sub   │  │ Search/Crawl/Idx │  │
│  └──────────┘  └───────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────┤
│                   Storage Layer                      │
│  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │ BadgerDB          │  │ Bleve Index             │  │
│  │ URL Queue + State │  │ Full-Text Search Store  │  │
│  └──────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────┘</pre>
        </div>
        <div class="about-tech-badges">
          ${techStack.map(t => `<span class="about-tech-badge" style="border-color:${t.color};color:${t.color}">${t.name}</span>`).join('')}
        </div>
      </section>

      <!-- Limitations Section -->
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

      <!-- Get Started Section -->
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
              <span class="about-terminal-title">Docker — Single Node</span>
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
              <span class="about-terminal-title">Docker Compose — Cluster</span>
            </div>
            <pre class="about-terminal-body"><code>make docker-up

# Scales to N nodes:
docker compose up --scale node=3</code></pre>
          </div>
        </div>
      </section>

      <footer class="about-footer">
        <p>Built with purpose. <a href="https://github.com/doogle/doogle-v2" target="_blank">View on GitHub</a></p>
      </footer>
    </div>
  `;

  // Typewriter effect
  typewriter('A decentralized, peer-to-peer search engine where every node crawls, indexes, and searches together.');

  // Load live stats
  loadStats();

  // Pipeline animation
  startPipelineAnimation();

  // Scroll reveal
  setupScrollReveal();
}

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

async function loadStats() {
  try {
    const s = await api.status();
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('about-stat-docs', s.indexed_docs?.toLocaleString() ?? '0');
    set('about-stat-crawled', s.crawled_urls?.toLocaleString() ?? '0');
    set('about-stat-peers', s.connected_peers ?? '0');
    set('about-stat-uptime', s.uptime ?? '--');
  } catch {
    // Silently fail — stats are decorative
  }
}

function startPipelineAnimation() {
  const steps = document.querySelectorAll('.about-pipeline-step');
  const detail = document.getElementById('pipeline-detail');
  if (!steps.length || !detail) return;

  let current = 0;
  let autoPlay = true;

  function highlight(index) {
    steps.forEach((s, i) => s.classList.toggle('active', i === index));
    const step = pipelineSteps[index];
    detail.innerHTML = `<h4>${step.icon} ${step.title}</h4><p>${step.desc}</p>`;
  }

  function advance() {
    if (!autoPlay) return;
    current = (current + 1) % pipelineSteps.length;
    highlight(current);
  }

  // Click to select a step
  steps.forEach((s, i) => {
    s.addEventListener('click', () => {
      autoPlay = false;
      current = i;
      highlight(i);
      // Resume auto-play after 8 seconds
      setTimeout(() => { autoPlay = true; }, 8000);
    });
  });

  highlight(0);
  window._pageInterval = setInterval(advance, 3000);
}

function setupScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.about-reveal').forEach(el => observer.observe(el));
}
