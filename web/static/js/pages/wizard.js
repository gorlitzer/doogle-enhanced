// Doogle v2 — Onboarding Wizard
import { api } from '../api.js';
import { icon } from '../components.js';
import { animateElement } from '../logo-animation.js';

let currentStep = 0;
let cleanupDoogleAnim = null;
const selectedSubs = new Set();
const removedSeeds = new Set();
let customSeeds = '';
let settings = { depth: 3, workers: 4 };
let pollInterval = null;
const expandedCategories = new Set();

// ─── Category Groups with Subcategories ─────────────
const CATEGORY_GROUPS = [
  {
    id: 'knowledge', name: 'Knowledge & Learning', icon: 'fileText',
    categories: [
      {
        id: 'education', name: 'Education', icon: 'fileText',
        desc: 'Online courses, encyclopedias, and academic resources',
        subcategories: [
          { id: 'education-k12', name: 'K-12', seeds: [
            { url: 'https://www.khanacademy.org', label: 'Khan Academy' },
            { url: 'https://www.ck12.org', label: 'CK-12' },
            { url: 'https://www.education.com', label: 'Education.com' },
          ]},
          { id: 'education-higher', name: 'Higher Ed', seeds: [
            { url: 'https://ocw.mit.edu', label: 'MIT OpenCourseWare' },
            { url: 'https://www.edx.org', label: 'edX' },
            { url: 'https://www.britannica.com', label: 'Britannica' },
          ]},
          { id: 'education-online', name: 'Online Learning', seeds: [
            { url: 'https://www.coursera.org', label: 'Coursera' },
            { url: 'https://en.wikipedia.org', label: 'Wikipedia' },
            { url: 'https://stackoverflow.com', label: 'Stack Overflow' },
          ]},
          { id: 'education-languages', name: 'Languages', seeds: [
            { url: 'https://www.duolingo.com', label: 'Duolingo' },
            { url: 'https://www.babbel.com', label: 'Babbel' },
          ]},
        ],
      },
      {
        id: 'science', name: 'Science & Research', icon: 'cpu',
        desc: 'Scientific papers, journals, and research databases',
        subcategories: [
          { id: 'science-physics', name: 'Physics', seeds: [
            { url: 'https://arxiv.org', label: 'arXiv' },
            { url: 'https://www.aps.org', label: 'APS Physics' },
            { url: 'https://home.cern', label: 'CERN' },
          ]},
          { id: 'science-biology', name: 'Biology', seeds: [
            { url: 'https://pubmed.ncbi.nlm.nih.gov', label: 'PubMed' },
            { url: 'https://www.nature.com', label: 'Nature' },
            { url: 'https://www.science.org', label: 'Science' },
          ]},
          { id: 'science-chemistry', name: 'Chemistry', seeds: [
            { url: 'https://www.acs.org', label: 'ACS' },
            { url: 'https://www.rsc.org', label: 'Royal Society of Chemistry' },
          ]},
          { id: 'science-math', name: 'Mathematics', seeds: [
            { url: 'https://mathworld.wolfram.com', label: 'MathWorld' },
            { url: 'https://www.ams.org', label: 'AMS' },
          ]},
          { id: 'science-earth', name: 'Earth Science', seeds: [
            { url: 'https://www.nasa.gov', label: 'NASA' },
            { url: 'https://www.scientificamerican.com', label: 'Scientific American' },
          ]},
        ],
      },
      {
        id: 'news', name: 'News & Journalism', icon: 'megaphone',
        desc: 'World news, investigative reporting, and current events',
        subcategories: [
          { id: 'news-world', name: 'World News', seeds: [
            { url: 'https://www.reuters.com', label: 'Reuters' },
            { url: 'https://apnews.com', label: 'AP News' },
            { url: 'https://www.bbc.com/news', label: 'BBC News' },
          ]},
          { id: 'news-tech', name: 'Tech News', seeds: [
            { url: 'https://www.theverge.com', label: 'The Verge' },
            { url: 'https://arstechnica.com', label: 'Ars Technica' },
          ]},
          { id: 'news-business', name: 'Business', seeds: [
            { url: 'https://www.ft.com', label: 'Financial Times' },
            { url: 'https://www.bloomberg.com', label: 'Bloomberg' },
          ]},
          { id: 'news-investigative', name: 'Investigative', seeds: [
            { url: 'https://www.theguardian.com', label: 'The Guardian' },
            { url: 'https://www.npr.org', label: 'NPR' },
            { url: 'https://www.aljazeera.com', label: 'Al Jazeera' },
          ]},
        ],
      },
      {
        id: 'history', name: 'History & Culture', icon: 'globe',
        desc: 'Museums, archives, cultural heritage, and world history',
        subcategories: [
          { id: 'history-ancient', name: 'Ancient', seeds: [
            { url: 'https://www.britishmuseum.org', label: 'British Museum' },
            { url: 'https://www.metmuseum.org', label: 'Met Museum' },
            { url: 'https://www.history.com', label: 'History.com' },
          ]},
          { id: 'history-modern', name: 'Modern', seeds: [
            { url: 'https://www.smithsonianmag.com', label: 'Smithsonian' },
            { url: 'https://www.loc.gov', label: 'Library of Congress' },
          ]},
          { id: 'history-heritage', name: 'Cultural Heritage', seeds: [
            { url: 'https://whc.unesco.org', label: 'UNESCO World Heritage' },
            { url: 'https://archive.org', label: 'Internet Archive' },
          ]},
        ],
      },
    ],
  },
  {
    id: 'lifestyle', name: 'Lifestyle & Wellbeing', icon: 'heart',
    categories: [
      {
        id: 'health', name: 'Health & Medicine', icon: 'heart',
        desc: 'Medical information, wellness guides, and health research',
        subcategories: [
          { id: 'health-medical', name: 'Medical', seeds: [
            { url: 'https://www.who.int', label: 'WHO' },
            { url: 'https://www.mayoclinic.org', label: 'Mayo Clinic' },
            { url: 'https://www.nih.gov', label: 'NIH' },
          ]},
          { id: 'health-fitness', name: 'Fitness', seeds: [
            { url: 'https://www.healthline.com', label: 'Healthline' },
            { url: 'https://www.runnersworld.com', label: "Runner's World" },
          ]},
          { id: 'health-mental', name: 'Mental Health', seeds: [
            { url: 'https://www.nimh.nih.gov', label: 'NIMH' },
            { url: 'https://www.psychologytoday.com', label: 'Psychology Today' },
          ]},
          { id: 'health-nutrition', name: 'Nutrition', seeds: [
            { url: 'https://www.webmd.com', label: 'WebMD' },
            { url: 'https://medlineplus.gov', label: 'MedlinePlus' },
          ]},
        ],
      },
      {
        id: 'food', name: 'Food & Cooking', icon: 'coffee',
        desc: 'Recipes, cooking techniques, and food culture',
        subcategories: [
          { id: 'food-recipes', name: 'Recipes', seeds: [
            { url: 'https://www.allrecipes.com', label: 'AllRecipes' },
            { url: 'https://www.seriouseats.com', label: 'Serious Eats' },
            { url: 'https://www.simplyrecipes.com', label: 'Simply Recipes' },
          ]},
          { id: 'food-restaurant', name: 'Restaurant', seeds: [
            { url: 'https://www.bonappetit.com', label: 'Bon Appétit' },
            { url: 'https://www.epicurious.com', label: 'Epicurious' },
          ]},
          { id: 'food-science', name: 'Food Science', seeds: [
            { url: 'https://www.bbcgoodfood.com', label: 'BBC Good Food' },
            { url: 'https://www.foodnetwork.com', label: 'Food Network' },
          ]},
        ],
      },
      {
        id: 'sports', name: 'Sports & Fitness', icon: 'trendingUp',
        desc: 'Sports news, fitness guides, and athletic training',
        subcategories: [
          { id: 'sports-team', name: 'Team Sports', seeds: [
            { url: 'https://www.espn.com', label: 'ESPN' },
            { url: 'https://www.nba.com', label: 'NBA' },
            { url: 'https://www.fifa.com', label: 'FIFA' },
          ]},
          { id: 'sports-individual', name: 'Individual', seeds: [
            { url: 'https://olympics.com', label: 'Olympics' },
            { url: 'https://www.bbc.com/sport', label: 'BBC Sport' },
          ]},
          { id: 'sports-esports', name: 'Esports', seeds: [
            { url: 'https://www.hltv.org', label: 'HLTV' },
            { url: 'https://liquipedia.net', label: 'Liquipedia' },
          ]},
          { id: 'sports-outdoor', name: 'Outdoor', seeds: [
            { url: 'https://www.runnersworld.com', label: "Runner's World" },
            { url: 'https://www.outsideonline.com', label: 'Outside' },
          ]},
        ],
      },
      {
        id: 'travel', name: 'Travel & Geography', icon: 'mapPin',
        desc: 'Travel guides, destinations, and geographic exploration',
        subcategories: [
          { id: 'travel-destinations', name: 'Destinations', seeds: [
            { url: 'https://www.lonelyplanet.com', label: 'Lonely Planet' },
            { url: 'https://www.nationalgeographic.com', label: 'Nat Geo' },
            { url: 'https://www.tripadvisor.com', label: 'TripAdvisor' },
          ]},
          { id: 'travel-backpacking', name: 'Backpacking', seeds: [
            { url: 'https://www.worldnomads.com', label: 'World Nomads' },
            { url: 'https://www.atlasobscura.com', label: 'Atlas Obscura' },
          ]},
          { id: 'travel-tech', name: 'Travel Tech', seeds: [
            { url: 'https://wikitravel.org', label: 'Wikitravel' },
            { url: 'https://www.rome2rio.com', label: 'Rome2Rio' },
          ]},
        ],
      },
    ],
  },
  {
    id: 'creative', name: 'Creative & Entertainment', icon: 'monitor',
    categories: [
      {
        id: 'arts', name: 'Arts & Design', icon: 'image',
        desc: 'Visual arts, graphic design, illustration, and museums',
        subcategories: [
          { id: 'arts-visual', name: 'Visual Arts', seeds: [
            { url: 'https://www.moma.org', label: 'MoMA' },
            { url: 'https://www.artsy.net', label: 'Artsy' },
            { url: 'https://www.metmuseum.org', label: 'Met Museum' },
          ]},
          { id: 'arts-film', name: 'Film', seeds: [
            { url: 'https://www.imdb.com', label: 'IMDb' },
            { url: 'https://letterboxd.com', label: 'Letterboxd' },
          ]},
          { id: 'arts-photography', name: 'Photography', seeds: [
            { url: 'https://www.deviantart.com', label: 'DeviantArt' },
            { url: 'https://500px.com', label: '500px' },
          ]},
          { id: 'arts-design', name: 'Design', seeds: [
            { url: 'https://www.behance.net', label: 'Behance' },
            { url: 'https://dribbble.com', label: 'Dribbble' },
          ]},
        ],
      },
      {
        id: 'music', name: 'Music', icon: 'music',
        desc: 'Music discovery, streaming, theory, and production',
        subcategories: [
          { id: 'music-streaming', name: 'Streaming', seeds: [
            { url: 'https://bandcamp.com', label: 'Bandcamp' },
            { url: 'https://soundcloud.com', label: 'SoundCloud' },
          ]},
          { id: 'music-theory', name: 'Theory', seeds: [
            { url: 'https://www.musictheory.net', label: 'MusicTheory.net' },
            { url: 'https://www.hooktheory.com', label: 'Hooktheory' },
          ]},
          { id: 'music-production', name: 'Production', seeds: [
            { url: 'https://www.soundonsound.com', label: 'Sound On Sound' },
            { url: 'https://www.gearslutz.com', label: 'Gearspace' },
          ]},
          { id: 'music-news', name: 'News & Reviews', seeds: [
            { url: 'https://pitchfork.com', label: 'Pitchfork' },
            { url: 'https://www.rollingstone.com', label: 'Rolling Stone' },
            { url: 'https://www.discogs.com', label: 'Discogs' },
          ]},
        ],
      },
      {
        id: 'books', name: 'Books & Literature', icon: 'bookOpen',
        desc: 'Book reviews, literary archives, and digital libraries',
        subcategories: [
          { id: 'books-reviews', name: 'Reviews', seeds: [
            { url: 'https://www.goodreads.com', label: 'Goodreads' },
            { url: 'https://lithub.com', label: 'Literary Hub' },
          ]},
          { id: 'books-authors', name: 'Authors & Poetry', seeds: [
            { url: 'https://www.poetryfoundation.org', label: 'Poetry Foundation' },
            { url: 'https://www.penguinrandomhouse.com', label: 'Penguin Random House' },
          ]},
          { id: 'books-libraries', name: 'Libraries', seeds: [
            { url: 'https://openlibrary.org', label: 'Open Library' },
            { url: 'https://www.gutenberg.org', label: 'Project Gutenberg' },
            { url: 'https://www.loc.gov', label: 'Library of Congress' },
          ]},
        ],
      },
      {
        id: 'gaming', name: 'Gaming', icon: 'monitor',
        desc: 'Game reviews, industry news, and gaming communities',
        subcategories: [
          { id: 'gaming-pc', name: 'PC', seeds: [
            { url: 'https://store.steampowered.com', label: 'Steam' },
            { url: 'https://www.pcgamer.com', label: 'PC Gamer' },
          ]},
          { id: 'gaming-console', name: 'Console', seeds: [
            { url: 'https://www.ign.com', label: 'IGN' },
            { url: 'https://www.gamespot.com', label: 'GameSpot' },
          ]},
          { id: 'gaming-indie', name: 'Indie', seeds: [
            { url: 'https://itch.io', label: 'itch.io' },
            { url: 'https://www.polygon.com', label: 'Polygon' },
          ]},
          { id: 'gaming-dev', name: 'Game Dev', seeds: [
            { url: 'https://www.gamedeveloper.com', label: 'Game Developer' },
            { url: 'https://unity.com', label: 'Unity' },
          ]},
        ],
      },
    ],
  },
  {
    id: 'technology', name: 'Technology & Development', icon: 'code',
    categories: [
      {
        id: 'tech', name: 'Programming', icon: 'code',
        desc: 'Language docs, tutorials, and developer resources',
        subcategories: [
          { id: 'tech-aiml', name: 'AI / ML', seeds: [
            { url: 'https://huggingface.co', label: 'Hugging Face' },
            { url: 'https://pytorch.org', label: 'PyTorch' },
            { url: 'https://www.tensorflow.org', label: 'TensorFlow' },
          ]},
          { id: 'tech-security', name: 'Cybersecurity', seeds: [
            { url: 'https://owasp.org', label: 'OWASP' },
            { url: 'https://www.schneier.com', label: 'Schneier on Security' },
          ]},
          { id: 'tech-hardware', name: 'Hardware', seeds: [
            { url: 'https://www.anandtech.com', label: 'AnandTech' },
            { url: 'https://www.tomshardware.com', label: "Tom's Hardware" },
          ]},
          { id: 'tech-mobile', name: 'Mobile', seeds: [
            { url: 'https://developer.android.com', label: 'Android Dev' },
            { url: 'https://developer.apple.com', label: 'Apple Dev' },
          ]},
        ],
      },
      {
        id: 'opensource', name: 'Open Source', icon: 'network',
        desc: 'Open-source projects, communities, and foundations',
        subcategories: [
          { id: 'opensource-projects', name: 'Projects', seeds: [
            { url: 'https://github.com/trending', label: 'GitHub Trending' },
            { url: 'https://sr.ht', label: 'Sourcehut' },
            { url: 'https://codeberg.org', label: 'Codeberg' },
          ]},
          { id: 'opensource-communities', name: 'Communities', seeds: [
            { url: 'https://opensource.org', label: 'OSI' },
            { url: 'https://www.fsf.org', label: 'FSF' },
          ]},
          { id: 'opensource-tools', name: 'Tools', seeds: [
            { url: 'https://gitlab.com', label: 'GitLab' },
            { url: 'https://forgejo.org', label: 'Forgejo' },
          ]},
          { id: 'opensource-foundations', name: 'Foundations', seeds: [
            { url: 'https://apache.org', label: 'Apache' },
            { url: 'https://www.linuxfoundation.org', label: 'Linux Foundation' },
          ]},
        ],
      },
      {
        id: 'infra', name: 'Cloud & DevOps', icon: 'database',
        desc: 'Infrastructure, databases, containers, and monitoring',
        subcategories: [
          { id: 'infra-cloud', name: 'Cloud', seeds: [
            { url: 'https://kubernetes.io/docs/', label: 'Kubernetes' },
            { url: 'https://docs.docker.com', label: 'Docker' },
          ]},
          { id: 'infra-devops', name: 'DevOps', seeds: [
            { url: 'https://prometheus.io/docs/', label: 'Prometheus' },
            { url: 'https://nginx.com', label: 'Nginx' },
          ]},
          { id: 'infra-networking', name: 'Networking', seeds: [
            { url: 'https://www.cloudflare.com/learning/', label: 'Cloudflare Learning' },
            { url: 'https://www.wireguard.com', label: 'WireGuard' },
          ]},
          { id: 'infra-databases', name: 'Databases', seeds: [
            { url: 'https://redis.io/docs/', label: 'Redis' },
            { url: 'https://www.postgresql.org/docs/', label: 'PostgreSQL' },
          ]},
        ],
      },
      {
        id: 'webdev', name: 'Web & Frontend', icon: 'globe',
        desc: 'Web standards, frameworks, CSS, and browser APIs',
        subcategories: [
          { id: 'webdev-frontend', name: 'Frontend', seeds: [
            { url: 'https://developer.mozilla.org', label: 'MDN' },
            { url: 'https://web.dev', label: 'web.dev' },
            { url: 'https://css-tricks.com', label: 'CSS-Tricks' },
          ]},
          { id: 'webdev-backend', name: 'Backend', seeds: [
            { url: 'https://go.dev', label: 'Go' },
            { url: 'https://docs.python.org/3/', label: 'Python' },
            { url: 'https://www.rust-lang.org', label: 'Rust' },
          ]},
          { id: 'webdev-frameworks', name: 'Frameworks', seeds: [
            { url: 'https://reactjs.org', label: 'React' },
            { url: 'https://vuejs.org', label: 'Vue' },
            { url: 'https://svelte.dev', label: 'Svelte' },
          ]},
          { id: 'webdev-apis', name: 'APIs & Tools', seeds: [
            { url: 'https://htmx.org', label: 'htmx' },
            { url: 'https://tailwindcss.com', label: 'Tailwind' },
            { url: 'https://nextjs.org', label: 'Next.js' },
          ]},
        ],
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
    for (const sub of cat.subcategories) {
      if (selectedSubs.has(sub.id)) {
        seeds.push(...sub.seeds.map(s => s.url));
      }
    }
  }
  const custom = customSeeds.split('\n').map(s => s.trim()).filter(s => s.startsWith('http://') || s.startsWith('https://'));
  seeds.push(...custom);
  return [...new Set(seeds)].filter(s => !removedSeeds.has(s));
}

function countStats() {
  const seeds = getAllSelectedSeeds();
  const catCount = CATEGORIES.filter(c => c.subcategories.some(s => selectedSubs.has(s.id))).length;
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

// Category selection state helpers
function catSelectionState(cat) {
  const total = cat.subcategories.length;
  const selected = cat.subcategories.filter(s => selectedSubs.has(s.id)).length;
  if (selected === 0) return 'none';
  if (selected === total) return 'full';
  return 'partial';
}

function toggleAllSubs(cat) {
  const state = catSelectionState(cat);
  if (state === 'full') {
    cat.subcategories.forEach(s => selectedSubs.delete(s.id));
  } else {
    cat.subcategories.forEach(s => selectedSubs.add(s.id));
  }
}

function totalSubsInGroup(group) {
  return group.categories.reduce((n, c) => n + c.subcategories.length, 0);
}

function selectedSubsInGroup(group) {
  return group.categories.reduce((n, c) => n + c.subcategories.filter(s => selectedSubs.has(s.id)).length, 0);
}

export function renderWizard(container) {
  currentStep = 0;
  selectedSubs.clear();
  removedSeeds.clear();
  expandedCategories.clear();
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
  if (currentStep === 0 || currentStep === 4) {
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
  if (cleanupDoogleAnim) { cleanupDoogleAnim(); cleanupDoogleAnim = null; }

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
      <h1>Welcome to <a href="#/" class="wizard-doogle-link" id="wizard-doogle">Doogle</a></h1>
      <p>Your node is ready to join the decentralized web. Pick the topics you care about, and Doogle will build a search index tailored to your interests. Each node specializes — together, the network covers everything.</p>
      <p class="wizard-append-note" id="wizard-append-note" style="display:none">You already have indexed data. Running the wizard again will <strong>add</strong> new topics to your existing index — nothing gets deleted.</p>
      <button class="btn btn-primary wizard-begin-btn" id="wizard-begin">Begin Setup</button>
    </div>
  `;
  document.getElementById('wizard-begin').addEventListener('click', () => { currentStep = 1; update(); });

  const doogleEl = document.getElementById('wizard-doogle');
  if (doogleEl) cleanupDoogleAnim = animateElement(doogleEl, 'Doogle');

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

  el.innerHTML = `
    <div class="wizard-focus">
      <h2>What interests you?</h2>
      <p class="wizard-subtitle">Pick the topics your node will specialize in. Click a category to expand its sub-topics.</p>

      <div class="wizard-category-groups" id="wizard-categories">
        ${CATEGORY_GROUPS.map(group => `
          <div class="wizard-group">
            <div class="wizard-group-header" data-group="${group.id}">
              <div class="wizard-group-title">
                ${icon(group.icon, 20)}
                <strong>${group.name}</strong>
                <span class="wizard-group-badge">${selectedSubsInGroup(group)}/${totalSubsInGroup(group)}</span>
              </div>
              <button class="wizard-group-toggle" data-group-toggle="${group.id}" title="Select all in group">
                ${selectedSubsInGroup(group) === totalSubsInGroup(group) ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div class="wizard-group-categories">
              ${group.categories.map(cat => {
                const state = catSelectionState(cat);
                const isExpanded = expandedCategories.has(cat.id);
                const selectedCount = cat.subcategories.filter(s => selectedSubs.has(s.id)).length;
                return `
                <div class="wizard-category ${state !== 'none' ? 'selected' : ''} ${state === 'partial' ? 'partial' : ''} ${isExpanded ? 'expanded' : ''}" data-id="${cat.id}">
                  <div class="wizard-category-header" data-cat-id="${cat.id}">
                    <div class="wizard-category-icon">${icon(cat.icon, 24)}</div>
                    <div class="wizard-category-info">
                      <strong>${cat.name}</strong>
                      <span class="wizard-category-desc">${cat.desc}</span>
                      <span class="wizard-category-count">${cat.subcategories.length} sub-topics · ${selectedCount} selected</span>
                    </div>
                    <div class="wizard-category-expand">
                      <span class="wizard-expand-chevron ${isExpanded ? 'open' : ''}">${icon('chevronDown', 16)}</span>
                    </div>
                  </div>
                  ${isExpanded ? `
                  <div class="wizard-sub-pills">
                    ${cat.subcategories.map(sub => `
                      <button class="wizard-sub-pill ${selectedSubs.has(sub.id) ? 'selected' : ''}" data-sub-id="${sub.id}" title="${sub.seeds.map(s => s.label).join(', ')}">
                        ${selectedSubs.has(sub.id) ? '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="2 6.5 4.5 9 10 3"/></svg>' : ''}
                        ${sub.name}
                        <span class="wizard-sub-pill-count">${sub.seeds.length}</span>
                      </button>
                    `).join('')}
                  </div>
                  <div class="wizard-sub-sources">
                    ${cat.subcategories.filter(s => selectedSubs.has(s.id)).flatMap(s => s.seeds.map(seed => seed.label)).join(' · ') || 'No sources selected'}
                  </div>
                  ` : ''}
                </div>
              `;
              }).join('')}
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
          ${renderSeedAccordionGrouped()}
        </div>
      </div>
      ` : ''}
    </div>
  `;

  // Category header click → toggle expand
  document.querySelectorAll('.wizard-category-header').forEach(header => {
    header.addEventListener('click', () => {
      const catId = header.dataset.catId;
      if (expandedCategories.has(catId)) {
        expandedCategories.delete(catId);
      } else {
        expandedCategories.add(catId);
      }
      renderFocus(el);
      renderNav();
    });
  });

  // Subcategory pill click → toggle individual sub
  document.querySelectorAll('.wizard-sub-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const subId = pill.dataset.subId;
      if (selectedSubs.has(subId)) selectedSubs.delete(subId);
      else selectedSubs.add(subId);
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
      const allSelected = selectedSubsInGroup(group) === totalSubsInGroup(group);
      group.categories.forEach(c => {
        c.subcategories.forEach(s => {
          if (allSelected) selectedSubs.delete(s.id);
          else selectedSubs.add(s.id);
        });
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

function renderSeedAccordionGrouped() {
  const sections = [];
  for (const cat of CATEGORIES) {
    const activeSubs = cat.subcategories.filter(s => selectedSubs.has(s.id));
    if (activeSubs.length === 0) continue;
    const seedItems = activeSubs.flatMap(sub =>
      sub.seeds.filter(s => !removedSeeds.has(s.url)).map(s => `
        <div class="wizard-seed-item" data-seed-url="${s.url.replace(/"/g, '&quot;')}">
          <span class="wizard-seed-url">${s.label} — ${s.url}</span>
          <button class="wizard-seed-remove" data-remove-url="${s.url.replace(/"/g, '&quot;')}" title="Remove">&times;</button>
        </div>
      `)
    );
    if (seedItems.length > 0) {
      sections.push(`
        <div class="wizard-seed-group-label">${cat.name}</div>
        ${seedItems.join('')}
      `);
    }
  }
  // Custom seeds
  const custom = customSeeds.split('\n').map(s => s.trim()).filter(s => (s.startsWith('http://') || s.startsWith('https://')) && !removedSeeds.has(s));
  if (custom.length > 0) {
    sections.push(`
      <div class="wizard-seed-group-label">Custom</div>
      ${custom.map(url => `
        <div class="wizard-seed-item" data-seed-url="${url.replace(/"/g, '&quot;')}">
          <span class="wizard-seed-url">${url}</span>
          <button class="wizard-seed-remove" data-remove-url="${url.replace(/"/g, '&quot;')}" title="Remove">&times;</button>
        </div>
      `).join('')}
    `);
  }
  return sections.join('');
}

// ─── Step 3: Tune Settings ────────────────────────────
async function renderSettings(el) {
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
  const topicNames = CATEGORIES.filter(c => c.subcategories.some(s => selectedSubs.has(s.id))).map(c => c.name);

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

  try {
    await api.crawlBatch(seeds);
  } catch {
    for (const url of seeds) {
      try { await api.addSeed(url); } catch { /* skip */ }
    }
  }

  const statusEl = document.getElementById('wizard-launch-status');
  if (statusEl) statusEl.textContent = 'Crawling...';

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
