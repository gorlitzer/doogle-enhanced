// Doogle v2 — Crawler: Dual-View Spotlight Diagram + Management Tabs
import { api } from '../api.js';
import { icon, renderBarChart, renderLineChart, cardSkeleton, escapeHtml, getCSS } from '../components.js';
import { SpotlightDiagram, formatNum, renderMobileCards } from '../spotlight.js';

// ============================================================
// GAUGE VIEW — Spotlight grid columns with rich gauges
// Col 0: Queue Input   Col 1: Processing   Col 2: Auxiliary + Output
// ============================================================
const GAUGE_COMPONENTS = [
  // Column 0 — Queue Input
  { id: 'queue',     label: 'URL Queue',        col: 0, row: 0, boxH: 150 },
  { id: 'ratelimit', label: 'Rate Limiter',      col: 0, row: 1, boxH: 110 },
  // Column 1 — Processing
  { id: 'workers',   label: 'Worker Pool',       col: 1, row: 0, boxH: 150 },
  { id: 'fetch',     label: 'HTTP Fetch',        col: 1, row: 1, boxH: 120 },
  { id: 'extract',   label: 'Content Extractor', col: 1, row: 2, boxH: 100 },
  // Column 2 — Auxiliary + Output
  { id: 'robots',    label: 'robots.txt Cache',  col: 2, row: 0, boxH: 110 },
  { id: 'redirect',  label: 'Redirect Handler',  col: 2, row: 1, boxH: 100 },
  { id: 'output',    label: 'To Indexer',        col: 2, row: 2, boxH: 150 },
];

const GAUGE_CONNECTIONS = [
  { from: 'queue',     to: 'ratelimit' },
  { from: 'ratelimit', to: 'workers' },
  { from: 'workers',   to: 'robots' },
  { from: 'workers',   to: 'fetch' },
  { from: 'fetch',     to: 'redirect' },
  { from: 'fetch',     to: 'extract' },
  { from: 'extract',   to: 'output' },
];

// ============================================================
// FLOW VIEW — Simpler architecture diagram with text metrics
// ============================================================
const FLOW_COMPONENTS = [
  { id: 'queue',     label: 'URL Queue',        col: 1, row: 0 },
  { id: 'ratelimit', label: 'Rate Limiter',      col: 1, row: 1 },
  { id: 'workers',   label: 'Worker Pool',       col: 1, row: 2 },
  { id: 'robots',    label: 'robots.txt Cache',  col: 2, row: 1 },
  { id: 'fetch',     label: 'HTTP Fetch',        col: 1, row: 3 },
  { id: 'redirect',  label: 'Redirect Handler',  col: 2, row: 3 },
  { id: 'extract',   label: 'Content Extractor', col: 1, row: 4 },
  { id: 'output',    label: 'To Indexer',        col: 0, row: 4 },
];

const FLOW_CONNECTIONS = [
  { from: 'queue',     to: 'ratelimit' },
  { from: 'ratelimit', to: 'workers' },
  { from: 'workers',   to: 'robots' },
  { from: 'workers',   to: 'fetch' },
  { from: 'fetch',     to: 'redirect' },
  { from: 'fetch',     to: 'extract' },
  { from: 'extract',   to: 'output' },
];

const NAV_ROUTES = {
  output: '#/admin/indexer',
};

// ============================================================
// STATE
// ============================================================
let diagram = null;
let activeTab = 'architecture';
let crawlHistory = [];
let feedLastSeq = 0;
let feedInterval = null;
let currentView = localStorage.getItem('doogle-crawler-view') || 'flow';
let lastData = { status: null, crawler: null };
let mobileBoxData = new Map();
const MOBILE_BP = 700;
let _mobileResizeHandler = null;

// ============================================================
// PAGE RENDER
// ============================================================
export function renderCrawler(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Crawler</h2>
      <p>Monitor, configure, and inspect the distributed crawl pipeline</p>
    </div>
    <div class="tabs" id="crawler-tabs">
      <button class="tab active" data-tab="architecture">Architecture</button>
      <button class="tab" data-tab="status">Status</button>
      <button class="tab" data-tab="feed">Live Feed</button>
      <button class="tab" data-tab="analytics">Analytics</button>
      <button class="tab" data-tab="seeds">Seeds</button>
      <button class="tab" data-tab="features">Features</button>
    </div>
    <div id="crawler-content"></div>
  `;

  // Tabs
  document.querySelectorAll('#crawler-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('#crawler-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTab();
    });
  });

  renderTab();
  loadDiagramData();

  window._pageInterval = setInterval(() => {
    loadDiagramData();
    if (activeTab === 'status' || activeTab === 'analytics' || activeTab === 'architecture') renderTab();
  }, 5000);

  window._pageCleanup = () => {
    if (diagram) { diagram.destroy(); diagram = null; }
    if (feedInterval) { clearInterval(feedInterval); feedInterval = null; }
    if (_mobileResizeHandler) { window.removeEventListener('resize', _mobileResizeHandler); _mobileResizeHandler = null; }
    mobileBoxData.clear();
  };
}

function syncMobileView() {
  if (activeTab !== 'architecture') return;
  const isMobile = window.innerWidth < MOBILE_BP;
  const canvasWrap = document.getElementById('canvas-wrap');
  const cardsWrap = document.getElementById('mobile-cards-wrap');
  const toggleEl = document.getElementById('view-toggle');
  if (!canvasWrap || !cardsWrap) return;

  if (isMobile) {
    canvasWrap.style.display = 'none';
    if (toggleEl) toggleEl.style.display = 'none';
    cardsWrap.style.display = '';
    if (mobileBoxData.size > 0)
      renderMobileCards(cardsWrap, [...mobileBoxData.values()], NAV_ROUTES);
  } else {
    canvasWrap.style.display = '';
    if (toggleEl) toggleEl.style.display = '';
    cardsWrap.style.display = 'none';
    if (!diagram) {
      buildDiagram();
      if (lastData.status || lastData.crawler) applyDiagramData(lastData.status, lastData.crawler);
    }
  }
}

function buildDiagram() {
  const canvasEl = document.getElementById('crawler-spotlight');
  if (!canvasEl) return;

  const isGauge = currentView === 'grid';
  diagram = new SpotlightDiagram(canvasEl, {
    components: isGauge ? GAUGE_COMPONENTS : FLOW_COMPONENTS,
    connections: isGauge ? GAUGE_CONNECTIONS : FLOW_CONNECTIONS,
    navRoutes: NAV_ROUTES,
    layout: isGauge ? 'grid' : 'flow',
    cols: 3,
    rows: isGauge ? 3 : 5,
    boxW: isGauge ? 160 : 180,
    boxH: isGauge ? 105 : 90,
    minHeight: isGauge ? 500 : 560,
    maxHeight: isGauge ? 600 : 680,
    onTooltipExtra: (box, data) => {
      const cr = data.crawler || {};
      const map = {
        queue:     () => [`Seen URLs: ${formatNum(cr.seen_urls || 0)}`],
        ratelimit: () => [`${cr.rate_limit || '—'} req/min/domain`],
        workers:   () => [`User-Agent: ${(cr.user_agent || '').slice(0, 30)}`],
        robots:    () => ['Respects robots.txt', 'TTL: 24h cache'],
        fetch:     () => [`Body limit: 10 MB`, `Timeout: 30s`],
        redirect:  () => ['Max 10 hops', 'Loop detection'],
        extract:   () => ['Title, desc, headings', 'Links, OG tags, images'],
        output:    () => [],
      };
      return (map[box.id] || (() => []))();
    },
  });
  diagram.start();
  if (lastData.status || lastData.crawler) {
    applyDiagramData(lastData.status, lastData.crawler);
  }
}

function rebuildDiagram() {
  if (diagram) { diagram.destroy(); diagram = null; }
  buildDiagram();
}

// ============================================================
// DIAGRAM DATA
// ============================================================
async function loadDiagramData() {
  try {
    const [status, crawler] = await Promise.all([
      api.status().catch(() => null),
      api.crawlerStatus().catch(() => null),
    ]);
    lastData = { status, crawler };
    applyDiagramData(status, crawler);
  } catch { /* ignore */ }
}

function applyDiagramData(status, crawler) {
  const s = status || {};
  const cr = crawler || {};
  if (diagram) diagram.setData({ status, crawler });

  const isGauge = currentView === 'grid';
  const queueCount = s.urls_in_queue || 0;
  const activeW = cr.active_workers || 0;
  const totalW = cr.workers || 0;
  const totalFailed = cr.total_failed || 0;
  const totalCrawled = cr.total_crawled || 0;
  const successPct = (totalCrawled + totalFailed) > 0 ? totalCrawled / (totalCrawled + totalFailed) : 1;

  const comps = isGauge ? GAUGE_COMPONENTS : FLOW_COMPONENTS;
  const labelMap = {};
  for (const c of comps) labelMap[c.id] = c.label;

  function setBox(id, data) {
    if (diagram) diagram.setBoxData(id, data);
    mobileBoxData.set(id, { id, label: labelMap[id] || id, ...data });
  }

  if (isGauge) {
    setBox('queue', {
      health: queueCount > 0 ? 'green' : 'amber',
      gauges: [
        { type: 'counter', value: queueCount, label: 'queued URLs', color: getCSS('--accent') },
        { type: 'bar', value: queueCount, max: Math.max(50000, queueCount), label: 'capacity', color: getCSS('--accent') },
      ],
      metrics: [`Seen: ${formatNum(cr.seen_urls || 0)}`],
    });
    setBox('ratelimit', {
      health: 'green',
      gauges: [
        { type: 'counter', value: cr.rate_limit || 0, label: 'req/min/domain', color: getCSS('--amber') },
      ],
      metrics: ['Per-domain throttle'],
    });
    setBox('workers', {
      health: activeW > 0 ? 'green' : (totalW > 0 ? 'amber' : 'red'),
      gauges: [
        { type: 'ring', value: activeW, max: totalW, label: `${activeW}/${totalW} active`, color: getCSS('--green') },
        { type: 'counter', value: totalCrawled, label: 'total crawled', color: getCSS('--accent') },
      ],
      metrics: [],
    });
    setBox('robots', {
      health: 'green',
      gauges: [
        { type: 'ring', value: 1, max: 1, label: 'compliant', color: getCSS('--green') },
      ],
      metrics: ['24h TTL cache'],
    });
    setBox('fetch', {
      health: totalFailed > totalCrawled * 0.5 ? 'red' : 'green',
      gauges: [
        { type: 'ring', value: successPct, max: 1, label: 'success rate', color: successPct > 0.8 ? getCSS('--green') : getCSS('--amber') },
        { type: 'counter', value: totalFailed, label: 'failed', color: getCSS('--red') },
      ],
      metrics: [`JS rendered: ${formatNum(cr.js_rendered || 0)}`],
    });
    setBox('redirect', {
      health: 'green',
      gauges: [],
      metrics: ['Max 10 hops', 'Loop detection'],
    });
    setBox('extract', {
      health: 'green',
      gauges: [],
      metrics: ['Title, desc, links', 'OG tags, images'],
    });
    setBox('output', {
      health: (s.indexed_docs || 0) > 0 ? 'green' : 'amber',
      gauges: [
        { type: 'counter', value: totalCrawled, label: 'to indexer', color: getCSS('--green') },
      ],
      metrics: [],
    });
  } else {
    setBox('queue', {
      health: queueCount > 0 ? 'green' : 'amber',
      gauges: [],
      metrics: [`Queued: ${formatNum(queueCount)}`, `Seen: ${formatNum(cr.seen_urls || 0)}`],
    });
    setBox('ratelimit', {
      health: 'green',
      gauges: [],
      metrics: [`${cr.rate_limit || '—'} req/min/domain`],
    });
    setBox('workers', {
      health: activeW > 0 ? 'green' : (totalW > 0 ? 'amber' : 'red'),
      gauges: [],
      metrics: [`Workers: ${activeW}/${totalW}`, `Crawled: ${formatNum(totalCrawled)}`],
    });
    setBox('robots', {
      health: 'green',
      gauges: [],
      metrics: ['robots.txt compliant', '24h TTL cache'],
    });
    setBox('fetch', {
      health: totalFailed > totalCrawled * 0.5 ? 'red' : 'green',
      gauges: [],
      metrics: [`Success: ${(successPct * 100).toFixed(0)}%`, `Failed: ${formatNum(totalFailed)}`, `JS: ${formatNum(cr.js_rendered || 0)}`],
    });
    setBox('redirect', {
      health: 'green',
      gauges: [],
      metrics: ['Max 10 hops', 'Loop detection'],
    });
    setBox('extract', {
      health: 'green',
      gauges: [],
      metrics: ['Title, desc, links', 'OG tags, images'],
    });
    setBox('output', {
      health: (s.indexed_docs || 0) > 0 ? 'green' : 'amber',
      gauges: [],
      metrics: [`Output: ${formatNum(totalCrawled)}`],
    });
  }

  if (diagram) diagram.setSpawnRate(Math.max(1, activeW));
  renderCrawlerSummary(s, cr);
  syncMobileView();
}

function renderCrawlerSummary(s, cr) {
  const el = document.getElementById('crawler-summary');
  if (!el) return;
  const activeW = cr.active_workers || 0;
  const totalW = cr.workers || 0;
  const upMins = parseUptimeMinutes(s.uptime);
  const crawlRate = upMins > 0 ? ((s.crawled_urls || 0) / upMins).toFixed(1) : '0';

  el.innerHTML = `
    <div class="spotlight-group">
      <span class="spotlight-group-label">This Crawler</span>
      <div class="spotlight-metrics-row">
        <div class="spotlight-metric">
          ${icon('link', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(s.urls_in_queue || 0)}</span>
          <span class="spotlight-metric-label">Queue</span>
        </div>
        <div class="spotlight-metric">
          ${icon('globe', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(cr.total_crawled || s.crawled_urls || 0)}</span>
          <span class="spotlight-metric-label">Crawled</span>
        </div>
        <div class="spotlight-metric">
          ${icon('cpu', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${activeW}/${totalW}</span>
          <span class="spotlight-metric-label">Workers</span>
        </div>
        <div class="spotlight-metric">
          ${icon('zap', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${crawlRate}</span>
          <span class="spotlight-metric-label">URLs/min</span>
        </div>
        <div class="spotlight-metric">
          ${icon('eye', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(cr.seen_urls || 0)}</span>
          <span class="spotlight-metric-label">Seen</span>
        </div>
        <div class="spotlight-metric">
          ${icon('alertTriangle', 16, 'var(--red)')}
          <span class="spotlight-metric-value">${formatNum(cr.total_failed || 0)}</span>
          <span class="spotlight-metric-label">Failed</span>
        </div>
        <div class="spotlight-metric">
          ${icon('upload', 16, 'var(--amber)')}
          <span class="spotlight-metric-value">${formatNum(cr.forwarded_tasks || 0)}</span>
          <span class="spotlight-metric-label">Forwarded</span>
        </div>
        <div class="spotlight-metric">
          ${icon('download', 16, 'var(--green)')}
          <span class="spotlight-metric-value">${formatNum(cr.received_from_peers || 0)}</span>
          <span class="spotlight-metric-label">From Peers</span>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// TABS (preserved from original)
// ============================================================
async function renderTab() {
  const content = document.getElementById('crawler-content');
  if (!content) return;

  if (activeTab !== 'feed' && feedInterval) {
    clearInterval(feedInterval);
    feedInterval = null;
  }

  // Destroy diagram and clean up resize listener when leaving the architecture tab
  if (activeTab !== 'architecture') {
    if (diagram) { diagram.destroy(); diagram = null; }
    if (_mobileResizeHandler) { window.removeEventListener('resize', _mobileResizeHandler); _mobileResizeHandler = null; }
  }

  if (activeTab === 'architecture') renderArchitecture(content);
  else if (activeTab === 'status') await renderStatus(content);
  else if (activeTab === 'feed') renderFeed(content);
  else if (activeTab === 'analytics') await renderAnalytics(content);
  else if (activeTab === 'seeds') renderSeeds(content);
  else if (activeTab === 'features') renderFeatures(content);
}

function renderArchitecture(el) {
  // Skip full rebuild if the diagram is already live on this tab
  if (diagram && document.getElementById('crawler-spotlight')) return;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <div>
        <h3 style="font-size:1.1em;font-weight:600;color:var(--text-primary);margin:0">Spotlight</h3>
        <p style="color:var(--text-muted);font-size:0.85em;margin:4px 0 0">Live view of the crawl pipeline and its components</p>
      </div>
      <div class="view-toggle" id="view-toggle">
        <button class="view-toggle-btn ${currentView === 'flow' ? 'active' : ''}" data-view="flow" title="Architecture flow">
          ${icon('gitBranch', 16)} Flow
        </button>
        <button class="view-toggle-btn ${currentView === 'grid' ? 'active' : ''}" data-view="grid" title="Spotlight gauges">
          ${icon('barChart2', 16)} Gauges
        </button>
      </div>
    </div>
    <div class="spotlight-canvas-wrap" id="canvas-wrap">
      <canvas id="crawler-spotlight"></canvas>
    </div>
    <div id="mobile-cards-wrap" class="mobile-cards-grid" style="display:none"></div>
    <div id="crawler-summary" class="spotlight-summary">
      <div class="loading">Loading crawler data...</div>
    </div>
  `;

  document.getElementById('view-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    const view = btn.dataset.view;
    if (view === currentView) return;
    currentView = view;
    localStorage.setItem('doogle-crawler-view', view);
    document.querySelectorAll('#view-toggle .view-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    rebuildDiagram();
  });

  buildDiagram();
  if (_mobileResizeHandler) window.removeEventListener('resize', _mobileResizeHandler);
  _mobileResizeHandler = () => syncMobileView();
  window.addEventListener('resize', _mobileResizeHandler);
  syncMobileView();
  loadDiagramData();
}

async function renderStatus(el) {
  try {
    const [status, crawler] = await Promise.all([api.status(), api.crawlerStatus().catch(() => null)]);
    const workers = crawler?.workers || 'N/A';
    const rateLimit = crawler?.rate_limit || 'N/A';
    const maxDepth = crawler?.max_depth || 'N/A';
    const userAgent = crawler?.user_agent || 'N/A';
    const totalCrawled = crawler?.total_crawled || 0;
    const totalFailed = crawler?.total_failed || 0;
    const activeWorkers = crawler?.active_workers || 0;
    const seenURLs = crawler?.seen_urls || 0;
    const upMins = parseUptimeMinutes(status.uptime);
    const crawlRate = upMins > 0 ? (status.crawled_urls / upMins).toFixed(1) : '0';
    const successRate = (totalCrawled + totalFailed) > 0
      ? ((totalCrawled / (totalCrawled + totalFailed)) * 100).toFixed(1) : '—';

    crawlHistory.push({ time: new Date(), crawled: status.crawled_urls, queued: status.urls_in_queue });
    if (crawlHistory.length > 60) crawlHistory.shift();

    el.innerHTML = `
      <div class="card-grid">
        <div class="card"><div class="card-label">Crawled URLs</div><div class="card-value">${status.crawled_urls.toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Queue Depth</div><div class="card-value">${status.urls_in_queue.toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Crawl Rate</div><div class="card-value">${crawlRate}</div><div class="card-sub">URLs/minute</div></div>
        <div class="card"><div class="card-label">Active Workers</div><div class="card-value">${activeWorkers} <span style="font-size:0.5em;color:var(--text-muted)">/ ${workers}</span></div></div>
        <div class="card"><div class="card-label">Success Rate</div><div class="card-value">${successRate}${successRate !== '—' ? '%' : ''}</div><div class="card-sub">${totalCrawled.toLocaleString()} ok / ${totalFailed.toLocaleString()} failed</div></div>
        <div class="card"><div class="card-label">Seen URLs</div><div class="card-value">${seenURLs.toLocaleString()}</div><div class="card-sub">unique URLs discovered</div></div>
        <div class="card"><div class="card-label">Forwarded</div><div class="card-value">${(crawler?.forwarded_tasks || 0).toLocaleString()}</div><div class="card-sub">tasks sent to domain owners</div></div>
        <div class="card"><div class="card-label">From Peers</div><div class="card-value">${(crawler?.received_from_peers || 0).toLocaleString()}</div><div class="card-sub">tasks received from peers</div></div>
      </div>
      <div class="section">
        <h3>Configuration</h3>
        <div class="table-wrap"><table><tbody>
          <tr><td>User Agent</td><td class="mono">${escapeHtml(String(userAgent))}</td></tr>
          <tr><td>Workers</td><td>${workers}</td></tr>
          <tr><td>Rate Limit</td><td>${rateLimit} req/min/domain</td></tr>
          <tr><td>Max Depth</td><td>${maxDepth}</td></tr>
          <tr><td>Robots.txt</td><td><span class="badge badge-green">respected</span></td></tr>
          <tr><td>Body Limit</td><td>10 MB</td></tr>
          <tr><td>Redirect Limit</td><td>10 hops</td></tr>
        </tbody></table></div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load crawler status: ${err.message}</p></div>`;
  }
}

function renderFeed(el) {
  if (!el.querySelector('.crawl-feed-container')) {
    feedLastSeq = 0;
    el.innerHTML = `
      <div class="section">
        <h3>Live Crawl Feed</h3>
        <p style="color:var(--text-muted);font-size:0.9em;margin-bottom:12px">Real-time stream of URLs being crawled.</p>
        <div class="crawl-feed-header"><span></span><span>URL</span><span>Domain</span><span>Title</span><span>Size</span><span>Time</span></div>
        <div class="crawl-feed-container" id="crawl-feed"></div>
      </div>
    `;
  }
  pollFeed();
  if (feedInterval) clearInterval(feedInterval);
  feedInterval = setInterval(pollFeed, 5000);
}

async function pollFeed() {
  try {
    const data = await api.crawlerFeed(feedLastSeq);
    const events = data.events || [];
    if (events.length === 0) return;
    const container = document.getElementById('crawl-feed');
    if (!container) return;

    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev.seq > feedLastSeq) feedLastSeq = ev.seq;
      const row = document.createElement('div');
      row.className = 'crawl-event' + (ev.status === 'failed' ? ' ev-fail' : '');
      const dotCls = ev.status === 'ok' ? 'dot-ok' : 'dot-fail';
      row.innerHTML = `
        <span class="crawl-dot ${dotCls}"></span>
        <span class="crawl-url mono" title="${escapeHtml(ev.url)}">${escapeHtml(ev.url).slice(0, 80)}</span>
        <span class="crawl-domain">${escapeHtml(ev.domain || '')}</span>
        <span class="crawl-title">${ev.title ? escapeHtml(ev.title).slice(0, 40) : ''}</span>
        <span class="crawl-size">${ev.content_size ? formatBytes(ev.content_size) : ''}</span>
        <span class="crawl-time">${relativeTime(ev.timestamp)}</span>
      `;
      if (ev.status === 'failed' && ev.error) row.title = ev.error;
      container.prepend(row);
      scheduleFade(row);
    }
    while (container.children.length > 25) container.removeChild(container.lastChild);
  } catch { /* ignore */ }
}

function scheduleFade(row) {
  const timer = setTimeout(() => {
    if (!row.parentNode) return;
    row.classList.add('fading');
    row.addEventListener('animationend', () => { if (row.parentNode) row.parentNode.removeChild(row); }, { once: true });
  }, 10000);
  row.addEventListener('mouseenter', () => { clearTimeout(timer); row.classList.remove('fading'); });
  row.addEventListener('mouseleave', () => { scheduleFade(row); });
}

async function renderAnalytics(el) {
  try {
    const status = await api.status();
    const upMins = parseUptimeMinutes(status.uptime);
    const crawlRate = upMins > 0 ? (status.crawled_urls / upMins).toFixed(1) : '0';

    el.innerHTML = `
      <div class="card-grid">
        <div class="card"><div class="card-label">Total Crawled</div><div class="card-value">${status.crawled_urls.toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Current Queue</div><div class="card-value">${status.urls_in_queue.toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Avg Rate</div><div class="card-value">${crawlRate} URL/min</div></div>
        <div class="card"><div class="card-label">Indexed</div><div class="card-value">${status.indexed_docs.toLocaleString()}</div><div class="card-sub">Index rate: ${upMins > 0 ? (status.indexed_docs / upMins).toFixed(1) : '0'}/min</div></div>
      </div>
      <div class="section"><h3>Crawl Activity (live)</h3><div class="chart-container"><canvas id="crawl-activity-chart"></canvas></div></div>
      <div class="section"><h3>Crawled vs Indexed</h3><div class="chart-container"><canvas id="crawl-vs-indexed-chart"></canvas></div></div>
      <div class="section"><h3>Queue Depth Over Time</h3><div class="chart-container"><canvas id="queue-depth-chart"></canvas></div></div>
    `;

    if (crawlHistory.length > 1) {
      const deltas = [];
      for (let i = 1; i < crawlHistory.length; i++) {
        deltas.push({ label: formatTime(crawlHistory[i].time), value: crawlHistory[i].crawled - crawlHistory[i - 1].crawled });
      }
      renderLineChart('crawl-activity-chart', [{ label: 'URLs crawled/interval', color: getCSS('--accent'), data: deltas }], { height: 200 });
    } else {
      renderLineChart('crawl-activity-chart', [], { height: 200 });
    }

    renderBarChart('crawl-vs-indexed-chart', [
      { label: 'Crawled', value: status.crawled_urls, color: getCSS('--accent') },
      { label: 'Indexed', value: status.indexed_docs, color: getCSS('--green') },
      { label: 'Queue', value: status.urls_in_queue, color: getCSS('--amber') },
    ], { height: 200 });

    if (crawlHistory.length > 1) {
      const queueData = crawlHistory.map(h => ({ label: formatTime(h.time), value: h.queued }));
      renderLineChart('queue-depth-chart', [{ label: 'Queue depth', color: getCSS('--amber'), data: queueData }], { height: 200 });
    } else {
      renderLineChart('queue-depth-chart', [], { height: 200 });
    }
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load analytics: ${err.message}</p></div>`;
  }
}

function renderSeeds(el) {
  el.innerHTML = `
    <div class="section">
      <h3>Add Seed URL</h3>
      <p style="color:var(--text-muted);font-size:0.9em;margin-bottom:12px">Seed URLs are the starting points for the crawler.</p>
      <div class="form-row">
        <input type="text" id="seed-input" placeholder="https://example.com">
        <button class="btn btn-primary" id="seed-add-btn">Add Seed</button>
      </div>
      <div id="seed-result" style="margin-top:8px"></div>
    </div>
    <div class="section">
      <h3>Bulk Add Seeds</h3>
      <textarea id="bulk-seeds" rows="8" style="width:100%;padding:12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-family:monospace;font-size:0.85em;resize:vertical" placeholder="One URL per line"></textarea>
      <button class="btn btn-primary" id="bulk-add-btn" style="margin-top:8px">Add All</button>
      <div id="bulk-result" style="margin-top:8px"></div>
    </div>
    <div class="section">
      <h3>Suggested Seeds</h3>
      <p style="color:var(--text-muted);font-size:0.9em;margin-bottom:12px">Click to queue popular starting points.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${suggestedSeeds.map(s => `<button class="badge badge-accent suggested-seed" data-url="${s}" style="cursor:pointer;border:none;font-family:inherit;font-size:0.85em;padding:5px 10px">${s.replace('https://', '')}</button>`).join('')}
      </div>
      <div id="suggested-result" style="margin-top:8px"></div>
    </div>
  `;

  document.getElementById('seed-add-btn').addEventListener('click', async () => {
    const input = document.getElementById('seed-input');
    const result = document.getElementById('seed-result');
    const url = input.value.trim();
    if (!url) return;
    try { await api.addSeed(url); result.innerHTML = `<span class="badge badge-green">Queued: ${escapeHtml(url)}</span>`; input.value = ''; }
    catch (err) { result.innerHTML = `<span class="badge badge-red">Error: ${err.message}</span>`; }
  });
  document.getElementById('seed-input').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('seed-add-btn').click(); });

  document.getElementById('bulk-add-btn').addEventListener('click', async () => {
    const textarea = document.getElementById('bulk-seeds');
    const result = document.getElementById('bulk-result');
    const urls = textarea.value.split('\n').map(u => u.trim()).filter(u => u && u.startsWith('http'));
    if (urls.length === 0) { result.innerHTML = '<span class="badge badge-amber">No valid URLs found</span>'; return; }
    let ok = 0, fail = 0;
    for (const url of urls) { try { await api.addSeed(url); ok++; } catch { fail++; } }
    result.innerHTML = `<span class="badge badge-green">${ok} queued</span>${fail > 0 ? ` <span class="badge badge-red">${fail} failed</span>` : ''}`;
    textarea.value = '';
  });

  el.querySelectorAll('.suggested-seed').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.url;
      const result = document.getElementById('suggested-result');
      try { await api.addSeed(url); btn.style.opacity = '0.4'; btn.disabled = true; result.innerHTML = `<span class="badge badge-green">Queued: ${url}</span>`; }
      catch (err) { result.innerHTML = `<span class="badge badge-red">Error: ${err.message}</span>`; }
    });
  });
}

const suggestedSeeds = [
  'https://en.wikipedia.org', 'https://news.ycombinator.com', 'https://go.dev',
  'https://developer.mozilla.org', 'https://docs.python.org/3/', 'https://www.rust-lang.org',
  'https://blog.cloudflare.com', 'https://arxiv.org', 'https://lobste.rs', 'https://lwn.net',
  'https://stackoverflow.com', 'https://www.reuters.com', 'https://arstechnica.com',
  'https://www.bbc.com/news', 'https://www.nature.com', 'https://github.com/trending',
  'https://web.dev', 'https://kubernetes.io/docs/', 'https://redis.io/docs/',
  'https://www.postgresql.org/docs/', 'https://reactjs.org', 'https://vuejs.org',
  'https://angular.dev', 'https://www.typescriptlang.org', 'https://deno.land',
  'https://bun.sh', 'https://htmx.org', 'https://tailwindcss.com',
  'https://css-tricks.com', 'https://www.smashingmagazine.com',
];

function renderFeatures(el) {
  el.innerHTML = `
    <div class="section">
      <h3>Crawler Features</h3>
      <div class="card-grid">
        ${feature('Distributed Crawling', 'URLs broadcast via GossipSub to the P2P network. Nodes claim URLs by consistent hash.', true)}
        ${feature('Domain-Aware Task Routing', 'Before crawling, each URL is checked against the shard ring. Non-owners forward tasks to the responsible peer via /doogle/crawl/1.0.0. Falls back to local crawl if the owner is offline.', true)}
        ${feature('robots.txt Compliance', 'Respects robots.txt directives per domain with 24h TTL cache.', true)}
        ${feature('Per-Domain Rate Limiting', 'Sliding window rate limiter prevents overloading any single domain.', true)}
        ${feature('Depth Control', 'Configurable max crawl depth to prevent endless recursion.', true)}
        ${feature('Rich Content Extraction', 'Title, description, headings (h1-h6), images with alt text, OG tags, canonical URLs, meta keywords.', true)}
        ${feature('Link Discovery', 'Categorizes internal/external links, normalizes URLs, deduplicates.', true)}
        ${feature('Redirect Handling', 'Follows up to 10 redirects with loop detection.', true)}
        ${feature('Content Type Filter', 'Only processes HTML/XHTML responses, skips binary content.', true)}
        ${feature('10MB Body Limit', 'Prevents memory issues from abnormally large pages.', true)}
        ${feature('Graceful Shutdown', 'Workers finish current task before stopping. No data loss.', true)}
      </div>
    </div>
  `;
}

function feature(name, desc, enabled) {
  return `<div class="card card-sm"><div class="card-label">${enabled ? '<span class="badge badge-green">active</span>' : '<span class="badge badge-default">planned</span>'} ${escapeHtml(name)}</div><div class="card-sub" style="margin-top:4px">${escapeHtml(desc)}</div></div>`;
}

// ============================================================
// HELPERS
// ============================================================
function parseUptimeMinutes(uptime) {
  if (!uptime) return 1;
  let total = 0;
  const h = uptime.match(/(\d+)h/);
  const m = uptime.match(/(\d+)m/);
  const s = uptime.match(/(\d+)s/);
  if (h) total += parseInt(h[1]) * 60;
  if (m) total += parseInt(m[1]);
  if (s) total += parseInt(s[1]) / 60;
  return Math.max(1, total);
}

function formatTime(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function relativeTime(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
}
