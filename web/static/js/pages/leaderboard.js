// Doogle v2 — WebExplorers Leaderboard (Visual Redesign)
import { api } from '../api.js';
import { icon, getCSS, hexToRgba, escapeHtml } from '../components.js';
import { formatNum } from '../spotlight.js';

/* ── State ── */
let firstLoad = true;
let particleSystem = null;

/* ── Utilities ── */
function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dracula';
}

function shortPeer(id) {
  if (!id) return 'Unknown';
  return id.slice(0, 8) + '...' + id.slice(-6);
}

function animateCounter(el, target) {
  const theme = getTheme();
  const duration = theme === 'crt' ? 800 : 1200;
  const start = performance.now();

  function update(now) {
    const t = Math.min((now - start) / duration, 1);
    let value;
    if (theme === 'crt') {
      if (t < 0.7) {
        value = Math.floor(Math.random() * target * 1.5);
      } else {
        const settle = (t - 0.7) / 0.3;
        value = Math.round(target * settle + Math.random() * target * (1 - settle) * 0.3);
      }
    } else {
      const ease = 1 - Math.pow(1 - t, 3);
      value = Math.round(ease * target);
    }
    el.textContent = value.toLocaleString();
    if (t < 1) requestAnimationFrame(update);
    else el.textContent = target.toLocaleString();
  }
  requestAnimationFrame(update);
}

function trustBadge(score) {
  const svgAttrs = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  if (score >= 0.8) {
    const svg = `<svg ${svgAttrs}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`;
    return `<span class="trust-badge"><span class="badge badge-green">${svg} Trusted</span><span class="trust-tooltip">Trusted<span class="trust-tooltip-desc">Consistently reliable peer with quality contributions.</span></span></span>`;
  }
  if (score >= 0.6) {
    const svg = `<svg ${svgAttrs}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    return `<span class="trust-badge"><span class="badge badge-blue">${svg} Good</span><span class="trust-tooltip">Good<span class="trust-tooltip-desc">Good standing with a solid contribution history.</span></span></span>`;
  }
  if (score > 0.4) {
    const svg = `<svg ${svgAttrs}><path d="M12 20V10"/><path d="M8 16c0-3 2-5 4-8"/><path d="M16 16c0-3-2-5-4-8"/></svg>`;
    return `<span class="trust-badge"><span class="badge badge-amber">${svg} New</span><span class="trust-tooltip">New<span class="trust-tooltip-desc">Recently joined the network, still building reputation.</span></span></span>`;
  }
  const svg = `<svg ${svgAttrs}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  return `<span class="trust-badge"><span class="badge badge-red">${svg} Low</span><span class="trust-tooltip">Low<span class="trust-tooltip-desc">Low trust score — contributions may be unreliable.</span></span></span>`;
}

function formatDate(d) {
  if (!d || d === '0001-01-01T00:00:00Z') return '-';
  return new Date(d).toLocaleDateString();
}

/* ── Crown SVG for gold medal ── */
const crownSVG = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="M4 20V10l4 4 4-8 4 8 4-4v10"/></svg>`;

/* ── Particle System ── */
const PARTICLE_CONFIGS = {
  dracula:  { count: 35, colors: null, glow: true,  glowR: 8, connect: false, digital: false, rain: false, moteStyle: false },
  crt:      { count: 30, colors: ['#33ff33'], glow: true, glowR: 6, connect: false, digital: true, rain: false, moteStyle: false },
  modern:   { count: 40, colors: null, glow: false, glowR: 0, connect: true, digital: false, rain: false, moteStyle: false, connectDist: 100 },
  light:    { count: 25, colors: null, glow: false, glowR: 0, connect: false, digital: false, rain: false, moteStyle: true },
  storm:    { count: 35, colors: ['#7eb8da','#c0e8ff'], glow: true, glowR: 6, connect: false, digital: false, rain: true, moteStyle: false },
  pride:    { count: 45, colors: ['#ff6b6b','#ffa500','#fcc419','#51cf66','#339af0','#cc5de8'], glow: true, glowR: 4, connect: false, digital: false, rain: false, moteStyle: false },
};

class LbParticles {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.particles = [];
    this.raf = null;
    this.running = false;
    this._resize();
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  _initParticles() {
    const theme = getTheme();
    const cfg = PARTICLE_CONFIGS[theme] || PARTICLE_CONFIGS.dracula;
    const accent = getCSS('--accent');
    const amber = getCSS('--amber');
    const colors = cfg.colors || [accent, amber];
    this.cfg = cfg;
    this.particles = [];

    for (let i = 0; i < cfg.count; i++) {
      this.particles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: cfg.rain ? (0.5 + Math.random() * 1.0) : (-0.5 + Math.random() * 0.6),
        r: cfg.moteStyle ? (1.5 + Math.random() * 3) : (1 + Math.random() * 2),
        color: colors[Math.floor(Math.random() * colors.length)],
        phase: Math.random() * Math.PI * 2,
        speed: 0.01 + Math.random() * 0.02,
        alpha: 0.3 + Math.random() * 0.5,
        glitchTimer: 0,
      });
    }
  }

  _resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _draw() {
    if (!this.running) return;
    const ctx = this.ctx;
    const cfg = this.cfg;
    ctx.clearRect(0, 0, this.w, this.h);

    for (const p of this.particles) {
      // Update position
      p.x += p.vx + Math.sin(p.phase) * 0.15;
      p.y += p.vy;
      p.phase += p.speed;

      // CRT digital glitch
      if (cfg.digital && Math.random() < 0.005) {
        p.x = Math.random() * this.w;
        p.y = Math.random() * this.h;
      }

      // Wrap edges
      if (p.x < -10) p.x = this.w + 10;
      if (p.x > this.w + 10) p.x = -10;
      if (p.y < -10) p.y = this.h + 10;
      if (p.y > this.h + 10) p.y = -10;

      // Draw particle
      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (cfg.moteStyle) {
        // Soft radial gradient mote (dust-in-sunlight)
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        if (cfg.glow && cfg.glowR > 0) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = cfg.glowR;
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Modern: draw connection lines
    if (cfg.connect) {
      this._drawConnections();
    }

    this.raf = requestAnimationFrame(() => this._draw());
  }

  _drawConnections() {
    const ctx = this.ctx;
    const dist = this.cfg.connectDist || 100;
    const accent = getCSS('--accent');

    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i];
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < dist) {
          ctx.save();
          ctx.globalAlpha = (1 - d / dist) * 0.15;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  start() {
    this.running = true;
    this._initParticles();
    this._draw();
  }

  stop() {
    this.running = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeHandler);
    this.particles = [];
  }
}

/* ── SVG Ring Gauge ── */
function svgRingGauge(size, radius, strokeW, pct) {
  const theme = getTheme();
  const circ = 2 * Math.PI * radius;
  const filled = circ * Math.min(pct, 1);
  const gap = circ - filled;

  // Determine stroke color
  let strokeAttr = `stroke="var(--accent)"`;
  let defs = '';
  if (theme === 'pride') {
    defs = `<defs><linearGradient id="lbRainbowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff6b6b"/>
      <stop offset="20%" stop-color="#ffa500"/>
      <stop offset="40%" stop-color="#fcc419"/>
      <stop offset="60%" stop-color="#51cf66"/>
      <stop offset="80%" stop-color="#339af0"/>
      <stop offset="100%" stop-color="#cc5de8"/>
    </linearGradient></defs>`;
    strokeAttr = `stroke="url(#lbRainbowGrad)"`;
  }

  return `<svg class="lb-ring-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${defs}
    <circle cx="${size/2}" cy="${size/2}" r="${radius}"
      fill="none" stroke="var(--bg-hover)" stroke-width="${strokeW}" opacity="0.4"/>
    <circle class="lb-ring-fill" cx="${size/2}" cy="${size/2}" r="${radius}"
      fill="none" ${strokeAttr} stroke-width="${strokeW}"
      stroke-dasharray="${filled} ${gap}" stroke-dashoffset="${circ * 0.25}"
      stroke-linecap="round"
      style="transition: stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1) 0.3s"/>
  </svg>`;
}

/* ── Hero Stats Strip ── */
function renderHeroStrip(explorers, localPeerID, totalDocs) {
  const localRank = explorers.findIndex(e => e.peer_id === localPeerID) + 1;
  const localExplorer = explorers.find(e => e.peer_id === localPeerID);
  const rankText = localRank > 0 ? '#' + localRank : '—';
  const subText = localExplorer
    ? localExplorer.doc_count.toLocaleString() + ' docs contributed'
    : 'no contributions yet';

  return `
    <div class="lb-hero-strip">
      <div class="lb-hero-stat">
        ${icon('users', 20, 'var(--text-muted)')}
        <span class="lb-hero-value" data-counter="${explorers.length}">0</span>
        <span class="lb-hero-label">Explorers</span>
      </div>
      <div class="lb-hero-sep"></div>
      <div class="lb-hero-stat">
        ${icon('fileText', 20, 'var(--text-muted)')}
        <span class="lb-hero-value" data-counter="${totalDocs}">0</span>
        <span class="lb-hero-label">Documents</span>
      </div>
      <div class="lb-hero-sep"></div>
      <div class="lb-hero-stat lb-hero-accent">
        ${icon('star', 20, 'var(--accent)')}
        <span class="lb-hero-value lb-hero-rank">${escapeHtml(rankText)}</span>
        <span class="lb-hero-label">Your Rank</span>
        <span class="lb-hero-sub">${escapeHtml(subText)}</span>
      </div>
    </div>
  `;
}

/* ── Podium ── */
function renderPodium(explorers, localPeerID) {
  if (explorers.length === 0) return '';
  const theme = getTheme();
  const maxDocs = explorers[0]?.doc_count || 1;

  const medals = [
    { idx: 0, cls: 'lb-gold',   label: crownSVG, sizeCls: 'lb-medal-xl', ringSize: 96, ringR: 38, ringStroke: 6 },
    { idx: 1, cls: 'lb-silver', label: '2nd',     sizeCls: 'lb-medal-lg', ringSize: 80, ringR: 32, ringStroke: 5 },
    { idx: 2, cls: 'lb-bronze', label: '3rd',     sizeCls: 'lb-medal-lg', ringSize: 80, ringR: 32, ringStroke: 5 },
  ];

  // Display order: 2nd, 1st, 3rd
  const order = [1, 0, 2];

  const cards = order.map((rank, i) => {
    const m = medals[rank];
    const e = explorers[m.idx];
    if (!e) return '';
    const isLocal = e.peer_id === localPeerID;
    const name = e.node_name || shortPeer(e.peer_id);
    const localCls = isLocal ? ' lb-local' : '';
    const delay = firstLoad ? `style="animation-delay:${i * 0.15}s"` : '';
    const medalDelay = firstLoad ? `style="animation-delay:${0.3 + i * 0.12}s"` : '';

    const pct = e.doc_count / maxDocs;
    const ring = svgRingGauge(m.ringSize, m.ringR, m.ringStroke, pct);

    const goldCountCls = rank === 0 ? ' lb-gold-count' : '';

    return `
      <div class="lb-podium-card ${m.cls}${localCls}" ${delay}>
        <div class="lb-medal ${m.sizeCls}" ${medalDelay}>${m.label}</div>
        <div class="lb-name">${escapeHtml(name)}</div>
        ${isLocal ? '<span class="lb-you-badge">YOU</span>' : ''}
        <div class="lb-ring-wrap">${ring}</div>
        <div class="lb-doc-count${goldCountCls}" data-target="${e.doc_count}">0</div>
        <div class="lb-doc-label">documents</div>
        <div class="lb-doc-label" style="font-size:0.78em;color:var(--text-muted);margin-top:2px">${formatNum(e.domain_count || 0)} domain${(e.domain_count || 0) !== 1 ? 's' : ''}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="lb-podium-stage">
      <canvas id="lb-particles"></canvas>
      <div class="lb-podium">${cards}</div>
    </div>
  `;
}

/* ── Table ── */
function renderTable(explorers, localPeerID) {
  const rest = explorers.slice(3);
  if (rest.length === 0) return '';
  const maxDocs = explorers[0]?.doc_count || 1;

  const rows = rest.map((e, i) => {
    const rank = i + 4;
    const isLocal = e.peer_id === localPeerID;
    const name = e.node_name || shortPeer(e.peer_id);
    const localCls = isLocal ? ' lb-local-row' : '';
    const barPct = Math.max(3, (e.doc_count / maxDocs) * 100);
    const delay = firstLoad ? `style="animation-delay:${i * 0.05}s"` : '';

    return `
      <tr class="lb-row-anim${localCls}" ${delay}>
        <td><span class="lb-rank-badge">${rank}</span></td>
        <td>
          ${escapeHtml(name)}
          ${isLocal ? ' <span class="lb-you-badge lb-you-badge-sm">YOU</span>' : ''}
        </td>
        <td>
          <div class="lb-table-bar-wrap">
            <span>${e.doc_count.toLocaleString()}</span>
            <div class="lb-table-bar"><div class="lb-bar-animated" style="--bar-pct:${barPct}%"></div></div>
          </div>
        </td>
        <td>${e.domain_count || 0}</td>
        <td>${trustBadge(e.trust_score)}</td>
        <td>${formatDate(e.first_seen)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="section">
      <h3>All Explorers</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Explorer</th>
              <th>Documents</th>
              <th>Domains</th>
              <th>Trust</th>
              <th>First Seen</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ── Load & Orchestrate ── */
async function loadLeaderboard() {
  try {
    const data = await api.leaderboard();
    const content = document.getElementById('lb-content');
    if (!content) return;

    const explorers = data.explorers || [];
    const localPeerID = data.local_peer_id || '';
    const totalDocs = data.total_docs || 0;

    content.innerHTML = `
      ${renderHeroStrip(explorers, localPeerID, totalDocs)}
      ${renderPodium(explorers, localPeerID)}
      ${renderTable(explorers, localPeerID)}
    `;

    // Animate counters on first load
    if (firstLoad) {
      // Hero strip counters
      content.querySelectorAll('.lb-hero-value[data-counter]').forEach(el => {
        animateCounter(el, parseInt(el.dataset.counter, 10));
      });
      // Podium doc counts
      content.querySelectorAll('.lb-doc-count[data-target]').forEach(el => {
        animateCounter(el, parseInt(el.dataset.target, 10));
      });

      // Start particles
      const canvasEl = document.getElementById('lb-particles');
      if (canvasEl) {
        // Destroy old particle system if any
        if (window._pageParticles) {
          window._pageParticles.destroy();
        }
        particleSystem = new LbParticles(canvasEl);
        particleSystem.start();
        window._pageParticles = particleSystem;
      }

      firstLoad = false;
    } else {
      // Subsequent refreshes: just set values directly
      content.querySelectorAll('.lb-hero-value[data-counter]').forEach(el => {
        el.textContent = parseInt(el.dataset.counter, 10).toLocaleString();
      });
      content.querySelectorAll('.lb-doc-count[data-target]').forEach(el => {
        el.textContent = parseInt(el.dataset.target, 10).toLocaleString();
      });
    }
  } catch (err) {
    const content = document.getElementById('lb-content');
    if (content) {
      content.innerHTML = `<div class="empty-state"><p>Failed to load leaderboard: ${escapeHtml(err.message)}</p></div>`;
    }
  }
}

/* ── Entry Point ── */
export function renderLeaderboard(container) {
  // Destroy old particles on re-entry
  if (window._pageParticles) {
    window._pageParticles.destroy();
    window._pageParticles = null;
  }
  particleSystem = null;
  firstLoad = true;

  container.innerHTML = `
    <div class="page-header">
      <h2>WebExplorers Leaderboard</h2>
      <p>Peer contribution rankings</p>
    </div>
    <div id="lb-content"><div class="loading">Loading leaderboard...</div></div>
  `;
  loadLeaderboard();
  window._pageInterval = setInterval(loadLeaderboard, 10000);
}
