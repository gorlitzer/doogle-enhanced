// Doogle v2 — Node Overview: Dual-View Monitoring Dashboard
// Toggle between Spotlight gauge columns and Architecture flow diagram
import { api } from '../api.js';
import { icon, getCSS, escapeHtml } from '../components.js';
import { SpotlightDiagram, formatNum, renderMobileCards } from '../spotlight.js';

// ── Spotlight Grid Config (gauge columns) ──
const GRID_COMPONENTS = [
  { id: 'p2p',      label: 'P2P Network',    col: 0, row: 0, boxH: 150 },
  { id: 'trust',    label: 'Trust & Safety',  col: 0, row: 1, boxH: 110 },
  { id: 'queue',    label: 'URL Queue',       col: 1, row: 0, boxH: 140 },
  { id: 'crawler',  label: 'Crawler',          col: 1, row: 1, boxH: 140 },
  { id: 'indexer',  label: 'Indexer',          col: 2, row: 0, boxH: 150 },
  { id: 'search',   label: 'Search Engine',   col: 2, row: 1, boxH: 110 },
  { id: 'storage',  label: 'Storage',          col: 3, row: 0, boxH: 260 },
];

const GRID_CONNECTIONS = [
  { from: 'p2p',     to: 'queue' },
  { from: 'queue',   to: 'crawler' },
  { from: 'crawler', to: 'indexer' },
  { from: 'crawler', to: 'trust' },
  { from: 'indexer', to: 'search' },
  { from: 'indexer', to: 'storage' },
  { from: 'crawler', to: 'storage' },
];

// ── Architecture Flow Config (pipeline diagram) ──
const FLOW_COMPONENTS = [
  { id: 'p2p',      label: 'P2P Network',    col: 1, row: 0 },
  { id: 'queue',    label: 'URL Queue',       col: 1, row: 1 },
  { id: 'trust',    label: 'Trust & Safety',  col: 0, row: 2 },
  { id: 'crawler',  label: 'Crawler',          col: 1, row: 2 },
  { id: 'indexer',  label: 'Indexer',          col: 1, row: 3 },
  { id: 'storage',  label: 'Storage',          col: 0, row: 4 },
  { id: 'search',   label: 'Search Engine',   col: 2, row: 4 },
];

const FLOW_CONNECTIONS = [
  { from: 'p2p',     to: 'queue' },
  { from: 'queue',   to: 'crawler' },
  { from: 'crawler', to: 'indexer' },
  { from: 'crawler', to: 'trust' },
  { from: 'indexer', to: 'storage' },
  { from: 'indexer', to: 'search' },
];

const NAV_ROUTES = {
  crawler: '#/admin/crawler',
  indexer: '#/admin/indexer',
  p2p:     '#/admin/network',
  trust:   '#/admin/trust',
  search:  '#/search',
};

let diagram = null;
let currentView = localStorage.getItem('doogle-node-view') || 'flow';
let lastData = { status: null, crawler: null, indexer: null };
let mobileBoxData = new Map();
const MOBILE_BP = 700;
let _mobileResizeHandler = null;

export function renderNode(container) {
  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <h2>Node Overview</h2>
        <p>Live system monitor — architecture &amp; metrics of your Doogle node</p>
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
      <canvas id="spotlight-canvas"></canvas>
    </div>
    <div id="mobile-cards-wrap" class="mobile-cards-grid" style="display:none"></div>
    <div id="spotlight-summary" class="spotlight-summary">
      <div class="loading">Loading node status...</div>
    </div>
  `;

  document.getElementById('view-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    const view = btn.dataset.view;
    if (view === currentView) return;
    currentView = view;
    localStorage.setItem('doogle-node-view', view);
    // Update active button
    document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    rebuildDiagram();
  });

  buildDiagram();
  _mobileResizeHandler = () => syncMobileView();
  window.addEventListener('resize', _mobileResizeHandler);
  syncMobileView();
  loadAllData();
  checkForUpdate();
  window._pageInterval = setInterval(loadAllData, 5000);
  window._pageCleanup = () => {
    if (diagram) { diagram.destroy(); diagram = null; }
    if (_mobileResizeHandler) { window.removeEventListener('resize', _mobileResizeHandler); _mobileResizeHandler = null; }
    mobileBoxData.clear();
  };
}

function syncMobileView() {
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
      if (lastData.status) applyData(lastData.status, lastData.crawler, lastData.indexer);
    }
  }
}

function buildDiagram() {
  const canvasEl = document.getElementById('spotlight-canvas');
  if (!canvasEl) return;

  const isGrid = currentView === 'grid';
  diagram = new SpotlightDiagram(canvasEl, {
    components: isGrid ? GRID_COMPONENTS : FLOW_COMPONENTS,
    connections: isGrid ? GRID_CONNECTIONS : FLOW_CONNECTIONS,
    navRoutes: NAV_ROUTES,
    layout: isGrid ? 'grid' : 'flow',
    cols: isGrid ? 4 : 3,
    rows: isGrid ? 2 : 5,
    boxW: isGrid ? 160 : 190,
    boxH: isGrid ? 105 : 110,
    minHeight: isGrid ? 500 : 560,
    maxHeight: isGrid ? 600 : 700,
    onTooltipExtra: (box, data) => {
      const s = data.status || {};
      const cr = data.crawler || {};
      const ix = data.indexer || {};
      const map = {
        p2p:     () => [`Uptime: ${s.uptime || '—'}`, `Addrs: ${(s.addrs || []).length}`],
        crawler: () => [`Rate limit: ${cr.rate_limit || '—'}`, `Errors: ${cr.total_errors || 0}`, `JS rendered: ${cr.js_rendered || 0}`, ...(cr.forwarded_tasks ? [`Forwarded: ${cr.forwarded_tasks}`] : []), ...(cr.received_from_peers ? [`From peers: ${cr.received_from_peers}`] : [])],
        indexer: () => [`Avg spam: ${(ix.avg_spam || 0).toFixed(2)}`, `Empty skipped: ${ix.empty_skipped || 0}`],
        trust:   () => [`Spam: ${ix.spam_rejected || 0}`, `Dupes: ${ix.duplicates_skipped || 0}`],
      };
      return (map[box.id] || (() => []))();
    },
  });
  diagram.start();
  // Re-apply last fetched data
  if (lastData.status || lastData.crawler || lastData.indexer) {
    applyData(lastData.status, lastData.crawler, lastData.indexer);
  }
}

function rebuildDiagram() {
  if (diagram) { diagram.destroy(); diagram = null; }
  buildDiagram();
}

async function loadAllData() {
  try {
    const [status, crawler, indexer] = await Promise.all([
      api.status().catch(() => null),
      api.crawlerStatus().catch(() => null),
      api.indexerStats().catch(() => null),
    ]);
    lastData = { status, crawler, indexer };
    applyData(status, crawler, indexer);
  } catch (err) {
    const el = document.getElementById('spotlight-summary');
    if (el) el.innerHTML = `<div class="empty-state">${icon('alertTriangle', 24, 'var(--red)')} Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

function applyData(status, crawler, indexer) {
  const s = status || {};
  const cr = crawler || {};
  const ix = indexer || {};

  if (diagram) diagram.setData({ status, crawler, indexer });

  const isGrid = currentView === 'grid';
  const activeW = cr.active_workers || 0;
  const totalW = cr.workers || 0;
  const totalCrawled = cr.total_crawled || s.crawled_urls || 0;
  const totalFailed = cr.total_failed || 0;
  const successRate = (totalCrawled + totalFailed) > 0 ? totalCrawled / (totalCrawled + totalFailed) : 1;
  const queueCount = s.urls_in_queue || 0;
  const spam = ix.spam_rejected || 0;
  const dupes = ix.duplicates_skipped || 0;
  const avgQ = ix.avg_quality || 0;
  const avgSpam = ix.avg_spam || 0;
  const totalIndexed = ix.total_indexed || s.indexed_docs || 0;
  const indexerIdle = totalIndexed === 0 && avgQ === 0;
  const indexerHealth = indexerIdle ? 'amber' : avgQ > 0.5 ? 'green' : avgQ > 0.3 ? 'amber' : 'red';

  // Build label lookup from whichever component set is active
  const comps = isGrid ? GRID_COMPONENTS : FLOW_COMPONENTS;
  const labelMap = {};
  for (const c of comps) labelMap[c.id] = c.label;

  // Helper: set data on diagram + track for mobile cards
  function setBox(id, data) {
    if (diagram) diagram.setBoxData(id, data);
    mobileBoxData.set(id, { id, label: labelMap[id] || id, ...data });
  }

  if (isGrid) {
    // ── Spotlight Gauges View ──
    setBox('p2p', {
      health: (s.connected_peers || 0) > 0 ? 'green' : 'red',
      gauges: [
        { type: 'counter', value: s.connected_peers || 0, label: 'connected peers', color: getCSS('--green') },
        { type: 'ring', value: s.connected_peers || 0, max: Math.max(10, s.connected_peers || 1), label: 'peer capacity', color: getCSS('--green') },
      ],
      metrics: [`Uptime: ${s.uptime || '—'}`, `ID: ${(s.peer_id || '').slice(0, 16)}...`],
    });
    setBox('trust', {
      health: spam > 100 ? 'amber' : 'green',
      gauges: [
        { type: 'bar', value: spam, max: Math.max(100, spam + dupes + 1), label: 'spam blocked', color: getCSS('--red') },
        { type: 'bar', value: dupes, max: Math.max(100, spam + dupes + 1), label: 'dupes skipped', color: getCSS('--amber') },
      ],
      metrics: [],
    });
    setBox('queue', {
      health: queueCount > 0 ? 'green' : 'amber',
      gauges: [
        { type: 'counter', value: queueCount, label: 'URLs waiting', color: getCSS('--accent') },
        { type: 'bar', value: queueCount, max: Math.max(50000, queueCount), label: 'queue depth', color: getCSS('--accent') },
        { type: 'bar', value: cr.seen_urls || 0, max: Math.max(100000, cr.seen_urls || 1), label: 'seen URLs', color: getCSS('--blue') },
      ],
      metrics: [],
    });
    setBox('crawler', {
      health: activeW > 0 ? 'green' : (totalW > 0 ? 'amber' : 'red'),
      gauges: [
        { type: 'ring', value: activeW, max: totalW, label: `${activeW}/${totalW} workers`, color: getCSS('--green') },
        { type: 'counter', value: totalCrawled, label: 'crawled', color: getCSS('--accent') },
        { type: 'ring', value: successRate, max: 1, label: 'success rate', color: successRate > 0.8 ? getCSS('--green') : getCSS('--red') },
      ],
      metrics: [`JS rendered: ${formatNum(cr.js_rendered || 0)}`],
    });
    setBox('indexer', {
      health: indexerHealth,
      gauges: [
        { type: 'ring', value: avgQ, max: 1, label: 'quality', color: getCSS('--green') },
        { type: 'ring', value: avgSpam, max: 1, label: 'spam score', color: getCSS('--red') },
      ],
      metrics: [`Indexed: ${formatNum(ix.total_indexed || s.indexed_docs || 0)}`],
    });
    setBox('search', {
      health: (s.indexed_docs || 0) > 0 ? 'green' : 'amber',
      gauges: [
        { type: 'counter', value: s.indexed_docs || 0, label: 'searchable docs', color: getCSS('--accent') },
      ],
      metrics: ['BM25 full-text', 'Fan-out to peers'],
    });
    setBox('storage', {
      health: 'green',
      gauges: [
        { type: 'cylinder', value: s.indexed_docs || 0, max: Math.max(5000, s.indexed_docs || 1), label: 'Bleve docs', color: getCSS('--green') },
        { type: 'cylinder', value: s.crawled_urls || 0, max: Math.max(5000, s.crawled_urls || 1), label: 'Badger URLs', color: getCSS('--blue') },
        { type: 'cylinder', value: queueCount, max: Math.max(50000, queueCount || 1), label: 'Queue store', color: getCSS('--accent') },
      ],
      metrics: [`Local: ${formatNum(s.local_docs || 0)} / Peer: ${formatNum(s.peer_docs || 0)}`],
    });
  } else {
    // ── Architecture Flow View (compact gauges + key metrics) ──
    const peers = s.connected_peers || 0;
    setBox('p2p', {
      health: peers > 0 ? 'green' : 'red',
      gauges: [{ type: 'ring', value: peers, max: Math.max(10, peers), label: 'peers', color: getCSS('--green') }],
      metrics: [`Uptime: ${s.uptime || '—'}`],
    });
    setBox('queue', {
      health: queueCount > 0 ? 'green' : 'amber',
      gauges: [{ type: 'counter', value: queueCount, label: 'queued', color: getCSS('--accent') }],
      metrics: [],
    });
    setBox('crawler', {
      health: activeW > 0 ? 'green' : (totalW > 0 ? 'amber' : 'red'),
      gauges: [{ type: 'ring', value: activeW, max: totalW, label: `${activeW}/${totalW}`, color: getCSS('--green') }],
      metrics: [`Crawled: ${formatNum(totalCrawled)}`, `JS: ${formatNum(cr.js_rendered || 0)}`],
    });
    setBox('trust', {
      health: spam > 100 ? 'amber' : 'green',
      gauges: [{ type: 'counter', value: spam, label: 'spam blocked', color: getCSS('--red') }],
      metrics: [`Dupes: ${formatNum(dupes)}`],
    });
    setBox('indexer', {
      health: indexerHealth,
      gauges: [{ type: 'ring', value: avgQ, max: 1, label: 'quality', color: getCSS('--green') }],
      metrics: [`Indexed: ${formatNum(ix.total_indexed || s.indexed_docs || 0)}`],
    });
    setBox('storage', {
      health: 'green',
      gauges: [{ type: 'counter', value: s.indexed_docs || 0, label: 'documents', color: getCSS('--blue') }],
      metrics: [`Local: ${formatNum(s.local_docs || 0)} / Peer: ${formatNum(s.peer_docs || 0)}`],
    });
    setBox('search', {
      health: (s.indexed_docs || 0) > 0 ? 'green' : 'amber',
      gauges: [{ type: 'counter', value: s.indexed_docs || 0, label: 'searchable', color: getCSS('--accent') }],
      metrics: [],
    });
  }

  if (diagram) diagram.setSpawnRate(Math.max(1, activeW));
  renderSummaryStrip(status, crawler, indexer);
  syncMobileView();
}

function renderSummaryStrip(status, crawler, indexer) {
  const el = document.getElementById('spotlight-summary');
  if (!el) return;
  const s = status || {};
  const cr = crawler || {};
  const ix = indexer || {};

  el.innerHTML = `
    <div class="spotlight-group">
      <span class="spotlight-group-label">This Node</span>
      <div class="spotlight-metrics-row">
        <div class="spotlight-metric">
          ${icon('globe', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(cr.total_crawled || s.crawled_urls || 0)}</span>
          <span class="spotlight-metric-label">My Crawls</span>
        </div>
        <div class="spotlight-metric">
          ${icon('fileText', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(s.local_docs || 0)}</span>
          <span class="spotlight-metric-label">My Docs</span>
        </div>
        <div class="spotlight-metric">
          ${icon('radio', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${s.connected_peers || 0}</span>
          <span class="spotlight-metric-label">Peers</span>
        </div>
        <div class="spotlight-metric">
          ${icon('monitor', 16, 'var(--text-muted)')}
          <span class="spotlight-metric-value" style="font-size:0.85em">${escapeHtml(s.uptime || '—')}</span>
          <span class="spotlight-metric-label">Uptime</span>
        </div>
      </div>
    </div>
    <div class="spotlight-metric-sep"></div>
    <div class="spotlight-group">
      <span class="spotlight-group-label">Index Total</span>
      <div class="spotlight-metrics-row">
        <div class="spotlight-metric">
          ${icon('users', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(s.peer_docs || 0)}</span>
          <span class="spotlight-metric-label">From Peers</span>
        </div>
        <div class="spotlight-metric">
          ${icon('search', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(s.indexed_docs || 0)}</span>
          <span class="spotlight-metric-label">Searchable</span>
        </div>
        <div class="spotlight-metric">
          ${icon('link', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(s.urls_in_queue || 0)}</span>
          <span class="spotlight-metric-label">Queue</span>
        </div>
        <div class="spotlight-metric">
          ${icon('shield', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(ix.spam_rejected || 0)}</span>
          <span class="spotlight-metric-label">Spam Blocked</span>
        </div>
      </div>
    </div>
    ${(s.forwarded_tasks || s.received_tasks) ? `
    <div class="spotlight-metric-sep"></div>
    <div class="spotlight-group">
      <span class="spotlight-group-label">Crawl Coordination</span>
      <div class="spotlight-metrics-row">
        <div class="spotlight-metric">
          ${icon('globe', 16, 'var(--accent)')}
          <span class="spotlight-metric-value">${formatNum(s.owned_domains || 0)}</span>
          <span class="spotlight-metric-label">My Domains</span>
        </div>
        <div class="spotlight-metric">
          ${icon('upload', 16, 'var(--amber)')}
          <span class="spotlight-metric-value">${formatNum(s.forwarded_tasks || 0)}</span>
          <span class="spotlight-metric-label">Forwarded</span>
        </div>
        <div class="spotlight-metric">
          ${icon('download', 16, 'var(--green)')}
          <span class="spotlight-metric-value">${formatNum(s.received_tasks || 0)}</span>
          <span class="spotlight-metric-label">Received</span>
        </div>
      </div>
    </div>
    ` : ''}
  `;
}

async function checkForUpdate() {
  try {
    const data = await api.checkUpdate();
    if (!data.update_available) return;

    // Remove any existing banner
    const existing = document.getElementById('update-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span class="update-banner-text">
        ${icon('arrowUp', 16)} New version available: <strong>${escapeHtml(data.current)}</strong> &rarr; <strong>${escapeHtml(data.latest)}</strong>
      </span>
      <button class="update-btn" id="update-now-btn">Update Now</button>
    `;

    const header = document.querySelector('.page-header');
    if (header) {
      header.parentNode.insertBefore(banner, header.nextSibling);
    }

    document.getElementById('update-now-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Updating...';
      banner.classList.remove('update-banner--error');

      try {
        const result = await api.applyUpdate();
        banner.className = 'update-banner update-banner--success';
        banner.innerHTML = `
          <span class="update-banner-text">
            ${icon('arrowUp', 16)} Updated to <strong>${escapeHtml(result.new_version)}</strong> &mdash; restart node to apply
          </span>
        `;
      } catch (err) {
        banner.className = 'update-banner update-banner--error';
        banner.innerHTML = `
          <span class="update-banner-text">
            ${icon('alertTriangle', 16)} Update failed: ${escapeHtml(err.message)}
          </span>
          <button class="update-btn" id="update-now-btn" onclick="location.reload()">Retry</button>
        `;
      }
    });
  } catch {
    // Silently ignore update check failures
  }
}
