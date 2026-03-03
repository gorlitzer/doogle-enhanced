// Doogle v2 — Node Spotlight: Dual-View Monitoring Dashboard
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
let lastData = { status: null, crawler: null, indexer: null, profile: null, storage: null };
let mobileBoxData = new Map();
const MOBILE_BP = 700;
let _mobileResizeHandler = null;

export function renderNode(container) {
  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <h2>Node Spotlight</h2>
        <p>Live spotlight on your node — architecture &amp; metrics at a glance</p>
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
      if (lastData.status) applyData(lastData.status, lastData.crawler, lastData.indexer, lastData.profile, lastData.storage);
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
    applyData(lastData.status, lastData.crawler, lastData.indexer, lastData.profile, lastData.storage);
  }
}

function rebuildDiagram() {
  if (diagram) { diagram.destroy(); diagram = null; }
  buildDiagram();
}

async function loadAllData() {
  try {
    const [status, crawler, indexer, profile, storage] = await Promise.all([
      api.status().catch(() => null),
      api.crawlerStatus().catch(() => null),
      api.indexerStats().catch(() => null),
      api.profile().catch(() => null),
      api.storage().catch(() => null),
    ]);
    lastData = { status, crawler, indexer, profile, storage };
    applyData(status, crawler, indexer, profile, storage);
  } catch (err) {
    const el = document.getElementById('spotlight-summary');
    if (el) el.innerHTML = `<div class="empty-state">${icon('alertTriangle', 24, 'var(--red)')} Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

function applyData(status, crawler, indexer, profile, storage) {
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
  renderDashboard(status, crawler, indexer, profile, storage);
  syncMobileView();
}

// ── Dashboard Helpers ──

const ROLE_META = {
  Explorer:   { icon: '\u{1F9ED}', color: 'var(--accent)' },
  Curator:    { icon: '\u{1F3A8}', color: 'var(--purple)' },
  Sentinel:   { icon: '\u{1F6E1}', color: 'var(--red)' },
  Specialist: { icon: '\u{1F3AF}', color: 'var(--amber)' },
  Seeder:     { icon: '\u{1F331}', color: 'var(--green)' },
  Connector:  { icon: '\u{1F517}', color: 'var(--blue)' },
  Archivist:  { icon: '\u{1F4DA}', color: 'var(--amber)' },
  Builder:    { icon: '\u{1F6E0}', color: 'var(--text-muted)' },
};

function formatBytes(bytes) {
  if (bytes == null || bytes < 0) return 'N/A';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function healthDot(color) {
  return `<span class="sl-health sl-health--${color}"></span>`;
}

function cssRing(value, max, color, label, size = 64) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return `
    <div class="sl-ring-group">
      <div class="sl-ring" style="--value:${pct};--color:${color};--size:${size}px">
        <span class="sl-ring-value">${pct}%</span>
      </div>
      <div class="sl-ring-meta">
        <span class="sl-ring-pct">${pct}%</span>
        <span class="sl-ring-label">${escapeHtml(label)}</span>
      </div>
    </div>`;
}

function cardWrap(title, health, content, extra = '') {
  const hc = health === 'amber' ? 'sl-card--warning' : health === 'red' ? 'sl-card--critical' : '';
  return `
    <div class="sl-card ${extra} ${hc}">
      <div class="sl-card-header">
        ${healthDot(health)}
        <span class="sl-card-title">${escapeHtml(title)}</span>
      </div>
      ${content}
    </div>`;
}

function renderDashboard(status, crawler, indexer, profile, storage) {
  const el = document.getElementById('spotlight-summary');
  if (!el) return;
  const s = status || {};
  const cr = crawler || {};
  const ix = indexer || {};
  const prof = profile || {};
  const stor = storage || {};

  // ── Card 1: Node Identity (wide) ──
  const nodeName = s.node_name || 'Unnamed Node';
  const peerId = s.peer_id || '';
  const shortPeer = peerId.length > 16 ? peerId.slice(0, 8) + '...' + peerId.slice(-8) : peerId;
  const version = s.version || '—';
  const commit = s.commit ? s.commit.slice(0, 7) : '—';
  const fleetBadge = s.fleet_role ? `<span class="sl-fleet-badge">${escapeHtml(s.fleet_role)}</span>` : '';

  const card1 = cardWrap('Node Identity', 'green', `
    <div class="sl-body-row" style="flex-wrap:wrap;gap:8px">
      <span class="sl-node-name">${escapeHtml(nodeName)}</span>
      <span class="sl-version-badge">v${escapeHtml(version)}</span>
      ${fleetBadge}
    </div>
    <div class="sl-stat-row">
      <div class="sl-stat"><span class="sl-stat-value" title="${escapeHtml(peerId)}">${escapeHtml(shortPeer)}</span><span class="sl-stat-label">Peer ID</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${escapeHtml(s.uptime || '—')}</span><span class="sl-stat-label">Uptime</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${escapeHtml(commit)}</span><span class="sl-stat-label">Commit</span></div>
    </div>
  `, 'sl-card--wide');

  // ── Card 2: Network Health ──
  const peers = s.connected_peers || 0;
  const peerMax = Math.max(10, peers);
  const netHealth = peers >= 3 ? 'green' : peers >= 1 ? 'amber' : 'red';

  const card2 = cardWrap('Network Health', netHealth, `
    <div class="sl-body-row">
      ${cssRing(peers, peerMax, 'var(--green)', 'capacity')}
      <div>
        <div class="sl-big-num">${peers}</div>
        <div class="sl-big-label">connected peers</div>
      </div>
    </div>
    <div class="sl-stat-row">
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(s.forwarded_tasks || 0)}</span><span class="sl-stat-label">Forwarded</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(s.received_tasks || 0)}</span><span class="sl-stat-label">Received</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(s.owned_domains || 0)}</span><span class="sl-stat-label">Domains</span></div>
    </div>
  `);

  // ── Card 3: Crawler Performance ──
  const activeW = cr.active_workers || 0;
  const totalW = cr.workers || 0;
  const totalCrawled = cr.total_crawled || s.crawled_urls || 0;
  const totalFailed = cr.total_failed || 0;
  const successRate = (totalCrawled + totalFailed) > 0 ? totalCrawled / (totalCrawled + totalFailed) : 1;
  const crawlerHealth = activeW > 0 ? 'green' : (totalW > 0 ? 'amber' : 'red');

  const card3 = cardWrap('Crawler Performance', crawlerHealth, `
    <div class="sl-ring-row">
      ${cssRing(activeW, totalW || 1, 'var(--accent)', `${activeW}/${totalW} workers`)}
      ${cssRing(successRate, 1, successRate > 0.8 ? 'var(--green)' : 'var(--red)', 'success rate')}
    </div>
    <div class="sl-stat-row">
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(totalCrawled)}</span><span class="sl-stat-label">Crawled</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(cr.js_rendered || 0)}</span><span class="sl-stat-label">JS Rendered</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(cr.seen_urls || 0)}</span><span class="sl-stat-label">Seen URLs</span></div>
    </div>
  `);

  // ── Card 4: Index Quality ──
  const avgQ = ix.avg_quality || 0;
  const avgSpam = ix.avg_spam || 0;
  const totalIndexed = ix.total_indexed || s.indexed_docs || 0;
  const indexerIdle = totalIndexed === 0 && avgQ === 0;
  const indexHealth = indexerIdle ? 'amber' : avgQ > 0.5 ? 'green' : avgQ > 0.3 ? 'amber' : 'red';

  const card4 = cardWrap('Index Quality', indexHealth, `
    <div class="sl-ring-row">
      ${cssRing(avgQ, 1, 'var(--green)', 'quality')}
      ${cssRing(avgSpam, 1, 'var(--red)', 'spam score')}
    </div>
    <div class="sl-stat-row">
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(totalIndexed)}</span><span class="sl-stat-label">Indexed</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(ix.spam_rejected || 0)}</span><span class="sl-stat-label">Spam Rejected</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(ix.duplicates_skipped || 0)}</span><span class="sl-stat-label">Dupes Skipped</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(ix.empty_skipped || 0)}</span><span class="sl-stat-label">Empty Skipped</span></div>
    </div>
  `);

  // ── Card 5: Storage ──
  const totalBytes = stor.total_bytes || 0;
  const bleveBytes = stor.bleve_bytes || 0;
  const badgerBytes = stor.badger_bytes || 0;
  const otherBytes = stor.other_bytes || 0;
  const freeBytes = stor.free_bytes;
  const barTotal = bleveBytes + badgerBytes + otherBytes || 1;
  const blevePct = (bleveBytes / barTotal * 100).toFixed(1);
  const badgerPct = (badgerBytes / barTotal * 100).toFixed(1);
  const otherPct = Math.max(0, 100 - parseFloat(blevePct) - parseFloat(badgerPct)).toFixed(1);
  const freeGB = freeBytes != null && freeBytes >= 0 ? freeBytes / (1024 * 1024 * 1024) : -1;
  const storHealth = freeGB < 0 ? 'green' : freeGB > 5 ? 'green' : freeGB > 1 ? 'amber' : 'red';
  const freeLabel = freeGB < 0 ? 'N/A' : formatBytes(freeBytes);

  const card5 = cardWrap('Storage', storHealth, `
    <div class="sl-big-num">${formatBytes(totalBytes)}</div>
    <div class="sl-big-label">total data</div>
    <div class="sl-stacked-bar">
      <span style="width:${blevePct}%;background:var(--green)" title="Bleve: ${formatBytes(bleveBytes)}"></span>
      <span style="width:${badgerPct}%;background:var(--blue)" title="Badger: ${formatBytes(badgerBytes)}"></span>
      <span style="width:${otherPct}%;background:var(--text-muted)" title="Other: ${formatBytes(otherBytes)}"></span>
    </div>
    <div class="sl-stacked-legend">
      <span class="sl-stacked-legend-item"><span class="sl-stacked-legend-dot" style="background:var(--green)"></span>Bleve ${formatBytes(bleveBytes)}</span>
      <span class="sl-stacked-legend-item"><span class="sl-stacked-legend-dot" style="background:var(--blue)"></span>Badger ${formatBytes(badgerBytes)}</span>
      <span class="sl-stacked-legend-item"><span class="sl-stacked-legend-dot" style="background:var(--text-muted)"></span>Other ${formatBytes(otherBytes)}</span>
    </div>
    <div class="sl-stat-row">
      <div class="sl-stat"><span class="sl-stat-value">${freeLabel}</span><span class="sl-stat-label">Free Space</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(s.local_docs || 0)}</span><span class="sl-stat-label">Local Docs</span></div>
      <div class="sl-stat"><span class="sl-stat-value">${formatNum(s.peer_docs || 0)}</span><span class="sl-stat-label">Peer Docs</span></div>
    </div>
  `);

  // ── Card 6: Master Profile ──
  const affinities = prof.role_affinities || {};
  const sortedRoles = Object.entries(affinities).sort((a, b) => b[1] - a[1]);
  const topRole = sortedRoles.length > 0 && sortedRoles[0][1] > 0 ? sortedRoles[0] : null;
  const interestCount = Object.keys(prof.interests || {}).length;
  const searchCount = Object.keys(prof.search_topics || {}).length;
  const reportsMade = prof.reports_made || 0;
  const hasData = topRole || interestCount > 0;
  const profileHealth = topRole ? 'green' : hasData ? 'amber' : 'red';

  let profileBody;
  if (!hasData) {
    profileBody = `<div class="sl-empty-state">Complete the Setup Wizard to start building your profile</div>`;
  } else {
    const rm = topRole ? ROLE_META[topRole[0]] || { icon: '\u{2B50}', color: 'var(--accent)' } : null;
    const topRoleHtml = topRole ? `
      <div class="sl-top-role">
        <span class="sl-top-role-icon">${rm.icon}</span>
        <span class="sl-top-role-name">${escapeHtml(topRole[0])}</span>
        <span class="sl-top-role-pct">${Math.round(topRole[1] * 100)}%</span>
      </div>` : '';

    const top4 = sortedRoles.slice(0, 4);
    const barsHtml = top4.map(([role, val]) => {
      const meta = ROLE_META[role] || { icon: '\u{2B50}', color: 'var(--accent)' };
      const pct = Math.round(val * 100);
      return `
        <div class="sl-affinity-bar">
          <span class="sl-affinity-bar-label">${escapeHtml(role)}</span>
          <div class="sl-affinity-bar-track">
            <div class="sl-affinity-bar-fill" style="width:${pct}%;background:${meta.color}"></div>
          </div>
          <span class="sl-affinity-bar-pct">${pct}%</span>
        </div>`;
    }).join('');

    profileBody = `
      ${topRoleHtml}
      <div class="sl-affinity-list">${barsHtml}</div>
      <div class="sl-stat-row">
        <div class="sl-stat"><span class="sl-stat-value">${interestCount}</span><span class="sl-stat-label">Interests</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${searchCount}</span><span class="sl-stat-label">Topics</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${reportsMade}</span><span class="sl-stat-label">Reports</span></div>
      </div>`;
  }
  profileBody += `<a href="#/admin/profile" class="sl-profile-link">View full profile &rarr;</a>`;

  const card6 = cardWrap('Master Profile', profileHealth, profileBody);

  // Assemble dashboard
  el.className = 'sl-dashboard';
  el.innerHTML = card1 + card2 + card3 + card4 + card5 + card6;
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
