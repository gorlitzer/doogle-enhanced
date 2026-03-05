// Doogle v2 — Search Page (enhanced with detail modal + content warnings)
import { api } from '../api.js';
import { showModal, closeModal, escapeHtml, icon, timeAgo } from '../components.js';

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

  results.innerHTML = Array.from({ length: 3 }, () => `
    <div class="result-card result-card-skeleton">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div class="skeleton" style="width:16px;height:16px;border-radius:50%"></div>
        <div class="skeleton" style="width:100px;height:12px"></div>
      </div>
      <div class="skeleton" style="width:70%;height:16px;margin-bottom:8px"></div>
      <div class="skeleton" style="width:50%;height:11px;margin-bottom:10px"></div>
      <div class="skeleton" style="width:100%;height:12px;margin-bottom:6px"></div>
      <div class="skeleton" style="width:85%;height:12px;margin-bottom:12px"></div>
      <div style="display:flex;gap:6px">
        <div class="skeleton" style="width:60px;height:18px;border-radius:10px"></div>
        <div class="skeleton" style="width:50px;height:18px;border-radius:10px"></div>
      </div>
    </div>
  `).join('');
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

    // Search meta line with mode and intent badges
    let metaText = `${data.total} results in ${data.took_ms}ms`;
    if (data.peers_asked) metaText += ` (queried ${data.peers_asked} peers)`;
    else metaText += ' (local only)';
    let metaHtml = escapeHtml(metaText);
    if (data.search_mode) metaHtml += ` <span class="badge badge-blue">${escapeHtml(data.search_mode)}</span>`;
    if (data.intent) metaHtml += ` <span class="badge badge-purple">${escapeHtml(data.intent)}</span>`;
    meta.innerHTML = metaHtml;

    lastResults = data.results || [];

    if (lastResults.length === 0) {
      results.innerHTML = '<div class="empty-state"><p>No results found. Try a different query or add seed URLs via Admin.</p></div>';
      return;
    }

    // Render suggestion, entity card, related topics above results
    let prefix = '';
    if (data.suggestion) {
      prefix += `<div class="search-suggestion">Did you mean: <a href="#" class="suggestion-link">${escapeHtml(data.suggestion)}</a></div>`;
    }
    if (data.entity_card) {
      prefix += renderEntityCard(data.entity_card);
    }
    if (data.related_topics && data.related_topics.length > 0) {
      prefix += `<div class="search-related"><span class="search-related-label">Related:</span> ${data.related_topics.map(t => `<a href="#" class="related-topic-link">${escapeHtml(t)}</a>`).join('')}</div>`;
    }

    results.innerHTML = prefix
      + lastResults.map((r, i) => renderResult(r, i)).join('')
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

    // Bind copy URL handlers
    results.querySelectorAll('.result-copy-url').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.url).then(() => {
          btn.classList.add('result-copy-url--copied');
          setTimeout(() => btn.classList.remove('result-copy-url--copied'), 1200);
        });
      });
    });

    // Bind pagination handlers
    const prevBtn = results.querySelector('#pagination-prev');
    const nextBtn = results.querySelector('#pagination-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; doSearch(true); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; doSearch(true); });

    // "Did you mean" suggestion click
    const suggLink = results.querySelector('.suggestion-link');
    if (suggLink) {
      suggLink.addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('search-input').value = data.suggestion;
        doSearch();
      });
    }

    // Related topics click
    results.querySelectorAll('.related-topic-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('search-input').value = link.textContent;
        doSearch();
      });
    });

    // Click tracking on result title links
    results.querySelectorAll('.result-card-title').forEach((link, i) => {
      link.addEventListener('click', () => {
        api.click(q, lastResults[i]?.url || '', i + 1).catch(() => {});
      });
    });
  } catch (err) {
    results.innerHTML = `<div class="empty-state"><p>Search failed: ${err.message}</p></div>`;
  }
}

function faviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`;
}

function trustRingSVG(value, color, size = 24) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, value)));
  return `<svg class="result-trust-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="2.5"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--${color})" stroke-width="2.5"
      stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
      stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
  </svg>`;
}

function scoreChip(value, label, color) {
  if (value == null || value === undefined || value <= 0) return '';
  return `<span class="result-score-chip result-score-chip--${color}" title="${label}: ${value.toFixed(2)}">${label} ${value.toFixed(2)}</span>`;
}

function truncateUrl(url, maxLen = 70) {
  if (!url || url.length <= maxLen) return url;
  return url.slice(0, maxLen) + '…';
}

function trustLevel(r) {
  const spam = r.spam_score || 0;
  const quality = r.quality_score || 0;
  const eeat = r.eeat_score || 0;
  const avg = (quality + eeat + (1 - spam)) / 3;
  if (avg >= 0.7) return { label: 'Trusted', color: 'green' };
  if (avg >= 0.4) return { label: 'Moderate', color: 'amber' };
  return { label: 'Low trust', color: 'red' };
}

function renderResult(r, index) {
  const title = escapeHtml(r.title || r.url);
  const desc = highlightTerms(escapeHtml(r.description || ''), currentQuery);
  const domain = escapeHtml(r.domain || '');
  const crawlTime = r.crawled_at ? timeAgo(r.crawled_at) : '';

  // Provenance
  const isLocal = r.origin_peer_id && r.origin_peer_id === searchPeerID;
  const provLabel = isLocal ? 'Anonymous Node' : (r.origin_peer_name || (r.origin_peer_id ? 'Anonymous Node' : ''));
  const provColor = isLocal ? 'green' : 'blue';
  const provPill = provLabel
    ? `<span class="result-prov result-prov--${provColor}" title="${escapeHtml(r.origin_peer_id || '')}">${provLabel}</span>`
    : '';

  // Trust
  const trust = trustLevel(r);
  const trustVal = ((r.quality_score || 0) + (r.eeat_score || 0) + (1 - (r.spam_score || 0))) / 3;

  // Spam warning
  const spamWarning = r.spam_score > 0.3
    ? `<div class="content-warning">${icon('alertTriangle', 14)} Low trust — content may be unreliable</div>`
    : '';

  // Score chips
  const chips = [
    scoreChip(r.quality_score, 'Quality', 'green'),
    scoreChip(r.eeat_score, 'E-E-A-T', 'purple'),
    scoreChip(r.spam_score, 'Spam', 'red'),
  ].filter(Boolean);

  // Tags
  const tags = [];
  if (r.is_evergreen) tags.push({ label: 'evergreen', color: 'green' });
  if (r.readability_score > 0.6) tags.push({ label: 'readable', color: 'blue' });
  if (r.citation_score > 0.3) tags.push({ label: 'cited', color: 'purple' });
  if (r.is_time_sensitive) tags.push({ label: 'time-sensitive', color: 'amber' });

  // Favicon: Google S2 with colored-initial fallback via onerror
  const initial = domain ? domain.charAt(0).toUpperCase() : '?';
  const faviconHtml = domain
    ? `<img class="result-favicon" src="${faviconUrl(domain)}" alt="" width="16" height="16" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="result-favicon-fallback" style="display:none">${initial}</span>`
    : `<span class="result-favicon-fallback">${initial}</span>`;

  return `
    <div class="result-card result-card--${trust.color}">
      <div class="result-card-header">
        <div class="result-card-header-left">
          ${faviconHtml}
          <span class="result-domain">${domain}</span>
          ${crawlTime ? `<span class="result-time">${crawlTime}</span>` : ''}
        </div>
        <div class="result-card-header-right">
          ${trustRingSVG(trustVal, trust.color, 24)}
          ${provPill}
        </div>
      </div>
      <a class="result-card-title" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${title}</a>
      <div class="result-card-url-row">
        <span class="result-card-url">${escapeHtml(truncateUrl(r.url))}</span>
        <button class="result-copy-url" data-url="${escapeHtml(r.url)}" title="Copy URL">${icon('copy', 12)}</button>
      </div>
      <div class="result-card-snippet">${desc}</div>
      ${spamWarning}
      <div class="result-card-footer">
        <div class="result-card-footer-left">
          ${chips.length ? `<div class="result-card-scores">${chips.join('')}</div>` : ''}
          ${tags.length ? `<div class="result-card-tags">${tags.map(t => `<span class="result-tag result-tag--${t.color}">${t.label}</span>`).join('')}</div>` : ''}
        </div>
        <div class="result-actions">
          <button class="result-detail-btn result-detail-btn--accent" data-index="${index}">${icon('eye', 14)} <span class="action-label">Details</span></button>
          <button class="result-report-btn" data-url="${escapeHtml(r.url)}">${icon('flag', 14)}</button>
        </div>
      </div>
    </div>
  `;
}

function renderEntityCard(card) {
  if (!card || !card.name) return '';
  const props = card.properties ? Object.entries(card.properties) : [];
  const related = card.related_entities || [];
  return `
    <div class="entity-card">
      <div class="entity-card-header">
        <span class="entity-card-type badge badge-purple">${escapeHtml(card.type || 'entity')}</span>
        <span class="entity-card-name">${escapeHtml(card.name)}</span>
        ${card.doc_count ? `<span class="entity-card-count">${card.doc_count} docs</span>` : ''}
      </div>
      ${card.description ? `<div class="entity-card-desc">${escapeHtml(card.description)}</div>` : ''}
      ${props.length ? `<div class="entity-card-props">${props.map(([k, v]) => `<div class="entity-card-prop"><span class="entity-card-prop-key">${escapeHtml(k)}</span><span class="entity-card-prop-val">${escapeHtml(v)}</span></div>`).join('')}</div>` : ''}
      ${related.length ? `<div class="entity-card-related"><span class="entity-card-related-label">Related:</span> ${related.map(e => `<span class="badge badge-blue">${escapeHtml(e.name)}</span>`).join(' ')}</div>` : ''}
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

function scoreRing(value, color, size = 80) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, value)));
  return `
    <svg class="trust-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="6"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--${color})" stroke-width="6"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
        stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"
        class="trust-ring-fill"/>
    </svg>
  `;
}

function detailScoreRow(label, value, color, hint) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return `
    <div class="detail-score-row">
      <div class="score-bar">
        <span style="font-size:0.8em;color:var(--text-muted);min-width:100px">${label}</span>
        <div class="score-bar-fill">
          <div class="fill" style="width:${pct}%;background:var(--${color})"></div>
        </div>
        <span class="score-bar-label">${value.toFixed(2)}</span>
      </div>
      <div class="detail-hint">${hint}</div>
    </div>`;
}

function showResultDetail(r) {
  const trust = trustLevel(r);
  const trustVal = ((r.quality_score || 0) + (r.eeat_score || 0) + (1 - (r.spam_score || 0))) / 3;
  const crawledAt = r.crawled_at ? new Date(r.crawled_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown';
  const lang = r.language ? r.language.toUpperCase() : '';

  // Provenance info
  const isLocal = r.origin_peer_id && r.origin_peer_id === searchPeerID;
  const originLabel = isLocal ? 'This Node' : (r.origin_peer_name || 'Anonymous Node');
  const servedBy = r.peer_name || (r.peer_id ? 'Anonymous Node' : '');

  // Content flags
  const flags = [];
  if (r.is_time_sensitive) flags.push('<span class="badge badge-amber">' + icon('zap', 12) + ' Time-Sensitive</span>');
  if (r.is_evergreen) flags.push('<span class="badge badge-green">' + icon('coffee', 12) + ' Evergreen</span>');
  if (r.quality_score > 0.7) flags.push('<span class="badge badge-green">' + icon('star', 12) + ' High Quality</span>');
  if (r.spam_score > 0.5) flags.push('<span class="badge badge-red">' + icon('alertTriangle', 12) + ' High Spam Risk</span>');
  if (r.eeat_score > 0.5) flags.push('<span class="badge badge-purple">' + icon('shield', 12) + ' Expert Content</span>');

  // Score definitions with hints
  const relevanceScores = [
    ['BM25 Score', r.score, 'accent', 'How well this page matches your query terms'],
    ['Relevance', r.relevance_score, 'accent', 'Overall match strength for your search'],
    ['Freshness', r.freshness_score, 'amber', 'How recently this page was updated'],
  ].filter(([, v]) => v != null && v !== undefined);

  const qualityScores = [
    ['Quality', r.quality_score, 'green', 'Content depth, structure, and originality'],
    ['E-E-A-T', r.eeat_score, 'purple', 'Experience, Expertise, Authority, Trust signals'],
    ['Readability', r.readability_score, 'blue', 'How easy the text is to read'],
  ].filter(([, v]) => v != null && v !== undefined);

  const trustScores = [
    ['Spam Risk', r.spam_score, 'red', 'Likelihood of spam or manipulative content'],
    ['Link Score', r.link_score, 'blue', 'Inbound link quality from other pages'],
    ['SEO Score', r.seo_score, 'amber', 'Technical SEO signals (meta tags, structure)'],
    ['Citations', r.citation_score, 'purple', 'How often other pages reference this one'],
    ['Author Credibility', r.author_credibility, 'purple', 'Author reputation signals'],
  ].filter(([, v]) => v != null && v !== undefined);

  const html = `
    <div class="detail-tabs">
      <button class="detail-tab detail-tab--active" data-tab="overview">Overview</button>
      <button class="detail-tab" data-tab="scores">Scores</button>
      <button class="detail-tab" data-tab="provenance">Provenance</button>
    </div>

    <div class="detail-tab-content detail-tab-content--active" data-tab-content="overview">
      <div class="detail-overview">
        <div class="detail-overview-left">
          <div class="detail-overview-title">${escapeHtml(r.title || 'Untitled')}</div>
          <div class="detail-actions">
            <button class="btn btn-sm detail-copy-url" data-url="${escapeHtml(r.url)}">${icon('copy', 12)} Copy URL</button>
            <a class="btn btn-sm" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${icon('externalLink', 12)} Open</a>
          </div>
          <div class="detail-overview-meta">
            <span class="result-dot result-dot--${trust.color}"></span>
            <span>${escapeHtml(r.domain || '')}</span>
            <span class="detail-sep">·</span>
            <span>${crawledAt}</span>
            ${lang ? `<span class="detail-sep">·</span><span>${lang}</span>` : ''}
          </div>
        </div>
        <div class="detail-overview-right">
          ${scoreRing(trustVal, trust.color, 80)}
          <span class="detail-trust-label" style="color:var(--${trust.color})">${trust.label}</span>
        </div>
      </div>

      ${flags.length ? `
      <div class="detail-flags">
        <span class="detail-flags-label">Content Flags</span>
        <div class="detail-flags-list">${flags.join('')}</div>
      </div>` : ''}
    </div>

    <div class="detail-tab-content" data-tab-content="scores">
      ${relevanceScores.length ? `
      <div class="detail-section">
        <h4>Relevance</h4>
        ${relevanceScores.map(([label, val, color, hint]) => detailScoreRow(label, val || 0, color, hint)).join('')}
      </div>` : ''}

      ${qualityScores.length ? `
      <div class="detail-section">
        <h4>Content Quality</h4>
        ${qualityScores.map(([label, val, color, hint]) => detailScoreRow(label, val || 0, color, hint)).join('')}
      </div>` : ''}

      ${trustScores.length ? `
      <div class="detail-section">
        <h4>Trust &amp; Authority</h4>
        ${trustScores.map(([label, val, color, hint]) => detailScoreRow(label, val || 0, color, hint)).join('')}
      </div>` : ''}
    </div>

    <div class="detail-tab-content" data-tab-content="provenance">
      <div class="detail-provenance">
        <div class="detail-prov-row">
          <span class="detail-prov-label">Origin Node</span>
          <span class="detail-prov-value">${escapeHtml(originLabel)}</span>
        </div>
        ${servedBy ? `
        <div class="detail-prov-row">
          <span class="detail-prov-label">Served By</span>
          <span class="detail-prov-value" style="font-family:var(--font-mono);font-size:0.85em">${escapeHtml(servedBy)}</span>
        </div>` : ''}
        ${r.origin_peer_id ? `
        <div class="detail-prov-row">
          <span class="detail-prov-label">Origin Peer ID</span>
          <span class="detail-prov-value" style="font-family:var(--font-mono);font-size:0.8em">${escapeHtml(r.origin_peer_id)}</span>
        </div>` : ''}
        ${r.peer_id ? `
        <div class="detail-prov-row">
          <span class="detail-prov-label">Served Peer ID</span>
          <span class="detail-prov-value" style="font-family:var(--font-mono);font-size:0.8em">${escapeHtml(r.peer_id)}</span>
        </div>` : ''}
      </div>
    </div>
  `;

  showModal('Document Details', html, { width: '700px' });

  // Tab switching
  const modal = document.querySelector('.modal-body');
  if (modal) {
    modal.querySelectorAll('.detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('detail-tab--active'));
        modal.querySelectorAll('.detail-tab-content').forEach(c => c.classList.remove('detail-tab-content--active'));
        tab.classList.add('detail-tab--active');
        const target = modal.querySelector(`[data-tab-content="${tab.dataset.tab}"]`);
        if (target) target.classList.add('detail-tab-content--active');
      });
    });

    // Copy URL button in overview tab
    const copyBtn = modal.querySelector('.detail-copy-url');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(copyBtn.dataset.url).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.innerHTML = `${icon('copy', 12)} Copy URL`; }, 1200);
        });
      });
    }
  }
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
    if (nodeEl) nodeEl.textContent = `Node: ${s.node_name || 'Anonymous Node'} | Indexed: ${s.indexed_docs} docs | Crawled: ${s.crawled_urls} URLs | Queue: ${s.urls_in_queue}`;
    if (peerEl) peerEl.textContent = `${s.connected_peers} peers | Uptime: ${s.uptime}`;
  } catch {
    const el = document.getElementById('status-node');
    if (el) el.textContent = 'Node: connecting...';
  }
}
