// Doogle v2 — Roadmap Page
import { escapeHtml } from '../components.js';

const features = [
  {
    id: 'crawler-standards',
    title: 'Crawler Standards Compliance',
    description: 'Full RFC 9309 robots.txt, noindex/nofollow directives, sitemap discovery, and URL normalization.',
    status: 'shipped',
    category: 'Infrastructure',
    icon: '🕷️',
    details: [
      'RFC 9309 robots.txt parsing with Crawl-delay',
      'Meta robots noindex/nofollow enforcement',
      'X-Robots-Tag HTTP header support',
      'Sitemap.xml auto-discovery from robots.txt',
      'URL normalization (trailing slashes, fragments, encoding)',
    ],
  },
  {
    id: 'neural-ranking',
    title: 'Neural-Style Ranking',
    description: 'Query-document interaction features expanding LTR from 14 to 28 features with TF-IDF similarity, term proximity, and coverage signals.',
    status: 'shipped',
    category: 'Ranking',
    icon: '🧠',
    details: [
      'Title/body/heading/URL term overlap',
      'Exact title match and title coverage',
      'Query-document TF-IDF cosine similarity',
      'Term proximity scoring',
      'IDF-weighted overlap',
      'Gradient-boosted model with 28 features',
    ],
  },
  {
    id: 'ctr-signals',
    title: 'Click-Through Rate Signals',
    description: 'Position-debiased CTR, dwell time tracking, and pogo-stick detection for behavioral ranking.',
    status: 'shipped',
    category: 'Ranking',
    icon: '📊',
    details: [
      'Impression counting per query-URL pair',
      'Dwell time measurement (click to return)',
      'Pogo-stick detection (< 10s return)',
      'Position bias correction (examination hypothesis)',
      'Domain-level CTR and dwell aggregation',
    ],
  },
  {
    id: 'core-web-vitals',
    title: 'Core Web Vitals',
    description: 'TTFB measurement, page size analysis, resource counting, lazy image and async script detection.',
    status: 'shipped',
    category: 'Quality',
    icon: '⚡',
    details: [
      'Time to First Byte (TTFB) measurement',
      'Page size and resource count tracking',
      'Script bloat and stylesheet count analysis',
      'Lazy image loading detection',
      'Async/defer script detection',
      'Composite performance score (0-1)',
    ],
  },
  {
    id: 'mobile-first',
    title: 'Mobile-First Indexing',
    description: 'Viewport meta detection, responsive CSS analysis, touch icon detection, and mobile scoring.',
    status: 'shipped',
    category: 'Quality',
    icon: '📱',
    details: [
      'Viewport meta tag validation',
      'Media query and responsive CSS detection',
      'Flexbox/Grid layout detection',
      'Touch icon discovery',
      'Small font and tap target penalties',
      'Composite mobile score (0-1)',
    ],
  },
  {
    id: 'brand-authority',
    title: 'Brand Authority (Behavioral)',
    description: 'Domain-level behavioral signals blended into domain authority: CTR, dwell time, search volume.',
    status: 'shipped',
    category: 'Ranking',
    icon: '🏢',
    details: [
      'Domain-level CTR aggregation',
      'Average dwell time per domain',
      'Search volume tracking',
      'Behavioral blend with PageRank and quality',
      'Graceful fallback when no click data exists',
    ],
  },
  {
    id: 'continuous-indexing',
    title: 'Real-Time Continuous Indexing',
    description: 'Priority-based re-crawl scheduler that keeps high-value pages fresh based on staleness and importance.',
    status: 'shipped',
    category: 'Infrastructure',
    icon: '🔄',
    details: [
      'Staleness-weighted priority formula',
      'PageRank + domain authority importance signal',
      'Change frequency tracking',
      'Batch scheduling every 5 minutes',
      'Seen-URL dedup bypass for re-crawls',
    ],
  },
];

const statusConfig = {
  shipped:       { label: 'Shipped',     color: 'green',  order: 0 },
  'in-progress': { label: 'In Progress', color: 'accent', order: 1 },
  planned:       { label: 'Planned',     color: 'amber',  order: 2 },
};

let activeFilter = 'all';

export function renderRoadmap(container) {
  container.innerHTML = `
    <div class="roadmap-page">
      <div class="roadmap-header">
        <h1>Roadmap</h1>
        <p class="roadmap-subtitle">Tracking our progress toward Google-parity search features</p>
      </div>
      <div class="roadmap-filters" id="roadmap-filters">
        <button class="roadmap-filter-btn roadmap-filter-btn--active" data-filter="all">All</button>
        <button class="roadmap-filter-btn" data-filter="shipped">Shipped</button>
        <button class="roadmap-filter-btn" data-filter="in-progress">In Progress</button>
        <button class="roadmap-filter-btn" data-filter="planned">Planned</button>
      </div>
      <div class="roadmap-stats" id="roadmap-stats"></div>
      <div class="roadmap-grid" id="roadmap-grid"></div>
    </div>
  `;

  renderStats();
  renderGrid();

  document.getElementById('roadmap-filters').addEventListener('click', e => {
    const btn = e.target.closest('.roadmap-filter-btn');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.roadmap-filter-btn').forEach(b => b.classList.remove('roadmap-filter-btn--active'));
    btn.classList.add('roadmap-filter-btn--active');
    renderGrid();
  });
}

function renderStats() {
  const shipped = features.filter(f => f.status === 'shipped').length;
  const inProgress = features.filter(f => f.status === 'in-progress').length;
  const planned = features.filter(f => f.status === 'planned').length;
  const el = document.getElementById('roadmap-stats');
  el.innerHTML = `
    <div class="roadmap-stat"><span class="roadmap-stat-num" style="color:var(--green)">${shipped}</span><span class="roadmap-stat-label">Shipped</span></div>
    <div class="roadmap-stat"><span class="roadmap-stat-num" style="color:var(--accent)">${inProgress}</span><span class="roadmap-stat-label">In Progress</span></div>
    <div class="roadmap-stat"><span class="roadmap-stat-num" style="color:var(--amber)">${planned}</span><span class="roadmap-stat-label">Planned</span></div>
    <div class="roadmap-stat"><span class="roadmap-stat-num">${features.length}</span><span class="roadmap-stat-label">Total</span></div>
  `;
}

function renderGrid() {
  const filtered = activeFilter === 'all' ? features : features.filter(f => f.status === activeFilter);
  const sorted = [...filtered].sort((a, b) => statusConfig[a.status].order - statusConfig[b.status].order);

  const el = document.getElementById('roadmap-grid');
  if (sorted.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No features match this filter.</p></div>';
    return;
  }

  el.innerHTML = sorted.map(f => {
    const cfg = statusConfig[f.status];
    return `
      <div class="roadmap-card roadmap-card--${cfg.color}">
        <div class="roadmap-card-header">
          <span class="roadmap-card-icon">${f.icon}</span>
          <span class="roadmap-card-category">${escapeHtml(f.category)}</span>
          <span class="roadmap-status-badge roadmap-status-badge--${cfg.color}">${cfg.label}</span>
        </div>
        <h3 class="roadmap-card-title">${escapeHtml(f.title)}</h3>
        <p class="roadmap-card-desc">${escapeHtml(f.description)}</p>
        <ul class="roadmap-card-details">
          ${f.details.map(d => `<li>${escapeHtml(d)}</li>`).join('')}
        </ul>
      </div>
    `;
  }).join('');
}
