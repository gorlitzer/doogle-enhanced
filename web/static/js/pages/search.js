// Doogle v2 — Search Page (enhanced with detail modal + content warnings)
import { api } from '../api.js';
import { showModal, closeModal, scoreBar, escapeHtml, skeleton, icon } from '../components.js';

let currentPage = 1;
let currentQuery = '';
let lastQuery = '';
let lastResults = [];
let searchPeerID = ''; // local node peer ID, fetched once

function highlightTerms(escapedText, query) {
  if (!query) return escapedText;
  // Strip operator tokens to get bare content terms
  const stripped = query
    .replace(/(?:site|lang|intitle|inurl|intext|filetype|has|after|before):\S+/gi, '')
    .replace(/-\S+/g, '')
    .replace(/\bOR\b/gi, '')
    .replace(/"/g, '');
  const terms = stripped.split(/\s+/).filter(t => t.length >= 2);
  if (terms.length === 0) return escapedText;
  const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  return escapedText.replace(re, '<mark>$1</mark>');
}

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
    <div class="search-toolbar" id="search-toolbar">
      <div class="search-tips-toggle" id="search-tips-toggle">
        ${icon('zap', 14)} <span>Search operators</span>
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
        <select id="filter-peer">
          <option value="">All peers</option>
          <option value="local">My docs only</option>
        </select>
        <select id="filter-size">
          <option value="10">10 results</option>
          <option value="20">20 results</option>
          <option value="50">50 results</option>
        </select>
        <input type="text" id="filter-domain" placeholder="Filter by domain...">
      </div>
    </div>
    <div class="search-tips-body" id="search-tips-body">
      <div class="search-tips-grid">
        <code>"exact phrase"</code><span>Exact match</span>
        <code>-exclude</code><span>Remove term</span>
        <code>python OR ruby</code><span>Either term</span>
        <code>site:go.dev</code><span>Specific domain</span>
        <code>intitle:golang</code><span>Term in title</span>
        <code>filetype:pdf</code><span>File extension</span>
        <code>lang:en</code><span>Language filter</span>
        <code>after:2025-01</code><span>Date range</span>
      </div>
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

  // Search tips toggle
  const tipsToggle = document.getElementById('search-tips-toggle');
  const tipsBody = document.getElementById('search-tips-body');
  tipsToggle.addEventListener('click', () => {
    const open = tipsBody.classList.toggle('open');
    tipsToggle.classList.toggle('active', open);
  });

  if (currentQuery) {
    input.value = currentQuery;
    doSearch();
  }

  updateStatusBar();
  window._pageInterval = setInterval(updateStatusBar, 10000);
}

async function doSearch(keepPage = false) {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  currentQuery = q;
  if (!keepPage || q !== lastQuery) currentPage = 1;
  lastQuery = q;

  const size = parseInt(document.getElementById('filter-size').value) || 10;
  const domain = document.getElementById('filter-domain').value.trim();
  const results = document.getElementById('search-results');
  const meta = document.getElementById('search-meta');

  results.innerHTML = `<div style="padding:20px">${skeleton(6)}</div>`;
  meta.textContent = '';

  try {
    let query = q;
    const lang = document.getElementById('filter-lang').value;
    const peerFilter = document.getElementById('filter-peer').value;
    if (lang) query += ` lang:${lang}`;
    if (domain) query += ` site:${domain}`;
    if (peerFilter === 'local' && searchPeerID) query += ` peer:${searchPeerID}`;

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

    results.innerHTML = lastResults.map((r, i) => renderResult(r, i)).join('')
      + renderPagination(data.total, currentPage, size);

    // Bind click handlers for detail modal
    results.querySelectorAll('.result-detail-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const idx = parseInt(btn.dataset.index);
        showResultDetail(lastResults[idx]);
      });
    });

    // Bind report button handlers
    results.querySelectorAll('.result-report-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        showReportModal(btn.dataset.url);
      });
    });

    // Bind pagination handlers
    const prevBtn = results.querySelector('#pagination-prev');
    const nextBtn = results.querySelector('#pagination-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; doSearch(true); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; doSearch(true); });
  } catch (err) {
    results.innerHTML = `<div class="empty-state"><p>Search failed: ${err.message}</p></div>`;
  }
}

function renderResult(r, index) {
  const title = escapeHtml(r.title || r.url);
  const desc = highlightTerms(escapeHtml(r.description || ''), currentQuery);
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
  if (r.peer_name || r.peer_id) {
    const src = r.peer_name || r.peer_id.slice(0, 12) + '...';
    badges.push(`<span class="badge badge-blue">${escapeHtml(src)}</span>`);
  }
  if (r.origin_peer_id) {
    const isLocal = r.origin_peer_id === searchPeerID;
    if (isLocal) {
      badges.push('<span class="badge badge-green">local</span>');
    } else {
      const originLabel = r.origin_peer_name || r.origin_peer_id.slice(0, 12) + '...';
      badges.push(`<span class="badge badge-blue" title="${escapeHtml(r.origin_peer_id)}">origin: ${escapeHtml(originLabel)}</span>`);
    }
  }

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
        <button class="badge badge-red result-report-btn" data-url="${escapeHtml(r.url)}" style="cursor:pointer;border:none;font-family:inherit">${icon('flag', 12)} report</button>
      </div>
    </div>
  `;
}

function renderPagination(total, page, pageSize) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return '';
  return `
    <div class="pagination">
      <button class="pagination-btn" id="pagination-prev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="pagination-info">Page ${page} of ${totalPages}</span>
      <button class="pagination-btn" id="pagination-next" ${page >= totalPages ? 'disabled' : ''}>Next</button>
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
        <span class="detail-label">Source Node</span>
        <span class="detail-value">${r.peer_name ? escapeHtml(r.peer_name) + ' ' : ''}<span style="font-family:monospace;font-size:0.8em;color:var(--text-muted)">${escapeHtml(r.peer_id.slice(0, 20))}...</span></span>
      ` : ''}
      ${r.origin_peer_id ? `
        <span class="detail-label">Origin Peer</span>
        <span class="detail-value">${r.origin_peer_id === searchPeerID ? '<span class="badge badge-green">local</span>' : `${r.origin_peer_name ? escapeHtml(r.origin_peer_name) + ' ' : ''}<span style="font-family:monospace;font-size:0.8em;color:var(--text-muted)">${escapeHtml(r.origin_peer_id.slice(0, 20))}...</span>`}</span>
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

function showReportModal(url) {
  const html = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <label style="color:var(--text-muted);font-size:0.85em">URL</label>
      <input type="text" value="${escapeHtml(url)}" readonly style="padding:10px 12px;background:var(--bg-secondary);color:var(--text-muted);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.9em;font-family:var(--font-mono)">
      <label style="color:var(--text-muted);font-size:0.85em">Reason</label>
      <select id="modal-report-reason" style="padding:10px 12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.95em">
        <option value="">Select reason...</option>
        <option value="spam">Spam</option>
        <option value="malware">Malware</option>
        <option value="phishing">Phishing</option>
        <option value="illegal">Illegal Content</option>
        <option value="low_quality">Low Quality</option>
      </select>
      <label style="color:var(--text-muted);font-size:0.85em">Details (optional)</label>
      <textarea id="modal-report-detail" rows="3" placeholder="Additional details..." style="padding:10px 12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.95em;resize:vertical;font-family:inherit"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn" id="modal-report-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-report-submit">${icon('flag', 16)} Submit Report</button>
      </div>
      <div id="modal-report-result"></div>
    </div>
  `;

  showModal('Report URL', html, { width: '480px' });

  document.getElementById('modal-report-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-report-submit').addEventListener('click', async () => {
    const reason = document.getElementById('modal-report-reason').value;
    const detail = document.getElementById('modal-report-detail').value.trim();
    const result = document.getElementById('modal-report-result');

    if (!reason) {
      result.innerHTML = '<span class="badge badge-amber">Please select a reason</span>';
      return;
    }

    const btn = document.getElementById('modal-report-submit');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
      await api.report(url, reason, detail);
      result.innerHTML = '<span class="badge badge-green">Report submitted</span>';
      setTimeout(closeModal, 1200);
    } catch (err) {
      result.innerHTML = `<span class="badge badge-red">Error: ${err.message}</span>`;
      btn.disabled = false;
      btn.innerHTML = `${icon('flag', 16)} Submit Report`;
    }
  });
}

async function updateStatusBar() {
  try {
    const s = await api.status();
    if (!searchPeerID && s.peer_id) searchPeerID = s.peer_id;
    const nodeEl = document.getElementById('status-node');
    const peerEl = document.getElementById('status-peers');
    if (nodeEl) nodeEl.textContent = `Node: ${s.peer_id.slice(0, 12)}... | Indexed: ${s.indexed_docs} docs | Crawled: ${s.crawled_urls} URLs | Queue: ${s.urls_in_queue}`;
    if (peerEl) peerEl.textContent = `${s.connected_peers} peers | Uptime: ${s.uptime}`;
  } catch {
    const el = document.getElementById('status-node');
    if (el) el.textContent = 'Node: connecting...';
  }
}
