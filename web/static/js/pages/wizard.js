// Doogle v2 — Onboarding Wizard
import { api } from '../api.js';
import { icon } from '../components.js';

let currentStep = 0;
const selectedCategories = new Set();
const removedSeeds = new Set();
let customSeeds = '';
let settings = { depth: 3, workers: 4 };
let pollInterval = null;

// ─── Category Groups ─────────────────────────────────
// Organized for everyone — not just developers.

const CATEGORY_GROUPS = [
  {
    id: 'knowledge', name: 'Knowledge & Learning', icon: 'fileText',
    categories: [
      {
        id: 'education', name: 'Education', icon: 'fileText',
        desc: 'Online courses, encyclopedias, and academic resources',
        seeds: ['https://en.wikipedia.org', 'https://www.khanacademy.org', 'https://www.britannica.com', 'https://ocw.mit.edu', 'https://www.coursera.org', 'https://stackoverflow.com'],
      },
      {
        id: 'science', name: 'Science & Research', icon: 'cpu',
        desc: 'Scientific papers, journals, and research databases',
        seeds: ['https://arxiv.org', 'https://www.nature.com', 'https://pubmed.ncbi.nlm.nih.gov', 'https://www.science.org', 'https://www.nasa.gov', 'https://www.scientificamerican.com'],
      },
      {
        id: 'news', name: 'News & Journalism', icon: 'megaphone',
        desc: 'World news, investigative reporting, and current events',
        seeds: ['https://www.reuters.com', 'https://apnews.com', 'https://www.bbc.com/news', 'https://www.npr.org', 'https://www.theguardian.com', 'https://www.aljazeera.com'],
      },
      {
        id: 'history', name: 'History & Culture', icon: 'globe',
        desc: 'Museums, archives, cultural heritage, and world history',
        seeds: ['https://www.smithsonianmag.com', 'https://www.history.com', 'https://whc.unesco.org', 'https://www.britishmuseum.org', 'https://archive.org', 'https://www.loc.gov'],
      },
    ],
  },
  {
    id: 'lifestyle', name: 'Lifestyle & Wellbeing', icon: 'heart',
    categories: [
      {
        id: 'health', name: 'Health & Medicine', icon: 'heart',
        desc: 'Medical information, wellness guides, and health research',
        seeds: ['https://www.who.int', 'https://www.mayoclinic.org', 'https://www.nih.gov', 'https://www.healthline.com', 'https://www.webmd.com', 'https://medlineplus.gov'],
      },
      {
        id: 'food', name: 'Food & Cooking', icon: 'coffee',
        desc: 'Recipes, cooking techniques, and food culture',
        seeds: ['https://www.allrecipes.com', 'https://www.seriouseats.com', 'https://www.epicurious.com', 'https://www.bbcgoodfood.com', 'https://www.bonappetit.com', 'https://www.simplyrecipes.com'],
      },
      {
        id: 'sports', name: 'Sports & Fitness', icon: 'trendingUp',
        desc: 'Sports news, fitness guides, and athletic training',
        seeds: ['https://www.espn.com', 'https://www.bbc.com/sport', 'https://olympics.com', 'https://www.runnersworld.com', 'https://www.nba.com', 'https://www.fifa.com'],
      },
      {
        id: 'travel', name: 'Travel & Geography', icon: 'map',
        desc: 'Travel guides, destinations, and geographic exploration',
        seeds: ['https://www.lonelyplanet.com', 'https://www.nationalgeographic.com', 'https://www.atlasobscura.com', 'https://wikitravel.org', 'https://www.tripadvisor.com', 'https://www.worldnomads.com'],
      },
    ],
  },
  {
    id: 'creative', name: 'Creative & Entertainment', icon: 'monitor',
    categories: [
      {
        id: 'arts', name: 'Arts & Design', icon: 'image',
        desc: 'Visual arts, graphic design, illustration, and museums',
        seeds: ['https://www.moma.org', 'https://www.behance.net', 'https://dribbble.com', 'https://www.deviantart.com', 'https://www.artsy.net', 'https://www.metmuseum.org'],
      },
      {
        id: 'music', name: 'Music & Film', icon: 'music',
        desc: 'Music discovery, film reviews, and entertainment media',
        seeds: ['https://www.imdb.com', 'https://pitchfork.com', 'https://bandcamp.com', 'https://www.discogs.com', 'https://letterboxd.com', 'https://www.rollingstone.com'],
      },
      {
        id: 'books', name: 'Books & Literature', icon: 'bookOpen',
        desc: 'Book reviews, literary archives, and digital libraries',
        seeds: ['https://www.goodreads.com', 'https://www.gutenberg.org', 'https://openlibrary.org', 'https://www.loc.gov', 'https://lithub.com', 'https://www.poetryfoundation.org'],
      },
      {
        id: 'gaming', name: 'Gaming', icon: 'monitor',
        desc: 'Game reviews, industry news, and gaming communities',
        seeds: ['https://www.ign.com', 'https://www.polygon.com', 'https://store.steampowered.com', 'https://www.pcgamer.com', 'https://kotaku.com', 'https://www.gamespot.com'],
      },
    ],
  },
  {
    id: 'technology', name: 'Technology & Development', icon: 'code',
    categories: [
      {
        id: 'tech', name: 'Programming', icon: 'code',
        desc: 'Language docs, tutorials, and developer resources',
        seeds: ['https://go.dev', 'https://developer.mozilla.org', 'https://docs.python.org/3/', 'https://www.rust-lang.org', 'https://www.typescriptlang.org', 'https://deno.land', 'https://bun.sh'],
      },
      {
        id: 'opensource', name: 'Open Source', icon: 'network',
        desc: 'Open-source projects, communities, and foundations',
        seeds: ['https://github.com/trending', 'https://sr.ht', 'https://codeberg.org', 'https://opensource.org', 'https://apache.org', 'https://www.linuxfoundation.org'],
      },
      {
        id: 'infra', name: 'Cloud & DevOps', icon: 'database',
        desc: 'Infrastructure, databases, containers, and monitoring',
        seeds: ['https://kubernetes.io/docs/', 'https://redis.io/docs/', 'https://www.postgresql.org/docs/', 'https://docs.docker.com', 'https://nginx.com', 'https://prometheus.io/docs/'],
      },
      {
        id: 'webdev', name: 'Web & Frontend', icon: 'globe',
        desc: 'Web standards, frameworks, CSS, and browser APIs',
        seeds: ['https://web.dev', 'https://css-tricks.com', 'https://reactjs.org', 'https://vuejs.org', 'https://svelte.dev', 'https://nextjs.org', 'https://tailwindcss.com', 'https://htmx.org'],
      },
    ],
  },
];

// Flatten for backward compat
const CATEGORIES = CATEGORY_GROUPS.flatMap(g => g.categories);

const STEP_LABELS = ['Welcome', 'Identity', 'Focus', 'Settings', 'Launch'];

const DEPTH_DESCRIPTIONS = [
  '', // 0 unused
  'Shallow — only seed pages themselves',
  'Light — seed pages + their direct links',
  'Balanced — good breadth without overloading',
  'Deep — thorough crawl, more resources used',
  'Maximum — extensive crawl, highest resource usage',
];

function getAllSelectedSeeds() {
  const seeds = [];
  for (const cat of CATEGORIES) {
    if (selectedCategories.has(cat.id)) {
      seeds.push(...cat.seeds);
    }
  }
  const custom = customSeeds.split('\n').map(s => s.trim()).filter(s => s.startsWith('http://') || s.startsWith('https://'));
  seeds.push(...custom);
  return [...new Set(seeds)].filter(s => !removedSeeds.has(s));
}

function countStats() {
  const seeds = getAllSelectedSeeds();
  const catCount = selectedCategories.size;
  const customCount = customSeeds.split('\n').map(s => s.trim()).filter(s => s.startsWith('http://') || s.startsWith('https://')).length;
  return { total: seeds.length, catCount, customCount };
}

function growthEstimate() {
  const seeds = getAllSelectedSeeds();
  const n = seeds.length;
  const d = settings.depth;
  const w = settings.workers;
  return Math.min(n * Math.pow(8, Math.min(d, 3)), w * 60 * 12);
}

export function renderWizard(container) {
  // Reset state so re-running the wizard starts fresh
  currentStep = 0;
  selectedCategories.clear();
  removedSeeds.clear();
  customSeeds = '';
  settings = { depth: 3, workers: 4 };
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }

  container.innerHTML = `
    <div class="wizard-container">
      <div class="wizard-progress" id="wizard-progress"></div>
      <div class="wizard-body" id="wizard-body"></div>
      <div class="wizard-nav" id="wizard-nav"></div>
    </div>
  `;
  renderProgress();
  renderStep();
  renderNav();
}

function renderProgress() {
  const el = document.getElementById('wizard-progress');
  if (!el) return;
  el.innerHTML = STEP_LABELS.map((label, i) => {
    let cls = 'wizard-step-dot';
    if (i < currentStep) cls += ' completed';
    else if (i === currentStep) cls += ' active';
    const checkmark = i < currentStep ? '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="white" stroke-width="2.5"><polyline points="3 8.5 6.5 12 13 4"/></svg>' : (i + 1);
    return `
      ${i > 0 ? '<div class="wizard-step-line' + (i <= currentStep ? ' filled' : '') + '"></div>' : ''}
      <div class="${cls}">
        <span>${checkmark}</span>
      </div>
    `;
  }).join('');
}

function renderNav() {
  const el = document.getElementById('wizard-nav');
  if (!el) return;
  if (currentStep === 0) {
    el.innerHTML = '';
    return;
  }
  if (currentStep === 4) {
    el.innerHTML = '';
    return;
  }

  const nextDisabled = currentStep === 2 && getAllSelectedSeeds().length === 0;
  el.innerHTML = `
    <button class="btn wizard-back-btn" id="wizard-back">Back</button>
    <button class="btn btn-primary wizard-next-btn" id="wizard-next" ${nextDisabled ? 'disabled' : ''}>Next</button>
  `;
  document.getElementById('wizard-back').addEventListener('click', () => { currentStep--; update(); });
  document.getElementById('wizard-next').addEventListener('click', () => { currentStep++; update(); });
}

function update() {
  renderProgress();
  renderStep();
  renderNav();
}

function renderStep() {
  const body = document.getElementById('wizard-body');
  if (!body) return;

  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }

  switch (currentStep) {
    case 0: renderWelcome(body); break;
    case 1: renderIdentity(body); break;
    case 2: renderFocus(body); break;
    case 3: renderSettings(body); break;
    case 4: renderLaunch(body); break;
  }
}

// ─── Step 0: Welcome ──────────────────────────────────
function renderWelcome(el) {
  el.innerHTML = `
    <div class="wizard-welcome">
      <div class="wizard-owl">
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M35 38 L28 12 L45 32" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" opacity="0.7"/>
          <path d="M85 38 L92 12 L75 32" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" opacity="0.7"/>
          <ellipse cx="60" cy="68" rx="36" ry="40" fill="var(--bg-card)" stroke="var(--accent)" stroke-width="2" opacity="0.9"/>
          <circle cx="44" cy="58" r="16" fill="var(--bg-secondary)" stroke="var(--accent)" stroke-width="1.5" opacity="0.8"/>
          <circle cx="44" cy="58" r="8" fill="var(--accent)" opacity="0.7"/>
          <circle cx="44" cy="58" r="3.5" fill="var(--bg-primary)"/>
          <circle cx="41" cy="55" r="2.5" fill="white" opacity="0.5"/>
          <circle cx="76" cy="58" r="16" fill="var(--bg-secondary)" stroke="var(--accent)" stroke-width="1.5" opacity="0.8"/>
          <circle cx="76" cy="58" r="8" fill="var(--accent)" opacity="0.7"/>
          <circle cx="76" cy="58" r="3.5" fill="var(--bg-primary)"/>
          <circle cx="73" cy="55" r="2.5" fill="white" opacity="0.5"/>
          <path d="M55 78 L60 88 L65 78Z" fill="var(--accent)" opacity="0.6"/>
          <path d="M44 98 L60 106 L76 98" stroke="var(--accent)" stroke-width="1.2" opacity="0.3"/>
        </svg>
      </div>
      <h1>Welcome to Doogle</h1>
      <p>Your node is ready to join the decentralized web. Pick the topics you care about, and Doogle will build a search index tailored to your interests. Each node specializes — together, the network covers everything.</p>
      <p class="wizard-append-note" id="wizard-append-note" style="display:none">You already have indexed data. Running the wizard again will <strong>add</strong> new topics to your existing index — nothing gets deleted.</p>
      <button class="btn btn-primary wizard-begin-btn" id="wizard-begin">Begin Setup</button>
    </div>
  `;
  document.getElementById('wizard-begin').addEventListener('click', () => { currentStep = 1; update(); });

  // Show append note if node already has data
  api.status().then(s => {
    if (s && s.indexed_docs > 0) {
      const note = document.getElementById('wizard-append-note');
      if (note) note.style.display = 'block';
    }
  }).catch(() => {});
}

// ─── Step 1: Node Identity ────────────────────────────
async function renderIdentity(el) {
  el.innerHTML = `<div class="wizard-identity"><div class="wizard-loading">Loading node info...</div></div>`;
  try {
    const s = await api.status();
    const peerId = s.peer_id || 'unknown';
    const truncated = peerId.length > 16 ? peerId.slice(0, 16) + '...' : peerId;
    const nodeName = s.node_name || '';
    const addrs = s.addrs || [];
    const peers = s.connected_peers || 0;

    el.innerHTML = `
      <div class="wizard-identity">
        <h2>Your Node</h2>
        <p class="wizard-subtitle">This is your node's identity on the P2P network.</p>

        <div class="wizard-id-card">
          <div class="wizard-id-row">
            <span class="wizard-id-label">Node Name</span>
            <span class="wizard-id-value">
              <input type="text" id="wizard-node-name" value="${nodeName}" placeholder="Give your node a name..." maxlength="64" class="wizard-name-input">
              <button class="wizard-save-name-btn" id="wizard-save-name" title="Save name" style="display:none">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 8.5 6.5 12 13 4"/></svg>
              </button>
            </span>
          </div>
          <div class="wizard-id-row">
            <span class="wizard-id-label">Peer ID</span>
            <span class="wizard-id-value mono">
              ${truncated}
              <button class="wizard-copy-btn" id="wizard-copy-pid" title="Copy full Peer ID">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5V3.5A1.5 1.5 0 0 1 3.5 2h6A1.5 1.5 0 0 1 11 3.5V5"/></svg>
              </button>
            </span>
          </div>
          <div class="wizard-id-row">
            <span class="wizard-id-label">Addresses</span>
            <span class="wizard-id-value mono" style="font-size:0.82em">${addrs.length > 0 ? addrs.join('<br>') : '<span style="color:var(--text-muted)">None yet</span>'}</span>
          </div>
          <div class="wizard-id-row">
            <span class="wizard-id-label">Connected Peers</span>
            <span class="wizard-id-value">
              <span class="wizard-peer-dot ${peers > 0 ? 'online' : 'offline'}"></span>
              ${peers} peer${peers !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        ${peers === 0 ? `
          <div class="wizard-info-note">
            ${icon('radio', 16)} No peers connected yet. mDNS auto-discovery will find nearby nodes automatically.
          </div>
        ` : ''}
      </div>
    `;
    document.getElementById('wizard-copy-pid').addEventListener('click', () => {
      navigator.clipboard.writeText(peerId).then(() => {
        const btn = document.getElementById('wizard-copy-pid');
        btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="3 8.5 6.5 12 13 4"/></svg>';
        setTimeout(() => {
          btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5V3.5A1.5 1.5 0 0 1 3.5 2h6A1.5 1.5 0 0 1 11 3.5V5"/></svg>';
        }, 1500);
      });
    });

    // Node name editing
    const nameInput = document.getElementById('wizard-node-name');
    const saveBtn = document.getElementById('wizard-save-name');
    let savedName = nodeName;
    nameInput.addEventListener('input', () => {
      saveBtn.style.display = nameInput.value.trim() !== savedName ? 'inline-flex' : 'none';
    });
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      try {
        await api.setNodeName(name);
        savedName = name;
        saveBtn.style.display = 'none';
        saveBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="3 8.5 6.5 12 13 4"/></svg>';
        setTimeout(() => {
          saveBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 8.5 6.5 12 13 4"/></svg>';
        }, 1500);
      } catch { /* ignore */ }
    });
  } catch (err) {
    el.innerHTML = `<div class="wizard-identity"><div class="wizard-error">Failed to load node info: ${err.message}</div></div>`;
  }
}

// ─── Step 2: Choose Focus ─────────────────────────────
function renderFocus(el) {
  const stats = countStats();

  // Count selected per group
  function groupSelectedCount(group) {
    return group.categories.filter(c => selectedCategories.has(c.id)).length;
  }

  el.innerHTML = `
    <div class="wizard-focus">
      <h2>What interests you?</h2>
      <p class="wizard-subtitle">Pick the topics your node will specialize in. Other nodes in the network cover different topics — together you index the whole web.</p>

      <div class="wizard-category-groups" id="wizard-categories">
        ${CATEGORY_GROUPS.map(group => `
          <div class="wizard-group">
            <div class="wizard-group-header" data-group="${group.id}">
              <div class="wizard-group-title">
                ${icon(group.icon, 20)}
                <strong>${group.name}</strong>
                <span class="wizard-group-badge">${groupSelectedCount(group)}/${group.categories.length}</span>
              </div>
              <button class="wizard-group-toggle" data-group-toggle="${group.id}" title="Select all in group">
                ${groupSelectedCount(group) === group.categories.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div class="wizard-group-categories">
              ${group.categories.map(cat => `
                <div class="wizard-category ${selectedCategories.has(cat.id) ? 'selected' : ''}" data-id="${cat.id}">
                  <div class="wizard-category-icon">${icon(cat.icon, 24)}</div>
                  <div class="wizard-category-info">
                    <strong>${cat.name}</strong>
                    <span class="wizard-category-desc">${cat.desc}</span>
                    <span class="wizard-category-count">${cat.seeds.length} seed sites</span>
                  </div>
                  <div class="wizard-category-check">
                    ${selectedCategories.has(cat.id) ? '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="var(--accent)" stroke-width="2.5"><polyline points="3 8.5 6.5 12 13 4"/></svg>' : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="wizard-custom-seeds">
        <h3>Custom Seeds</h3>
        <p class="wizard-subtitle" style="margin-bottom:8px">Add any websites you want your node to crawl. One URL per line.</p>
        <textarea id="wizard-custom-textarea" rows="4" placeholder="https://example.com&#10;https://my-favorite-blog.org&#10;https://local-newspaper.com">${customSeeds}</textarea>
      </div>

      <div class="wizard-seed-total" id="wizard-seed-total">
        ${stats.total} seed${stats.total !== 1 ? 's' : ''} selected from ${stats.catCount} topic${stats.catCount !== 1 ? 's' : ''}
        ${stats.customCount > 0 ? ` + ${stats.customCount} custom` : ''}
      </div>

      ${stats.total > 0 ? `
      <div class="wizard-seed-accordion">
        <button class="wizard-seed-accordion-toggle" id="wizard-seed-toggle">
          <span>Review seed URLs (${stats.total})</span>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 6 8 10 12 6"/></svg>
        </button>
        <div class="wizard-seed-accordion-body" id="wizard-seed-list">
          ${getAllSelectedSeeds().map(url => `
            <div class="wizard-seed-item" data-seed-url="${url.replace(/"/g, '&quot;')}">
              <span class="wizard-seed-url">${url}</span>
              <button class="wizard-seed-remove" data-remove-url="${url.replace(/"/g, '&quot;')}" title="Remove">&times;</button>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    </div>
  `;

  // Category click handlers
  document.querySelectorAll('.wizard-category').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (selectedCategories.has(id)) selectedCategories.delete(id);
      else selectedCategories.add(id);
      renderFocus(el);
      renderNav();
    });
  });

  // Select-all toggle per group
  document.querySelectorAll('.wizard-group-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = btn.dataset.groupToggle;
      const group = CATEGORY_GROUPS.find(g => g.id === groupId);
      if (!group) return;
      const allSelected = group.categories.every(c => selectedCategories.has(c.id));
      group.categories.forEach(c => {
        if (allSelected) selectedCategories.delete(c.id);
        else selectedCategories.add(c.id);
      });
      renderFocus(el);
      renderNav();
    });
  });

  // Custom seeds textarea
  const textarea = document.getElementById('wizard-custom-textarea');
  textarea.addEventListener('input', () => {
    customSeeds = textarea.value;
    const s = countStats();
    const totalEl = document.getElementById('wizard-seed-total');
    if (totalEl) {
      totalEl.textContent = `${s.total} seed${s.total !== 1 ? 's' : ''} selected from ${s.catCount} topic${s.catCount !== 1 ? 's' : ''}${s.customCount > 0 ? ` + ${s.customCount} custom` : ''}`;
    }
    renderNav();
  });

  // Seed accordion toggle
  const toggleBtn = document.getElementById('wizard-seed-toggle');
  const seedList = document.getElementById('wizard-seed-list');
  if (toggleBtn && seedList) {
    toggleBtn.addEventListener('click', () => {
      const open = seedList.classList.toggle('open');
      toggleBtn.classList.toggle('open', open);
    });
  }

  // Remove individual seeds
  document.querySelectorAll('.wizard-seed-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.removeUrl;
      removedSeeds.add(url);
      renderFocus(el);
      renderNav();
    });
  });
}

// ─── Step 3: Tune Settings ────────────────────────────
async function renderSettings(el) {
  // Pull actual config from the running node
  try {
    const info = await api.crawlerStatus();
    if (info) {
      if (info.max_depth) settings.depth = Math.min(5, Math.max(1, info.max_depth));
      if (info.workers) settings.workers = Math.min(8, Math.max(1, info.workers));
    }
  } catch { /* use defaults */ }
  const est = Math.round(growthEstimate());
  const seeds = getAllSelectedSeeds();

  el.innerHTML = `
    <div class="wizard-settings">
      <h2>Tune Settings</h2>
      <p class="wizard-subtitle">These reflect your node's current configuration.</p>

      <div class="wizard-setting">
        <label>Crawl Depth: <strong id="depth-val">${settings.depth}</strong></label>
        <input type="range" min="1" max="5" value="${settings.depth}" id="wizard-depth">
        <span class="wizard-setting-desc" id="depth-desc">${DEPTH_DESCRIPTIONS[settings.depth]}</span>
      </div>

      <div class="wizard-setting">
        <label>Workers: <strong id="workers-val">${settings.workers}</strong></label>
        <input type="range" min="1" max="8" value="${settings.workers}" id="wizard-workers">
        <span class="wizard-setting-desc" id="workers-desc">${workersDesc(settings.workers)}</span>
      </div>

      <div class="wizard-estimate-card">
        <div class="wizard-estimate-label">Growth Estimate</div>
        <div class="wizard-estimate-value">~${est.toLocaleString()} pages</div>
        <div class="wizard-estimate-sub">With ${seeds.length} seeds at depth ${settings.depth} using ${settings.workers} workers, in the first hour</div>
      </div>

      <div class="wizard-info-note">
        ${icon('alertTriangle', 16)} Settings are informational only. Changing them here does not modify the running node config.
      </div>
    </div>
  `;

  document.getElementById('wizard-depth').addEventListener('input', e => {
    settings.depth = parseInt(e.target.value);
    document.getElementById('depth-val').textContent = settings.depth;
    document.getElementById('depth-desc').textContent = DEPTH_DESCRIPTIONS[settings.depth];
    updateEstimate();
  });

  document.getElementById('wizard-workers').addEventListener('input', e => {
    settings.workers = parseInt(e.target.value);
    document.getElementById('workers-val').textContent = settings.workers;
    document.getElementById('workers-desc').textContent = workersDesc(settings.workers);
    updateEstimate();
  });

  function updateEstimate() {
    const est = Math.round(growthEstimate());
    const s = getAllSelectedSeeds();
    const valEl = document.querySelector('.wizard-estimate-value');
    const subEl = document.querySelector('.wizard-estimate-sub');
    if (valEl) valEl.textContent = `~${est.toLocaleString()} pages`;
    if (subEl) subEl.textContent = `With ${s.length} seeds at depth ${settings.depth} using ${settings.workers} workers, in the first hour`;
  }
}

function workersDesc(n) {
  if (n <= 2) return 'Low — minimal resource usage';
  if (n <= 4) return 'Moderate — balanced performance';
  if (n <= 6) return 'High — faster crawl, more CPU/memory';
  return 'Maximum — heavy resource usage';
}

// ─── Step 4: Launch & Watch ───────────────────────────
async function renderLaunch(el) {
  const seeds = getAllSelectedSeeds();
  const topicNames = CATEGORIES.filter(c => selectedCategories.has(c.id)).map(c => c.name);

  el.innerHTML = `
    <div class="wizard-launch">
      <h2>Launch</h2>
      ${topicNames.length > 0 ? `<p class="wizard-launch-topics">Specializing in: <strong>${topicNames.join(', ')}</strong></p>` : ''}
      <div class="wizard-launch-status" id="wizard-launch-status">Adding ${seeds.length} seeds to crawl queue...</div>
      <div class="wizard-progress-bar"><div class="wizard-progress-fill" id="wizard-progress-fill" style="width:0%"></div></div>
      <div class="wizard-counters" id="wizard-counters">
        <div class="wizard-counter">
          <div class="wizard-counter-value" id="wc-crawled">0</div>
          <div class="wizard-counter-label">Crawled</div>
        </div>
        <div class="wizard-counter">
          <div class="wizard-counter-value" id="wc-indexed">0</div>
          <div class="wizard-counter-label">Indexed</div>
        </div>
        <div class="wizard-counter">
          <div class="wizard-counter-value" id="wc-queue">0</div>
          <div class="wizard-counter-label">In Queue</div>
        </div>
      </div>
      <div class="wizard-launch-actions" id="wizard-launch-actions" style="display:none">
        <button class="btn btn-primary" id="wizard-go-search">Go to Search</button>
        <a href="#/admin" class="wizard-admin-link">View Admin Dashboard</a>
      </div>
    </div>
  `;

  // Submit seeds
  try {
    await api.crawlBatch(seeds);
  } catch {
    // Fallback to individual calls
    for (const url of seeds) {
      try { await api.addSeed(url); } catch { /* skip */ }
    }
  }

  const statusEl = document.getElementById('wizard-launch-status');
  if (statusEl) statusEl.textContent = 'Crawling...';

  // Start polling
  let ready = false;
  pollInterval = setInterval(async () => {
    try {
      const s = await api.status();
      const crawledEl = document.getElementById('wc-crawled');
      const indexedEl = document.getElementById('wc-indexed');
      const queueEl = document.getElementById('wc-queue');
      const fillEl = document.getElementById('wizard-progress-fill');
      const statusEl = document.getElementById('wizard-launch-status');
      const actionsEl = document.getElementById('wizard-launch-actions');

      if (crawledEl) crawledEl.textContent = (s.crawled_urls || 0).toLocaleString();
      if (indexedEl) indexedEl.textContent = (s.indexed_docs || 0).toLocaleString();
      if (queueEl) queueEl.textContent = (s.urls_in_queue || 0).toLocaleString();

      const pct = seeds.length > 0 ? Math.min(100, Math.round(((s.crawled_urls || 0) / seeds.length) * 100)) : 0;
      if (fillEl) fillEl.style.width = pct + '%';

      if (s.indexed_docs > 0 && !ready) {
        ready = true;
        if (statusEl) statusEl.textContent = 'Your node is ready!';
        if (actionsEl) actionsEl.style.display = 'flex';
      }
    } catch { /* ignore polling errors */ }
  }, 2000);

  window._pageInterval = pollInterval;

  // Defer event binding to after DOM is rendered
  setTimeout(() => {
    const goBtn = document.getElementById('wizard-go-search');
    if (goBtn) {
      goBtn.addEventListener('click', () => {
        localStorage.setItem('doogle_wizard_dismissed', 'true');
        window.location.hash = '#/search';
      });
    }
  }, 0);
}
