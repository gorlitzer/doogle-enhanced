// Doogle v2 — Crawler Management (enhanced with analytics + charts)
import { api } from '../api.js';
import { renderBarChart, renderLineChart, cardSkeleton, escapeHtml, getCSS } from '../components.js';

let activeTab = 'status';
let crawlHistory = []; // track crawl counts for chart

export function renderCrawler(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Crawler</h2>
      <p>Web crawler status, queue, analytics, and seed URL management</p>
    </div>
    <div class="tabs" id="crawler-tabs">
      <button class="tab active" data-tab="status">Status</button>
      <button class="tab" data-tab="analytics">Analytics</button>
      <button class="tab" data-tab="seeds">Seeds</button>
      <button class="tab" data-tab="features">Features</button>
    </div>
    <div id="crawler-content"></div>
  `;

  document.querySelectorAll('#crawler-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('#crawler-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTab();
    });
  });

  renderTab();
  window._pageInterval = setInterval(() => {
    if (activeTab === 'status' || activeTab === 'analytics') renderTab();
  }, 5000);
}

async function renderTab() {
  const content = document.getElementById('crawler-content');
  if (!content) return;

  if (activeTab === 'status') await renderStatus(content);
  else if (activeTab === 'analytics') await renderAnalytics(content);
  else if (activeTab === 'seeds') renderSeeds(content);
  else if (activeTab === 'features') renderFeatures(content);
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
      ? ((totalCrawled / (totalCrawled + totalFailed)) * 100).toFixed(1)
      : '—';

    // Track history for analytics chart
    crawlHistory.push({ time: new Date(), crawled: status.crawled_urls, queued: status.urls_in_queue });
    if (crawlHistory.length > 60) crawlHistory.shift();

    el.innerHTML = `
      <div class="card-grid">
        <div class="card">
          <div class="card-label">Crawled URLs</div>
          <div class="card-value">${status.crawled_urls.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Queue Depth</div>
          <div class="card-value">${status.urls_in_queue.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Crawl Rate</div>
          <div class="card-value">${crawlRate}</div>
          <div class="card-sub">URLs/minute</div>
        </div>
        <div class="card">
          <div class="card-label">Active Workers</div>
          <div class="card-value">${activeWorkers} <span style="font-size:0.5em;color:var(--text-muted)">/ ${workers}</span></div>
        </div>
        <div class="card">
          <div class="card-label">Success Rate</div>
          <div class="card-value">${successRate}${successRate !== '—' ? '%' : ''}</div>
          <div class="card-sub">${totalCrawled.toLocaleString()} ok / ${totalFailed.toLocaleString()} failed</div>
        </div>
        <div class="card">
          <div class="card-label">Seen URLs</div>
          <div class="card-value">${seenURLs.toLocaleString()}</div>
          <div class="card-sub">unique URLs discovered</div>
        </div>
      </div>

      <div class="section">
        <h3>Configuration</h3>
        <div class="table-wrap">
          <table>
            <tbody>
              <tr><td>User Agent</td><td class="mono">${escapeHtml(String(userAgent))}</td></tr>
              <tr><td>Workers</td><td>${workers}</td></tr>
              <tr><td>Rate Limit</td><td>${rateLimit} req/min/domain</td></tr>
              <tr><td>Max Depth</td><td>${maxDepth}</td></tr>
              <tr><td>Robots.txt</td><td><span class="badge badge-green">respected</span></td></tr>
              <tr><td>Body Limit</td><td>10 MB</td></tr>
              <tr><td>Redirect Limit</td><td>10 hops</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load crawler status: ${err.message}</p></div>`;
  }
}

async function renderAnalytics(el) {
  try {
    const status = await api.status();
    const upMins = parseUptimeMinutes(status.uptime);
    const crawlRate = upMins > 0 ? (status.crawled_urls / upMins).toFixed(1) : '0';

    el.innerHTML = `
      <div class="card-grid">
        <div class="card">
          <div class="card-label">Total Crawled</div>
          <div class="card-value">${status.crawled_urls.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Current Queue</div>
          <div class="card-value">${status.urls_in_queue.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Avg Rate</div>
          <div class="card-value">${crawlRate} URL/min</div>
        </div>
        <div class="card">
          <div class="card-label">Indexed</div>
          <div class="card-value">${status.indexed_docs.toLocaleString()}</div>
          <div class="card-sub">Index rate: ${upMins > 0 ? (status.indexed_docs / upMins).toFixed(1) : '0'}/min</div>
        </div>
      </div>

      <div class="section">
        <h3>Crawl Activity (live)</h3>
        <div class="chart-container">
          <canvas id="crawl-activity-chart"></canvas>
        </div>
      </div>

      <div class="section">
        <h3>Crawled vs Indexed</h3>
        <div class="chart-container">
          <canvas id="crawl-vs-indexed-chart"></canvas>
        </div>
      </div>

      <div class="section">
        <h3>Queue Depth Over Time</h3>
        <div class="chart-container">
          <canvas id="queue-depth-chart"></canvas>
        </div>
      </div>
    `;

    // Crawl activity line chart
    if (crawlHistory.length > 1) {
      const deltas = [];
      for (let i = 1; i < crawlHistory.length; i++) {
        deltas.push({
          label: formatTime(crawlHistory[i].time),
          value: crawlHistory[i].crawled - crawlHistory[i - 1].crawled,
        });
      }
      renderLineChart('crawl-activity-chart', [
        { label: 'URLs crawled/interval', color: getCSS('--accent'), data: deltas },
      ], { height: 200 });
    } else {
      renderLineChart('crawl-activity-chart', [], { height: 200 });
    }

    // Crawled vs Indexed bar chart
    renderBarChart('crawl-vs-indexed-chart', [
      { label: 'Crawled', value: status.crawled_urls, color: getCSS('--accent') },
      { label: 'Indexed', value: status.indexed_docs, color: getCSS('--green') },
      { label: 'Queue', value: status.urls_in_queue, color: getCSS('--amber') },
    ], { height: 200 });

    // Queue depth line chart
    if (crawlHistory.length > 1) {
      const queueData = crawlHistory.map(h => ({
        label: formatTime(h.time),
        value: h.queued,
      }));
      renderLineChart('queue-depth-chart', [
        { label: 'Queue depth', color: getCSS('--amber'), data: queueData },
      ], { height: 200 });
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
      <p style="color:var(--text-muted);font-size:0.9em;margin-bottom:12px">
        Seed URLs are the starting points for the crawler. The node will crawl these and discover new pages from the links found.
      </p>
      <div class="form-row">
        <input type="text" id="seed-input" placeholder="https://example.com">
        <button class="btn btn-primary" id="seed-add-btn">Add Seed</button>
      </div>
      <div id="seed-result" style="margin-top:8px"></div>
    </div>

    <div class="section">
      <h3>Bulk Add Seeds</h3>
      <textarea id="bulk-seeds" rows="8" style="width:100%;padding:12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-family:monospace;font-size:0.85em;resize:vertical" placeholder="One URL per line:
https://en.wikipedia.org
https://news.ycombinator.com
https://go.dev
https://developer.mozilla.org"></textarea>
      <button class="btn btn-primary" id="bulk-add-btn" style="margin-top:8px">Add All</button>
      <div id="bulk-result" style="margin-top:8px"></div>
    </div>

    <div class="section">
      <h3>Suggested Seeds</h3>
      <p style="color:var(--text-muted);font-size:0.9em;margin-bottom:12px">Click to queue these popular starting points.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${suggestedSeeds.map(s =>
          `<button class="badge badge-accent suggested-seed" data-url="${s}" style="cursor:pointer;border:none;font-family:inherit;font-size:0.85em;padding:5px 10px">${s.replace('https://', '')}</button>`
        ).join('')}
      </div>
      <div id="suggested-result" style="margin-top:8px"></div>
    </div>
  `;

  document.getElementById('seed-add-btn').addEventListener('click', async () => {
    const input = document.getElementById('seed-input');
    const result = document.getElementById('seed-result');
    const url = input.value.trim();
    if (!url) return;
    try {
      await api.addSeed(url);
      result.innerHTML = `<span class="badge badge-green">Queued: ${escapeHtml(url)}</span>`;
      input.value = '';
    } catch (err) {
      result.innerHTML = `<span class="badge badge-red">Error: ${err.message}</span>`;
    }
  });

  document.getElementById('seed-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('seed-add-btn').click();
  });

  document.getElementById('bulk-add-btn').addEventListener('click', async () => {
    const textarea = document.getElementById('bulk-seeds');
    const result = document.getElementById('bulk-result');
    const urls = textarea.value.split('\n').map(u => u.trim()).filter(u => u && u.startsWith('http'));
    if (urls.length === 0) { result.innerHTML = '<span class="badge badge-amber">No valid URLs found</span>'; return; }

    let ok = 0, fail = 0;
    for (const url of urls) {
      try { await api.addSeed(url); ok++; } catch { fail++; }
    }
    result.innerHTML = `<span class="badge badge-green">${ok} queued</span>${fail > 0 ? ` <span class="badge badge-red">${fail} failed</span>` : ''}`;
    textarea.value = '';
  });

  el.querySelectorAll('.suggested-seed').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.url;
      const result = document.getElementById('suggested-result');
      try {
        await api.addSeed(url);
        btn.style.opacity = '0.4';
        btn.disabled = true;
        result.innerHTML = `<span class="badge badge-green">Queued: ${url}</span>`;
      } catch (err) {
        result.innerHTML = `<span class="badge badge-red">Error: ${err.message}</span>`;
      }
    });
  });
}

const suggestedSeeds = [
  'https://en.wikipedia.org',
  'https://news.ycombinator.com',
  'https://go.dev',
  'https://developer.mozilla.org',
  'https://docs.python.org/3/',
  'https://www.rust-lang.org',
  'https://blog.cloudflare.com',
  'https://arxiv.org',
  'https://lobste.rs',
  'https://lwn.net',
  'https://stackoverflow.com',
  'https://www.reuters.com',
  'https://arstechnica.com',
  'https://www.bbc.com/news',
  'https://www.nature.com',
  'https://github.com/trending',
  'https://web.dev',
  'https://kubernetes.io/docs/',
  'https://redis.io/docs/',
  'https://www.postgresql.org/docs/',
  'https://reactjs.org',
  'https://vuejs.org',
  'https://angular.dev',
  'https://www.typescriptlang.org',
  'https://deno.land',
  'https://bun.sh',
  'https://htmx.org',
  'https://tailwindcss.com',
  'https://css-tricks.com',
  'https://www.smashingmagazine.com',
];

function renderFeatures(el) {
  el.innerHTML = `
    <div class="section">
      <h3>Crawler Features</h3>
      <div class="card-grid">
        ${feature('Distributed Crawling', 'URLs broadcast via GossipSub to the P2P network. Nodes claim URLs by consistent hash.', true)}
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
  return `
    <div class="card card-sm">
      <div class="card-label">${enabled ? '<span class="badge badge-green">active</span>' : '<span class="badge badge-default">planned</span>'} ${escapeHtml(name)}</div>
      <div class="card-sub" style="margin-top:4px">${escapeHtml(desc)}</div>
    </div>
  `;
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

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

