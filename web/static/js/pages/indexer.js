// Doogle v2 — Indexer Dashboard (enhanced with document browser + detail modals)
import { api } from '../api.js';
import { showModal, scoreBar, renderBarChart, cardSkeleton, escapeHtml, getCSS } from '../components.js';

let activeTab = 'overview';
let docOffset = 0;
const DOC_PAGE_SIZE = 20;

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
    const [status, indexer] = await Promise.all([
      api.status(),
      api.indexerStats().catch(() => null),
    ]);

    const totalIndexed = indexer?.total_indexed || 0;
    const avgQuality = indexer?.avg_quality;
    const avgSpam = indexer?.avg_spam;
    const rejected = indexer?.spam_rejected || 0;
    const duplicates = indexer?.duplicates_skipped || 0;
    const emptySkipped = indexer?.empty_skipped || 0;

    el.innerHTML = `
      <div class="card-grid">
        <div class="card">
          <div class="card-label">Indexed Documents</div>
          <div class="card-value">${status.indexed_docs.toLocaleString()}</div>
          <div class="card-sub">in Bleve store</div>
        </div>
        <div class="card">
          <div class="card-label">Processed Total</div>
          <div class="card-value">${totalIndexed.toLocaleString()}</div>
          <div class="card-sub">passed through pipeline</div>
        </div>
        <div class="card">
          <div class="card-label">Avg Quality Score</div>
          <div class="card-value">${typeof avgQuality === 'number' && avgQuality > 0 ? avgQuality.toFixed(3) : 'N/A'}</div>
          ${typeof avgQuality === 'number' && avgQuality > 0 ? qualityBar(avgQuality, 'green') : ''}
        </div>
        <div class="card">
          <div class="card-label">Avg Spam Score</div>
          <div class="card-value">${typeof avgSpam === 'number' && avgSpam > 0 ? avgSpam.toFixed(3) : 'N/A'}</div>
          ${typeof avgSpam === 'number' && avgSpam > 0 ? qualityBar(avgSpam, 'red') : ''}
        </div>
        <div class="card">
          <div class="card-label">Spam Rejected</div>
          <div class="card-value">${rejected.toLocaleString()}</div>
          <div class="card-sub">spam score > 0.7</div>
        </div>
        <div class="card">
          <div class="card-label">Duplicates Skipped</div>
          <div class="card-value">${duplicates.toLocaleString()}</div>
          <div class="card-sub">near-duplicate content</div>
        </div>
        <div class="card">
          <div class="card-label">Empty Skipped</div>
          <div class="card-value">${emptySkipped.toLocaleString()}</div>
          <div class="card-sub">no content/title</div>
        </div>
      </div>

      <div class="section">
        <h3>Pipeline Throughput</h3>
        <div class="chart-container">
          <canvas id="indexer-throughput-chart"></canvas>
        </div>
      </div>

      <div class="section">
        <h3>Indexing Pipeline</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:0.9em">
          <span class="badge badge-blue">Crawl</span>
          <span style="color:var(--text-muted)">&rarr;</span>
          <span class="badge badge-default">Dedup Check</span>
          <span style="color:var(--text-muted)">&rarr;</span>
          <span class="badge badge-purple">NLP Enrich</span>
          <span style="color:var(--text-muted)">&rarr;</span>
          <span class="badge badge-amber">Score</span>
          <span style="color:var(--text-muted)">&rarr;</span>
          <span class="badge badge-red">Spam Filter</span>
          <span style="color:var(--text-muted)">&rarr;</span>
          <span class="badge badge-green">Bleve Index</span>
        </div>
      </div>
    `;

    // Throughput bar chart
    renderBarChart('indexer-throughput-chart', [
      { label: 'Indexed', value: totalIndexed, color: getCSS('--green') },
      { label: 'Spam Rejected', value: rejected, color: getCSS('--red') },
      { label: 'Duplicates', value: duplicates, color: getCSS('--amber') },
      { label: 'Empty', value: emptySkipped, color: getCSS('--border-light') },
    ], { height: 200 });
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load indexer stats: ${err.message}</p></div>`;
  }
}

async function renderDocuments(el) {
  el.innerHTML = `
    <div class="section">
      <h3>Search Indexed Documents</h3>
      <div class="form-row">
        <input type="text" id="doc-search-input" placeholder="Search indexed documents...">
        <button class="btn btn-primary" id="doc-search-btn">Search</button>
      </div>
    </div>
    <div class="section">
      <h3>Recent Documents</h3>
      <div id="doc-results">${cardSkeleton(3)}</div>
      <div id="doc-pagination" style="margin-top:12px;display:flex;gap:8px;align-items:center"></div>
    </div>
  `;

  document.getElementById('doc-search-btn').addEventListener('click', searchDocs);
  document.getElementById('doc-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchDocs();
  });

  loadDocuments();
}

async function loadDocuments() {
  const results = document.getElementById('doc-results');
  const pagination = document.getElementById('doc-pagination');
  if (!results) return;

  try {
    const data = await api.documents(docOffset, DOC_PAGE_SIZE);
    const docs = data.documents || [];
    const total = data.total || 0;

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
              <th>Quality</th>
              <th>Spam</th>
              <th>E-E-A-T</th>
              <th>Indexed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${docs.map(d => `
              <tr>
                <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.title || d.url).slice(0, 60)}</a>
                </td>
                <td class="mono" style="font-size:0.8em">${escapeHtml(d.domain)}</td>
                <td><span class="badge badge-${qualColor(d.quality_score)}">${(d.quality_score || 0).toFixed(2)}</span></td>
                <td><span class="badge badge-${d.spam_score > 0.3 ? 'red' : 'green'}">${(d.spam_score || 0).toFixed(2)}</span></td>
                <td>${(d.eeat_score || 0).toFixed(2)}</td>
                <td style="font-size:0.8em;color:var(--text-muted)">${d.indexed_at ? new Date(d.indexed_at).toLocaleString() : '—'}</td>
                <td><button class="badge badge-accent doc-detail-btn" data-id="${escapeHtml(d.id)}" style="cursor:pointer;border:none;font-family:inherit">details</button></td>
              </tr>
            `).join('')}
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
        <span class="detail-value" style="font-family:monospace;font-size:0.85em">${escapeHtml(r.peer_id)}</span>
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

