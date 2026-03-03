// Doogle v2 — Indexer Dashboard (enhanced with document browser + detail modals)
import { api, peerNames } from '../api.js';
import { showModal, scoreBar, cardSkeleton, escapeHtml } from '../components.js';
import { formatNum } from '../spotlight.js';

let activeTab = 'overview';
let docOffset = 0;
const DOC_PAGE_SIZE = 20;
let currentPeerID = '';
let docPeerFilter = ''; // '' = all, 'local' = my docs, 'peers' = from peers

// ── Dashboard Helpers ──

const PEER_COLORS = [
  'var(--green)',   // local
  'var(--blue)',    // peer 1
  'var(--purple)',  // peer 2
  'var(--amber)',   // peer 3
  'var(--accent)',  // peer 4
  'var(--red)',     // peer 5
];

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

export function renderIndexer(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Indexer</h2>
      <p>Document indexing pipeline, quality scoring, and NLP analysis</p>
    </div>
    <div class="tabs" id="indexer-tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="documents">Documents</button>
      <button class="tab" data-tab="scoring">Scoring</button>
      <button class="tab" data-tab="pipeline">Pipeline</button>
    </div>
    <div id="indexer-content"></div>
  `;

  document.querySelectorAll('#indexer-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('#indexer-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTab();
    });
  });

  renderTab();
  window._pageInterval = setInterval(() => { if (activeTab === 'overview') renderTab(); }, 5000);
}

async function renderTab() {
  const content = document.getElementById('indexer-content');
  if (!content) return;

  if (activeTab === 'overview') await renderOverview(content);
  else if (activeTab === 'documents') await renderDocuments(content);
  else if (activeTab === 'scoring') renderScoring(content);
  else if (activeTab === 'pipeline') renderPipeline(content);
}

async function renderOverview(el) {
  try {
    const [status, indexer, leaderboard, domains] = await Promise.all([
      api.status(),
      api.indexerStats().catch(() => null),
      api.leaderboard().catch(() => null),
      api.domainOwnership().catch(() => null),
    ]);

    peerNames.update(status);

    // ── Derived values ──
    const indexedDocs = status.indexed_docs || 0;
    const localDocs = status.local_docs || 0;
    const peerDocs = status.peer_docs || 0;
    const totalIndexed = indexer?.total_indexed || 0;
    const avgQuality = indexer?.avg_quality || 0;
    const avgSpam = indexer?.avg_spam || 0;
    const rejected = indexer?.spam_rejected || 0;
    const duplicates = indexer?.duplicates_skipped || 0;
    const emptySkipped = indexer?.empty_skipped || 0;
    const totalFiltered = rejected + duplicates + emptySkipped;
    const acceptanceDenom = totalIndexed + totalFiltered;
    const acceptanceRate = acceptanceDenom > 0 ? totalIndexed / acceptanceDenom : 1;
    const upMins = parseUptimeMinutes(status.uptime);
    const docsPerMin = upMins > 0 ? (indexedDocs / upMins).toFixed(1) : '0';
    const localPct = indexedDocs > 0 ? localDocs / indexedDocs : 0;

    // Quality grade
    const qualGrade = avgQuality >= 0.8 ? 'A' : avgQuality >= 0.6 ? 'B' : avgQuality >= 0.4 ? 'C' : avgQuality >= 0.2 ? 'D' : 'F';

    // Domain data
    const totalDomains = domains?.total_domains || 0;
    const ownedDomains = domains?.owned_domains || 0;
    const ownershipPct = totalDomains > 0 ? ownedDomains / totalDomains : 0;

    // Network data
    const forwarded = status.forwarded_tasks || 0;
    const received = status.received_tasks || 0;
    const connectedPeers = status.connected_peers || 0;
    const totalTasks = forwarded + received;

    // ── Card 1: Index Overview (wide, span 2) ──
    const overviewHealth = indexedDocs > 0 ? 'green' : 'amber';
    const card1 = cardWrap('Index Overview', overviewHealth, `
      <div class="sl-body-row">
        <div>
          <div class="sl-big-num">${formatNum(indexedDocs)}</div>
          <div class="sl-big-label">indexed documents</div>
        </div>
        ${cssRing(localPct, 1, 'var(--green)', 'local content')}
      </div>
      <div class="sl-stat-row">
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(totalIndexed)}</span><span class="sl-stat-label">Processed</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(localDocs)}</span><span class="sl-stat-label">Local Docs</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(peerDocs)}</span><span class="sl-stat-label">Peer Docs</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${docsPerMin}</span><span class="sl-stat-label">Docs/min</span></div>
      </div>
    `, 'sl-card--wide');

    // ── Card 2: Document Quality ──
    const qualHealth = avgQuality >= 0.6 ? 'green' : avgQuality >= 0.3 ? 'amber' : 'red';
    const qualPct = Math.round(avgQuality * 100);
    const card2 = cardWrap('Document Quality', qualHealth, `
      <div class="sl-body-row">
        ${cssRing(avgQuality, 1, qualHealth === 'green' ? 'var(--green)' : qualHealth === 'amber' ? 'var(--amber)' : 'var(--red)', 'avg quality')}
        <div>
          <div class="sl-big-num">${qualPct}%</div>
          <div class="sl-big-label">quality score</div>
        </div>
      </div>
      <div class="sl-stat-row">
        <div class="sl-stat"><span class="sl-stat-value">${avgSpam > 0 ? avgSpam.toFixed(2) : '—'}</span><span class="sl-stat-label">Avg Spam</span></div>
        <div class="sl-stat"><span class="sl-stat-value">Grade ${qualGrade}</span><span class="sl-stat-label">Quality</span></div>
      </div>
    `);

    // ── Card 3: Content Sources (wide, span 2) — KEY CARD ──
    const explorers = leaderboard?.explorers || [];
    const hasLeaderboard = explorers.length > 0;
    const hasBothSources = localDocs > 0 && peerDocs > 0;
    const sourcesHealth = hasBothSources ? 'green' : (localDocs > 0 || peerDocs > 0) ? 'amber' : 'red';
    const totalSourceDocs = localDocs + peerDocs;

    let stackedBarHTML = '';
    let legendHTML = '';
    let contributorsCount = 0;

    if (hasLeaderboard && totalSourceDocs > 0) {
      // Build segments from leaderboard data
      const segments = [];
      // Local segment
      if (localDocs > 0) {
        segments.push({ label: 'Local', count: localDocs, color: PEER_COLORS[0] });
      }
      // Top 5 peers from leaderboard
      const peerExplorers = explorers.filter(e => e.peer_id !== status.peer_id).slice(0, 5);
      contributorsCount = peerExplorers.length + (localDocs > 0 ? 1 : 0);
      let accountedPeerDocs = 0;
      peerExplorers.forEach((exp, i) => {
        const count = exp.documents || exp.docs_contributed || 0;
        accountedPeerDocs += count;
        segments.push({
          label: peerNames.resolve(exp.peer_id),
          count,
          color: PEER_COLORS[(i + 1) % PEER_COLORS.length],
        });
      });
      // "Others" segment for unaccounted peer docs
      const otherDocs = Math.max(0, peerDocs - accountedPeerDocs);
      if (otherDocs > 0) {
        segments.push({ label: 'Others', count: otherDocs, color: 'var(--text-muted)' });
      }

      const barSegments = segments.map(s => {
        const pct = totalSourceDocs > 0 ? (s.count / totalSourceDocs * 100) : 0;
        return `<div class="sl-stacked-segment" style="width:${Math.max(pct, 1)}%;background:${s.color}" title="${escapeHtml(s.label)}: ${formatNum(s.count)}"></div>`;
      }).join('');

      const legendItems = segments.map(s =>
        `<span class="sl-stacked-legend-item"><span class="sl-stacked-dot" style="background:${s.color}"></span>${escapeHtml(s.label)} (${formatNum(s.count)})</span>`
      ).join('');

      stackedBarHTML = `<div class="sl-stacked-bar">${barSegments}</div>`;
      legendHTML = `<div class="sl-stacked-legend">${legendItems}</div>`;
    } else if (totalSourceDocs > 0) {
      // Fallback: simple 2-segment bar
      contributorsCount = (localDocs > 0 ? 1 : 0) + (peerDocs > 0 ? 1 : 0);
      const localPctBar = totalSourceDocs > 0 ? (localDocs / totalSourceDocs * 100) : 0;
      const peerPctBar = 100 - localPctBar;
      stackedBarHTML = `
        <div class="sl-stacked-bar">
          ${localDocs > 0 ? `<div class="sl-stacked-segment" style="width:${Math.max(localPctBar, 1)}%;background:var(--green)" title="Local: ${formatNum(localDocs)}"></div>` : ''}
          ${peerDocs > 0 ? `<div class="sl-stacked-segment" style="width:${Math.max(peerPctBar, 1)}%;background:var(--blue)" title="Peers: ${formatNum(peerDocs)}"></div>` : ''}
        </div>`;
      legendHTML = `
        <div class="sl-stacked-legend">
          <span class="sl-stacked-legend-item"><span class="sl-stacked-dot" style="background:var(--green)"></span>Local (${formatNum(localDocs)})</span>
          <span class="sl-stacked-legend-item"><span class="sl-stacked-dot" style="background:var(--blue)"></span>Peers (${formatNum(peerDocs)})</span>
        </div>`;
    }

    const card3 = cardWrap('Content Sources', sourcesHealth, `
      <div class="sl-big-num">${formatNum(totalSourceDocs)}</div>
      <div class="sl-big-label">total documents</div>
      ${stackedBarHTML}
      ${legendHTML}
      <div class="sl-stat-row">
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(localDocs)}</span><span class="sl-stat-label">Local</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(peerDocs)}</span><span class="sl-stat-label">From Peers</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${contributorsCount}</span><span class="sl-stat-label">Contributors</span></div>
      </div>
    `, 'sl-card--wide');

    // ── Card 4: Pipeline Health ──
    const acceptPct = Math.round(acceptanceRate * 100);
    const pipeHealth = acceptPct >= 70 ? 'green' : acceptPct >= 40 ? 'amber' : 'red';
    const card4 = cardWrap('Pipeline Health', pipeHealth, `
      <div class="sl-body-row">
        ${cssRing(acceptanceRate, 1, pipeHealth === 'green' ? 'var(--green)' : pipeHealth === 'amber' ? 'var(--amber)' : 'var(--red)', 'acceptance rate')}
        <div>
          <div class="sl-big-num">${formatNum(totalFiltered)}</div>
          <div class="sl-big-label">filtered out</div>
        </div>
      </div>
      <div class="sl-stat-row">
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(rejected)}</span><span class="sl-stat-label">Spam</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(duplicates)}</span><span class="sl-stat-label">Duplicates</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(emptySkipped)}</span><span class="sl-stat-label">Empty</span></div>
      </div>
    `);

    // ── Card 5: Domain Coverage ──
    const domainHealth = ownedDomains > 0 ? 'green' : totalDomains > 0 ? 'amber' : 'amber';
    const card5 = cardWrap('Domain Coverage', domainHealth, `
      <div class="sl-body-row">
        ${cssRing(ownershipPct, 1, 'var(--accent)', 'ownership')}
        <div>
          <div class="sl-big-num">${formatNum(ownedDomains)}</div>
          <div class="sl-big-label">owned domains</div>
        </div>
      </div>
      <div class="sl-stat-row">
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(totalDomains)}</span><span class="sl-stat-label">Total Domains</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${Math.round(ownershipPct * 100)}%</span><span class="sl-stat-label">Ownership</span></div>
      </div>
    `);

    // ── Card 6: Network Contribution ──
    const hasActivity = totalTasks > 0;
    const netHealth = connectedPeers > 0 && hasActivity ? 'green' : connectedPeers > 0 ? 'amber' : 'red';
    const card6 = cardWrap('Network Contribution', netHealth, `
      <div class="sl-body-row" style="gap:24px">
        <div style="text-align:center">
          <div class="sl-big-num">${formatNum(forwarded)}</div>
          <div class="sl-big-label">forwarded</div>
        </div>
        <div style="text-align:center">
          <div class="sl-big-num">${formatNum(received)}</div>
          <div class="sl-big-label">received</div>
        </div>
      </div>
      <div class="sl-stat-row">
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(connectedPeers)}</span><span class="sl-stat-label">Connected Peers</span></div>
        <div class="sl-stat"><span class="sl-stat-value">${formatNum(totalTasks)}</span><span class="sl-stat-label">Total Tasks</span></div>
      </div>
    `);

    el.innerHTML = `
      <div class="sl-dashboard">
        ${card1}${card2}${card3}${card4}${card5}${card6}
      </div>

      <div class="sl-pipeline-strip">
        <span class="badge badge-blue">Crawl</span>
        <span class="badge badge-default">Dedup</span>
        <span class="badge badge-purple">NLP</span>
        <span class="badge badge-amber">Score</span>
        <span class="badge badge-red">Spam</span>
        <span class="badge badge-green">Index</span>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load indexer stats: ${err.message}</p></div>`;
  }
}

async function renderDocuments(el) {
  // Fetch current peer ID for local detection
  try {
    const status = await api.status();
    currentPeerID = status.peer_id || '';
  } catch { /* ignore */ }

  el.innerHTML = `
    <div class="section">
      <h3>Search Indexed Documents</h3>
      <div class="form-row">
        <input type="text" id="doc-search-input" placeholder="Search indexed documents...">
        <button class="btn btn-primary" id="doc-search-btn">Search</button>
      </div>
    </div>
    <div class="section">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <h3 style="margin:0">Recent Documents</h3>
        <select id="doc-origin-filter" style="padding:4px 8px;font-size:0.85em;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input);color:var(--text-primary)">
          <option value="">All Documents</option>
          <option value="local">My Documents</option>
          <option value="peers">From Peers</option>
        </select>
      </div>
      <div id="doc-results">${cardSkeleton(3)}</div>
      <div id="doc-pagination" style="margin-top:12px;display:flex;gap:8px;align-items:center"></div>
    </div>
  `;

  document.getElementById('doc-search-btn').addEventListener('click', searchDocs);
  document.getElementById('doc-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchDocs();
  });
  document.getElementById('doc-origin-filter').addEventListener('change', e => {
    docPeerFilter = e.target.value;
    docOffset = 0;
    loadDocuments();
  });

  loadDocuments();
}

async function loadDocuments() {
  const results = document.getElementById('doc-results');
  const pagination = document.getElementById('doc-pagination');
  if (!results) return;

  try {
    // Determine peer filter for API call
    let peerParam = '';
    if (docPeerFilter === 'local' && currentPeerID) peerParam = currentPeerID;
    // 'peers' filter: we fetch all and filter client-side (no single peer to filter by)

    const data = await api.documents(docOffset, DOC_PAGE_SIZE, peerParam);
    let docs = data.documents || [];
    const total = data.total || 0;

    // Client-side filter for "From Peers" (exclude local)
    if (docPeerFilter === 'peers' && currentPeerID) {
      docs = docs.filter(d => d.origin_peer_id && d.origin_peer_id !== currentPeerID);
    }

    if (docs.length === 0) {
      results.innerHTML = '<div class="empty-state"><p>No documents indexed yet. Add seed URLs via the Crawler page.</p></div>';
      if (pagination) pagination.innerHTML = '';
      return;
    }

    results.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Domain</th>
              <th>Origin</th>
              <th>Quality</th>
              <th>Spam</th>
              <th>E-E-A-T</th>
              <th>Indexed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${docs.map(d => {
              const isLocal = !d.origin_peer_id || d.origin_peer_id === currentPeerID;
              const originBadge = isLocal
                ? '<span class="badge badge-green">local</span>'
                : `<span class="badge badge-blue" title="${escapeHtml(d.origin_peer_id || '')}">${escapeHtml(peerNames.resolve(d.origin_peer_id))}</span>`;
              return `
              <tr>
                <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.title || d.url).slice(0, 60)}</a>
                </td>
                <td class="mono" style="font-size:0.8em">${escapeHtml(d.domain)}</td>
                <td>${originBadge}</td>
                <td><span class="badge badge-${qualColor(d.quality_score)}">${(d.quality_score || 0).toFixed(2)}</span></td>
                <td><span class="badge badge-${d.spam_score > 0.3 ? 'red' : 'green'}">${(d.spam_score || 0).toFixed(2)}</span></td>
                <td>${(d.eeat_score || 0).toFixed(2)}</td>
                <td style="font-size:0.8em;color:var(--text-muted)">${d.indexed_at ? new Date(d.indexed_at).toLocaleString() : '—'}</td>
                <td><button class="badge badge-accent doc-detail-btn" data-id="${escapeHtml(d.id)}" style="cursor:pointer;border:none;font-family:inherit">details</button></td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Pagination
    const totalPages = Math.ceil(total / DOC_PAGE_SIZE);
    const currentPage = Math.floor(docOffset / DOC_PAGE_SIZE) + 1;
    if (pagination) {
      pagination.innerHTML = `
        <button class="btn" id="doc-prev" ${docOffset === 0 ? 'disabled' : ''}>Prev</button>
        <span style="color:var(--text-muted);font-size:0.9em">Page ${currentPage} of ${totalPages} (${total} docs)</span>
        <button class="btn" id="doc-next" ${docOffset + DOC_PAGE_SIZE >= total ? 'disabled' : ''}>Next</button>
      `;
      document.getElementById('doc-prev')?.addEventListener('click', () => {
        docOffset = Math.max(0, docOffset - DOC_PAGE_SIZE);
        loadDocuments();
      });
      document.getElementById('doc-next')?.addEventListener('click', () => {
        docOffset += DOC_PAGE_SIZE;
        loadDocuments();
      });
    }

    // Detail buttons
    results.querySelectorAll('.doc-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => showDocDetail(btn.dataset.id));
    });
  } catch (err) {
    results.innerHTML = `<div class="empty-state"><p>Failed to load documents: ${err.message}</p></div>`;
  }
}

async function searchDocs() {
  const q = document.getElementById('doc-search-input').value.trim();
  const results = document.getElementById('doc-results');
  const pagination = document.getElementById('doc-pagination');
  if (!q || !results) return;

  results.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Searching...</div>';
  if (pagination) pagination.innerHTML = '';

  try {
    const data = await api.search(q, 1, 50);
    if (!data.results || data.results.length === 0) {
      results.innerHTML = '<div class="empty-state"><p>No documents found</p></div>';
      return;
    }

    results.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Domain</th>
              <th>BM25</th>
              <th>Quality</th>
              <th>Spam</th>
              <th>E-E-A-T</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${data.results.map(r => `
              <tr>
                <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title || r.url).slice(0, 60)}</a>
                </td>
                <td class="mono" style="font-size:0.8em">${escapeHtml(r.domain)}</td>
                <td>${r.score.toFixed(2)}</td>
                <td><span class="badge badge-${qualColor(r.quality_score)}">${(r.quality_score || 0).toFixed(2)}</span></td>
                <td><span class="badge badge-${r.spam_score > 0.3 ? 'red' : 'green'}">${(r.spam_score || 0).toFixed(2)}</span></td>
                <td>${(r.eeat_score || 0).toFixed(2)}</td>
                <td><button class="badge badge-accent search-detail-btn" data-index="${data.results.indexOf(r)}" style="cursor:pointer;border:none;font-family:inherit">details</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="color:var(--text-muted);font-size:0.85em;margin-top:8px">${data.total} results in ${data.took_ms}ms</p>
    `;

    results.querySelectorAll('.search-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = data.results[parseInt(btn.dataset.index)];
        showSearchResultDetail(r);
      });
    });
  } catch (err) {
    results.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
  }
}

async function showDocDetail(id) {
  try {
    const doc = await api.document(id);

    const scoreRows = [
      ['E-E-A-T', doc.eeat_score, 'purple'],
      ['Quality', doc.quality_score, 'green'],
      ['Spam', doc.spam_score, 'red'],
      ['Link Score', doc.link_score, 'blue'],
      ['SEO Score', doc.seo_score, 'amber'],
      ['Readability', doc.readability_score, 'blue'],
      ['Citations', doc.citation_score, 'purple'],
      ['Freshness', doc.freshness_score, 'amber'],
      ['Author Credibility', doc.author_credibility, 'purple'],
      ['Relevance', doc.relevance_score, 'accent'],
    ].filter(([, v]) => v != null);

    const html = `
      <div class="detail-grid">
        <span class="detail-label">URL</span>
        <span class="detail-value"><a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">${escapeHtml(doc.url)}</a></span>
        <span class="detail-label">Title</span>
        <span class="detail-value">${escapeHtml(doc.title)}</span>
        <span class="detail-label">Domain</span>
        <span class="detail-value">${escapeHtml(doc.domain)}</span>
        <span class="detail-label">Description</span>
        <span class="detail-value">${escapeHtml(doc.description)}</span>
        <span class="detail-label">Language</span>
        <span class="detail-value">${escapeHtml(doc.language || 'unknown')}</span>
        <span class="detail-label">Categories</span>
        <span class="detail-value">${escapeHtml(doc.categories || 'none')}</span>
        <span class="detail-label">Keywords</span>
        <span class="detail-value" style="font-size:0.85em">${escapeHtml(doc.keywords || 'none')}</span>
        <span class="detail-label">Word Count</span>
        <span class="detail-value">${(doc.word_count || 0).toLocaleString()}</span>
        <span class="detail-label">Content Size</span>
        <span class="detail-value">${formatBytes(doc.content_size || 0)}</span>
        <span class="detail-label">Depth</span>
        <span class="detail-value">${doc.depth || 0}</span>
        <span class="detail-label">Crawled</span>
        <span class="detail-value">${doc.crawled_at ? new Date(doc.crawled_at).toLocaleString() : '—'}</span>
        <span class="detail-label">Indexed</span>
        <span class="detail-value">${doc.indexed_at ? new Date(doc.indexed_at).toLocaleString() : '—'}</span>
      </div>

      <div class="detail-section">
        <h4>Quality Scoring Breakdown</h4>
        ${scoreRows.map(([label, val, color]) => scoreBar(val || 0, color, label)).join('')}
      </div>

      <div class="detail-section">
        <h4>Content Flags</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
          ${doc.is_https ? '<span class="badge badge-green">HTTPS</span>' : '<span class="badge badge-amber">HTTP</span>'}
          ${doc.is_time_sensitive ? '<span class="badge badge-amber">Time-Sensitive</span>' : ''}
          ${doc.is_evergreen ? '<span class="badge badge-green">Evergreen</span>' : ''}
          ${doc.spam_score > 0.5 ? '<span class="badge badge-red">High Spam Risk</span>' : ''}
          ${doc.quality_score > 0.7 ? '<span class="badge badge-green">High Quality</span>' : ''}
          ${doc.eeat_score > 0.5 ? '<span class="badge badge-purple">Expert Content</span>' : ''}
        </div>
      </div>

      ${doc.content ? `
        <div class="detail-section">
          <h4>Content Preview</h4>
          <div style="max-height:200px;overflow-y:auto;padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.85em;line-height:1.6;color:var(--text-secondary)">${escapeHtml(doc.content.slice(0, 2000))}${doc.content.length > 2000 ? '...' : ''}</div>
        </div>
      ` : ''}
    `;

    showModal('Document Details', html, { width: '750px' });
  } catch (err) {
    showModal('Error', `<p>Failed to load document: ${err.message}</p>`);
  }
}

function showSearchResultDetail(r) {
  const scoreRows = [
    ['E-E-A-T', r.eeat_score, 'purple'],
    ['Quality', r.quality_score, 'green'],
    ['Spam', r.spam_score, 'red'],
    ['Link Score', r.link_score, 'blue'],
    ['SEO Score', r.seo_score, 'amber'],
    ['Readability', r.readability_score, 'blue'],
    ['Citations', r.citation_score, 'purple'],
    ['Freshness', r.freshness_score, 'amber'],
    ['Author Credibility', r.author_credibility, 'purple'],
    ['Relevance', r.relevance_score, 'accent'],
  ].filter(([, v]) => v != null && v !== undefined);

  const html = `
    <div class="detail-grid">
      <span class="detail-label">URL</span>
      <span class="detail-value"><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a></span>
      <span class="detail-label">Title</span>
      <span class="detail-value">${escapeHtml(r.title)}</span>
      <span class="detail-label">Domain</span>
      <span class="detail-value">${escapeHtml(r.domain)}</span>
      <span class="detail-label">BM25 Score</span>
      <span class="detail-value">${r.score.toFixed(4)}</span>
      ${r.peer_id ? `
        <span class="detail-label">Source Peer</span>
        <span class="detail-value">${escapeHtml(peerNames.resolve(r.peer_id))} <span style="font-family:monospace;font-size:0.8em;color:var(--text-muted)">${escapeHtml(r.peer_id.slice(0, 16))}…</span></span>
      ` : ''}
    </div>

    <div class="detail-section">
      <h4>Quality Scoring Breakdown</h4>
      ${scoreRows.map(([label, val, color]) => scoreBar(val || 0, color, label)).join('')}
    </div>
  `;

  showModal('Search Result Details', html, { width: '700px' });
}

function renderScoring(el) {
  el.innerHTML = `
    <div class="section">
      <h3>Scoring Signals</h3>
      <p style="color:var(--text-muted);font-size:0.9em;margin-bottom:16px">
        Every document is scored across 10 dimensions. The composite relevance score determines final ranking.
      </p>
      <div class="card-grid">
        ${scoreCard('E-E-A-T', 'Experience, Expertise, Authoritativeness, Trustworthiness. Weights: experience phrases, domain knowledge, content depth, HTTPS, trusted TLDs.', 'purple')}
        ${scoreCard('Quality', 'Content quality: title quality, word count, structure (headings), media richness, link quality, meta description, semantic density.', 'blue')}
        ${scoreCard('Spam', 'Spam detection: spam phrases, excessive caps/punctuation, thin content, link farms, keyword stuffing. Higher = more spam.', 'red')}
        ${scoreCard('Link Score', 'Link profile: moderate link count, mix of internal/external, absence of link farms.', 'green')}
        ${scoreCard('SEO Score', 'On-page SEO: title length (30-60 chars ideal), meta description (120-160 chars), heading structure, image alt text, canonical URL.', 'amber')}
        ${scoreCard('Readability', 'Flesch Reading Ease, sentence length, complex word ratio, vocabulary diversity.', 'accent')}
        ${scoreCard('Citations', 'URL references, bracket citations [1], parenthetical (Author, Year), reference section presence.', 'purple')}
        ${scoreCard('Freshness', 'Time-sensitive vs evergreen classification, exponential decay with content-specific half-life.', 'amber')}
        ${scoreCard('Author Credibility', 'Credentials (PhD, Dr.), affiliations (University, Institute), first-person authority markers.', 'purple')}
        ${scoreCard('Relevance', 'Composite score blending all signals with configurable weights.', 'accent')}
      </div>
    </div>

    <div class="section">
      <h3>Ranking Formula</h3>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;font-family:monospace;font-size:0.9em;color:var(--text-secondary);line-height:1.8">
        final = BM25 &times; qualityMultiplier &times; freshnessDecay &times; (1 - spamPenalty)<br><br>
        qualityMultiplier = 0.5 + (E-E-A-T&times;0.25 + Quality&times;0.25 + Readability&times;0.10<br>
        &nbsp;&nbsp;+ Citations&times;0.10 + LinkScore&times;0.10 + SEO&times;0.10<br>
        &nbsp;&nbsp;+ AuthorCredibility&times;0.05 + Relevance&times;0.05) &times; 1.5<br><br>
        freshnessDecay = e<sup>-&lambda;t</sup> where &lambda; = ln(2)/halfLife<br>
        &nbsp;&nbsp;halfLife: 30 days (news) | 120 days (standard) | 365 days (evergreen)<br><br>
        spamPenalty = min(0.8, spam_score) &mdash; capped to never fully zero out results
      </div>
    </div>
  `;
}

function renderPipeline(el) {
  el.innerHTML = `
    <div class="section">
      <h3>NLP Enrichment Pipeline</h3>
      <p style="color:var(--text-muted);font-size:0.9em;margin-bottom:16px">
        Every document passes through these analysis stages before indexing.
      </p>

      <div class="card-grid">
        ${pipelineStep('Duplicate Detection', 'Content fingerprinting via character 4-gram shingling + Jaccard similarity. Threshold: >80% overlap = near-duplicate. O(n) time.')}
        ${pipelineStep('Word Count', 'Tokenization and basic content length measurement for quality signals.')}
        ${pipelineStep('Language Detection', 'Character-set analysis (Cyrillic, CJK, Arabic) + keyword frequency for en, es, fr, de, it, pt, ru, zh, ja, ar.')}
        ${pipelineStep('Content Classification', 'TF-based categorization into: technology, science, business, health, politics, sports, entertainment, education, news.')}
        ${pipelineStep('Keyword Extraction', 'Position-weighted TF scoring — title words get 3x boost, first-paragraph words 2x. Stop-word filtered. Top 15 keywords.')}
        ${pipelineStep('Readability Analysis', 'Flesch Reading Ease, Flesch-Kincaid Grade Level, syllable counting via vowel-group heuristic, sentence boundary detection.')}
        ${pipelineStep('Citation Analysis', 'Counts URL references, bracket citations [1], parenthetical citations (Author, Year), and reference/bibliography sections.')}
        ${pipelineStep('Author Credibility', 'Detects academic credentials (PhD, Dr., Prof.), institutional affiliations, first-person authority, and about-page patterns.')}
        ${pipelineStep('Freshness Analysis', 'Date extraction from content, time-sensitive keyword detection (breaking, latest), evergreen classification, exponential decay scoring.')}
        ${pipelineStep('E-E-A-T Scoring', 'Composite of experience phrases, expertise markers, authoritativeness (HTTPS, trusted TLDs), trustworthiness signals.')}
        ${pipelineStep('Quality Scoring', 'Title quality, content depth, heading structure, media richness, link quality, meta description completeness.')}
        ${pipelineStep('Spam Detection', 'Spam phrase matching, excessive capitalization, excessive punctuation, thin content, link farming, keyword stuffing patterns.')}
      </div>
    </div>
  `;
}

function scoreCard(name, desc, color) {
  return `
    <div class="card card-sm">
      <div class="card-label"><span class="badge badge-${color}">${name}</span></div>
      <div class="card-sub" style="margin-top:8px">${desc}</div>
    </div>
  `;
}

function pipelineStep(name, desc) {
  return `
    <div class="card card-sm">
      <div class="card-label">${name}</div>
      <div class="card-sub">${desc}</div>
    </div>
  `;
}

function qualityBar(value, color) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return `
    <div class="score-bar" style="margin-top:8px">
      <div class="score-bar-fill">
        <div class="fill" style="width:${pct}%;background:var(--${color})"></div>
      </div>
      <span class="score-bar-label">${pct}%</span>
    </div>
  `;
}

function qualColor(score) {
  if (score >= 0.7) return 'green';
  if (score >= 0.4) return 'blue';
  return 'amber';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

