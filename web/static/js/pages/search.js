// Doogle v2 — Search Page (enhanced with detail modal + content warnings)
import { api } from '../api.js';
import { showModal, scoreBar, escapeHtml, skeleton } from '../components.js';

let currentPage = 1;
let currentQuery = '';
let lastResults = [];

export function renderSearch(container) {
  container.innerHTML = `
    <div class="search-hero">
      <h1>DOOGLE</h1>
      <p>Decentralized P2P Search Engine</p>
    </div>
    <div class="search-form" id="search-form">
      <input type="text" id="search-input" placeholder="Search the decentralized web..." autofocus>
      <button id="search-btn">Search</button>
    </div>
    <div class="search-filters" id="search-filters">
      <select id="filter-lang">
        <option value="">Language: All</option>
        <option value="en">English</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="it">Italian</option>
        <option value="pt">Portuguese</option>
        <option value="ru">Russian</option>
        <option value="zh">Chinese</option>
        <option value="ja">Japanese</option>
      </select>
      <select id="filter-size">
        <option value="10">10 results</option>
        <option value="20">20 results</option>
        <option value="50">50 results</option>
      </select>
      <input type="text" id="filter-domain" placeholder="Filter by domain..." style="width:180px">
    </div>
    <div class="search-meta" id="search-meta"></div>
    <div class="search-results" id="search-results"></div>
    <div class="status-bar">
      <span id="status-node">Loading...</span>
      <span id="status-peers"></span>
    </div>
  `;

  const input = document.getElementById('search-input');
  const btn = document.getElementById('search-btn');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  btn.addEventListener('click', doSearch);

  if (currentQuery) {
    input.value = currentQuery;
    doSearch();
  }

  updateStatusBar();
  window._pageInterval = setInterval(updateStatusBar, 10000);
}

async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  currentQuery = q;

  const size = parseInt(document.getElementById('filter-size').value) || 10;
  const domain = document.getElementById('filter-domain').value.trim();
  const results = document.getElementById('search-results');
  const meta = document.getElementById('search-meta');

  results.innerHTML = `<div style="padding:20px">${skeleton(6)}</div>`;
  meta.textContent = '';

  try {
    let query = q;
    if (domain) query += ` domain:${domain}`;

    const data = await api.search(query, currentPage, size);
    if (data.error) {
      results.innerHTML = `<div class="empty-state"><p>${data.error}</p></div>`;
      return;
    }

    meta.textContent = `${data.total} results in ${data.took_ms}ms` +
      (data.peers_asked ? ` (queried ${data.peers_asked} peers)` : ' (local only)');

    lastResults = data.results || [];

    if (lastResults.length === 0) {
      results.innerHTML = '<div class="empty-state"><p>No results found. Try a different query or add seed URLs via Admin.</p></div>';
      return;
    }

    results.innerHTML = lastResults.map((r, i) => renderResult(r, i)).join('');

    // Bind click handlers for detail modal
    results.querySelectorAll('.result-detail-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const idx = parseInt(btn.dataset.index);
        showResultDetail(lastResults[idx]);
      });
    });
  } catch (err) {
    results.innerHTML = `<div class="empty-state"><p>Search failed: ${err.message}</p></div>`;
  }
}

function renderResult(r, index) {
  const title = escapeHtml(r.title || r.url);
  const desc = escapeHtml(r.description || '');
  const domain = escapeHtml(r.domain || '');
  const scoreColor = r.score > 1.0 ? 'green' : r.score > 0.5 ? 'blue' : 'default';

  const badges = [];
  badges.push(`<span class="badge badge-default">${domain}</span>`);
  badges.push(`<span class="badge badge-${scoreColor}">score: ${r.score.toFixed(2)}</span>`);

  if (r.quality_score > 0) badges.push(`<span class="badge badge-${qualColor(r.quality_score)}">quality: ${r.quality_score.toFixed(2)}</span>`);
  if (r.eeat_score > 0.3) badges.push(`<span class="badge badge-purple">E-E-A-T: ${r.eeat_score.toFixed(2)}</span>`);
  if (r.readability_score > 0.6) badges.push(`<span class="badge badge-blue">readable</span>`);
  if (r.citation_score > 0.3) badges.push(`<span class="badge badge-purple">cited</span>`);
  if (r.is_time_sensitive) badges.push('<span class="badge badge-amber">time-sensitive</span>');
  if (r.is_evergreen) badges.push('<span class="badge badge-green">evergreen</span>');
  if (r.peer_id) badges.push(`<span class="badge badge-blue">peer: ${r.peer_id.slice(0, 8)}</span>`);

  const spamWarning = r.spam_score > 0.3
    ? `<div class="content-warning">Low trust score (spam: ${r.spam_score.toFixed(2)}) — content may be unreliable</div>`
    : '';

  return `
    <div class="result-item">
      <a class="result-title" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${title}</a>
      <div class="result-url">${escapeHtml(r.url)}</div>
      <div class="result-desc">${desc}</div>
      ${spamWarning}
      <div class="result-badges">
        ${badges.join('')}
        <button class="badge badge-accent result-detail-btn" data-index="${index}" style="cursor:pointer;border:none;font-family:inherit">details</button>
      </div>
    </div>
  `;
}

function showResultDetail(r) {
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
    ['Relevance (composite)', r.relevance_score, 'accent'],
  ].filter(([, v]) => v != null && v !== undefined);

  const crawledAt = r.crawled_at ? new Date(r.crawled_at).toLocaleString() : 'Unknown';

  const html = `
    <div class="detail-grid">
      <span class="detail-label">URL</span>
      <span class="detail-value"><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a></span>
      <span class="detail-label">Title</span>
      <span class="detail-value">${escapeHtml(r.title)}</span>
      <span class="detail-label">Domain</span>
      <span class="detail-value">${escapeHtml(r.domain)}</span>
      <span class="detail-label">Description</span>
      <span class="detail-value">${escapeHtml(r.description)}</span>
      <span class="detail-label">Crawled</span>
      <span class="detail-value">${crawledAt}</span>
      <span class="detail-label">BM25 Score</span>
      <span class="detail-value">${r.score.toFixed(4)}</span>
      ${r.peer_id ? `
        <span class="detail-label">Source Peer</span>
        <span class="detail-value" style="font-family:monospace;font-size:0.85em">${escapeHtml(r.peer_id)}</span>
      ` : ''}
    </div>

    <div class="detail-section">
      <h4>Quality Scoring Breakdown</h4>
      ${scoreRows.map(([label, val, color]) =>
        scoreBar(val || 0, color, label)
      ).join('')}
    </div>

    <div class="detail-section">
      <h4>Content Flags</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        ${r.is_time_sensitive ? '<span class="badge badge-amber">Time-Sensitive Content</span>' : ''}
        ${r.is_evergreen ? '<span class="badge badge-green">Evergreen Content</span>' : ''}
        ${r.spam_score > 0.5 ? '<span class="badge badge-red">High Spam Risk</span>' : ''}
        ${r.spam_score > 0.3 && r.spam_score <= 0.5 ? '<span class="badge badge-amber">Moderate Spam Risk</span>' : ''}
        ${r.quality_score > 0.7 ? '<span class="badge badge-green">High Quality</span>' : ''}
        ${r.eeat_score > 0.5 ? '<span class="badge badge-purple">Expert Content</span>' : ''}
        ${r.citation_score > 0.3 ? '<span class="badge badge-blue">Well-Cited</span>' : ''}
        ${r.readability_score > 0.7 ? '<span class="badge badge-blue">Highly Readable</span>' : ''}
      </div>
    </div>
  `;

  showModal('Document Details', html, { width: '700px' });
}

function qualColor(score) {
  if (score >= 0.7) return 'green';
  if (score >= 0.4) return 'blue';
  return 'amber';
}

async function updateStatusBar() {
  try {
    const s = await api.status();
    const nodeEl = document.getElementById('status-node');
    const peerEl = document.getElementById('status-peers');
    if (nodeEl) nodeEl.textContent = `Node: ${s.peer_id.slice(0, 12)}... | Indexed: ${s.indexed_docs} docs | Crawled: ${s.crawled_urls} URLs | Queue: ${s.urls_in_queue}`;
    if (peerEl) peerEl.textContent = `${s.connected_peers} peers | Uptime: ${s.uptime}`;
  } catch {
    const el = document.getElementById('status-node');
    if (el) el.textContent = 'Node: connecting...';
  }
}
