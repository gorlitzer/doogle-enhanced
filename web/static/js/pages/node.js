// Doogle v2 — Node Overview: Dual-View Monitoring Dashboard
// Toggle between Spotlight gauge columns and Architecture flow diagram
import { api } from '../api.js';
import { icon, getCSS, escapeHtml } from '../components.js';
import { SpotlightDiagram, formatNum } from '../spotlight.js';

// ── Spotlight Grid Config (gauge columns) ──
const GRID_COMPONENTS = [
  { id: 'p2p',      label: 'P2P Network',    col: 0, row: 0, boxH: 200 },
  { id: 'trust',    label: 'Trust & Safety',  col: 0, row: 1, boxH: 140 },
  { id: 'queue',    label: 'URL Queue',       col: 1, row: 0, boxH: 180 },
  { id: 'crawler',  label: 'Crawler',          col: 1, row: 1, boxH: 180 },
  { id: 'indexer',  label: 'Indexer',          col: 2, row: 0, boxH: 200 },
  { id: 'search',   label: 'Search Engine',   col: 2, row: 1, boxH: 140 },
  { id: 'storage',  label: 'Storage',          col: 3, row: 0, boxH: 340 },
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
  { id: 'crawler',  label: 'Crawler',          col: 1, row: 2 },
  { id: 'trust',    label: 'Trust & Safety',  col: 2, row: 2 },
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
    <div class="spotlight-canvas-wrap">
      <canvas id="spotlight-canvas"></canvas>
    </div>
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
  loadAllData();
  window._pageInterval = setInterval(loadAllData, 5000);
  window._pageCleanup = () => { if (diagram) { diagram.destroy(); diagram = null; } };
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
    boxW: isGrid ? 190 : 180,
    boxH: isGrid ? 130 : 90,
    minHeight: isGrid ? 500 : 560,
    maxHeight: isGrid ? 600 : 700,
    onTooltipExtra: (box, data) => {
      const s = data.status || {};
      const cr = data.crawler || {};
      const ix = data.indexer || {};
      const map = {
        p2p:     () => [`Uptime: ${s.uptime || '—'}`, `Addrs: ${(s.addrs || []).length}`],
        crawler: () => [`Rate limit: ${cr.rate_limit || '—'}`, `Errors: ${cr.total_errors || 0}`],
        indexer: () => [`Avg spam: ${(ix.avg_spam || 0).toFixed(2)}`, `Lang: ${ix.top_language || '—'}`],
        trust:   () => [`Robots blocked: ${ix.robots_blocked || 0}`],
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
  if (!diagram) return;
  const s = status || {};
  const cr = crawler || {};
  const ix = indexer || {};

  diagram.setData({ status, crawler, indexer });

  const isGrid = currentView === 'grid';
  const activeW = cr.active_workers || 0;
  const totalW = cr.workers || cr.total_workers || 4;
  const totalCrawled = cr.total_crawled || s.crawled_urls || 0;
  const totalFailed = cr.total_failed || 0;
  const successRate = (totalCrawled + totalFailed) > 0 ? totalCrawled / (totalCrawled + totalFailed) : 1;
  const queueCount = s.urls_in_queue || 0;
  const spam = ix.spam_rejected || 0;
  const dupes = ix.duplicates_skipped || 0;
  const avgQ = ix.avg_quality || ix.average_quality || 0;
  const avgSpam = ix.avg_spam || 0;

  if (isGrid) {
    // ── Spotlight Gauges View ──
    diagram.setBoxData('p2p', {
      health: (s.connected_peers || 0) > 0 ? 'green' : 'red',
      gauges: [
        { type: 'counter', value: s.connected_peers || 0, label: 'connected peers', color: getCSS('--green') },
        { type: 'ring', value: s.connected_peers || 0, max: Math.max(10, s.connected_peers || 1), label: 'peer capacity', color: getCSS('--green') },
      ],
      metrics: [`Uptime: ${s.uptime || '—'}`, `ID: ${(s.peer_id || '').slice(0, 16)}...`],
    });
    diagram.setBoxData('trust', {
      health: spam > 100 ? 'amber' : 'green',
      gauges: [
        { type: 'bar', value: spam, max: Math.max(100, spam + dupes + 1), label: 'spam blocked', color: getCSS('--red') },
        { type: 'bar', value: dupes, max: Math.max(100, spam + dupes + 1), label: 'dupes skipped', color: getCSS('--amber') },
      ],
      metrics: [],
    });
    diagram.setBoxData('queue', {
      health: queueCount > 0 ? 'green' : 'amber',
      gauges: [
        { type: 'counter', value: queueCount, label: 'URLs waiting', color: getCSS('--accent') },
        { type: 'bar', value: queueCount, max: Math.max(50000, queueCount), label: 'queue depth', color: getCSS('--accent') },
        { type: 'bar', value: cr.seen_urls || 0, max: Math.max(100000, cr.seen_urls || 1), label: 'seen URLs', color: getCSS('--blue') },
      ],
      metrics: [],
    });
    diagram.setBoxData('crawler', {
      health: activeW > 0 ? 'green' : (totalW > 0 ? 'amber' : 'red'),
      gauges: [
        { type: 'ring', value: activeW, max: totalW, label: `${activeW}/${totalW} workers`, color: getCSS('--green') },
        { type: 'counter', value: totalCrawled, label: 'crawled', color: getCSS('--accent') },
        { type: 'ring', value: successRate, max: 1, label: 'success rate', color: successRate > 0.8 ? getCSS('--green') : getCSS('--red') },
      ],
      metrics: [],
    });
    diagram.setBoxData('indexer', {
      health: avgQ > 0.5 ? 'green' : avgQ > 0.3 ? 'amber' : 'red',
      gauges: [
        { type: 'ring', value: avgQ, max: 1, label: 'quality', color: getCSS('--green') },
        { type: 'ring', value: avgSpam, max: 1, label: 'spam score', color: getCSS('--red') },
      ],
      metrics: [`Indexed: ${formatNum(ix.total_indexed || s.indexed_docs || 0)}`],
    });
    diagram.setBoxData('search', {
      health: (s.indexed_docs || 0) > 0 ? 'green' : 'amber',
      gauges: [
        { type: 'counter', value: s.indexed_docs || 0, label: 'searchable docs', color: getCSS('--accent') },
      ],
      metrics: ['BM25 full-text', 'Fan-out to peers'],
    });
    diagram.setBoxData('storage', {
      health: 'green',
      gauges: [
        { type: 'cylinder', value: s.indexed_docs || 0, max: Math.max(5000, s.indexed_docs || 1), label: 'Bleve docs', color: getCSS('--green') },
        { type: 'cylinder', value: s.crawled_urls || 0, max: Math.max(5000, s.crawled_urls || 1), label: 'Badger URLs', color: getCSS('--blue') },
        { type: 'cylinder', value: queueCount, max: Math.max(50000, queueCount || 1), label: 'Queue store', color: getCSS('--accent') },
      ],
      metrics: [],
    });
  } else {
    // ── Architecture Flow View (text metrics, no gauges) ──
    diagram.setBoxData('p2p', {
      health: (s.connected_peers || 0) > 0 ? 'green' : 'red',
      gauges: [],
      metrics: [`Peers: ${s.connected_peers || 0}`, `ID: ${(s.peer_id || '').slice(0, 16)}...`],
    });
    diagram.setBoxData('queue', {
      health: queueCount > 0 ? 'green' : 'amber',
      gauges: [],
      metrics: [`Queued: ${formatNum(queueCount)}`],
    });
    diagram.setBoxData('crawler', {
      health: activeW > 0 ? 'green' : (totalW > 0 ? 'amber' : 'red'),
      gauges: [],
      metrics: [`Workers: ${activeW}/${totalW}`, `Crawled: ${formatNum(totalCrawled)}`],
    });
    diagram.setBoxData('trust', {
      health: spam > 100 ? 'amber' : 'green',
      gauges: [],
      metrics: [`Spam blocked: ${formatNum(spam)}`, `Dupes skipped: ${formatNum(dupes)}`],
    });
    diagram.setBoxData('indexer', {
      health: avgQ > 0.5 ? 'green' : avgQ > 0.3 ? 'amber' : 'red',
      gauges: [],
      metrics: [`Indexed: ${formatNum(ix.total_indexed || s.indexed_docs || 0)}`, `Quality: ${avgQ.toFixed(2)}`],
    });
    diagram.setBoxData('storage', {
      health: 'green',
      gauges: [],
      metrics: [`Docs: ${formatNum(s.indexed_docs || 0)}`, `URLs: ${formatNum(s.crawled_urls || 0)}`],
    });
    diagram.setBoxData('search', {
      health: (s.indexed_docs || 0) > 0 ? 'green' : 'amber',
      gauges: [],
      metrics: [`Searchable: ${formatNum(s.indexed_docs || 0)}`],
    });
  }

  diagram.setSpawnRate(Math.max(1, activeW));
  renderSummaryStrip(status, crawler, indexer);
}

function renderSummaryStrip(status, crawler, indexer) {
  const el = document.getElementById('spotlight-summary');
  if (!el) return;
  const s = status || {};
  const cr = crawler || {};
  const ix = indexer || {};

  el.innerHTML = `
    <div class="spotlight-metric">
      ${icon('radio', 16, 'var(--accent)')}
      <span class="spotlight-metric-value">${s.connected_peers || 0}</span>
      <span class="spotlight-metric-label">Peers</span>
    </div>
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
      <span class="spotlight-metric-value">${formatNum(ix.total_indexed || s.indexed_docs || 0)}</span>
      <span class="spotlight-metric-label">Indexed</span>
    </div>
    <div class="spotlight-metric">
      ${icon('search', 16, 'var(--accent)')}
      <span class="spotlight-metric-value">${formatNum(s.indexed_docs || 0)}</span>
      <span class="spotlight-metric-label">Searchable</span>
    </div>
    <div class="spotlight-metric">
      ${icon('shield', 16, 'var(--accent)')}
      <span class="spotlight-metric-value">${formatNum(ix.spam_rejected || 0)}</span>
      <span class="spotlight-metric-label">Spam Blocked</span>
    </div>
    <div class="spotlight-metric">
      ${icon('monitor', 16, 'var(--text-muted)')}
      <span class="spotlight-metric-value" style="font-size:0.85em">${escapeHtml(s.uptime || '—')}</span>
      <span class="spotlight-metric-label">Uptime</span>
    </div>
  `;
}
