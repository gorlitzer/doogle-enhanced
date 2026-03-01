// Doogle v2 — Shared UI Components
// Icons, Modal, Skeleton loaders, Canvas charts, Force-directed graph

// ============================================================
// SVG ICON SYSTEM (24x24, 2px stroke, consistent across app)
// ============================================================
export const icons = {
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  cpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  database: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  radio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  network: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><path d="M12 8v4"/><path d="M6 16l3-4h6l3 4"/></svg>`,
  megaphone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 0 1-5.8-1.6"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  fileText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  trendingUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  alertTriangle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  coffee: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
  mapPin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  bookOpen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
};

export function icon(name, size = 24, color = 'currentColor') {
  return `<span class="icon" style="width:${size}px;height:${size}px;color:${color};display:inline-flex;align-items:center;justify-content:center">${icons[name] || ''}</span>`;
}

// ============================================================
// MODAL
// ============================================================
let _modalEl = null;

export function showModal(title, contentHtml, opts = {}) {
  closeModal();
  const width = opts.width || '640px';
  _modalEl = document.createElement('div');
  _modalEl.className = 'modal-overlay';
  _modalEl.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-container" style="max-width:${width}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">${contentHtml}</div>
    </div>
  `;
  document.body.appendChild(_modalEl);
  _modalEl.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  _modalEl.querySelector('.modal-close').addEventListener('click', closeModal);
  document.addEventListener('keydown', _escHandler);
}

export function closeModal() {
  if (_modalEl) {
    _modalEl.remove();
    _modalEl = null;
  }
  document.removeEventListener('keydown', _escHandler);
}

function _escHandler(e) { if (e.key === 'Escape') closeModal(); }

// ============================================================
// SKELETON LOADERS
// ============================================================
export function skeleton(count = 3) {
  return Array.from({ length: count }, () =>
    `<div class="skeleton" style="height:14px;width:${60 + Math.random() * 40}%;margin-bottom:10px"></div>`
  ).join('');
}

export function cardSkeleton(count = 4) {
  return `<div class="card-grid">${
    Array.from({ length: count }, () => `
      <div class="card">
        <div class="skeleton" style="height:12px;width:40%;margin-bottom:12px"></div>
        <div class="skeleton" style="height:28px;width:60%;margin-bottom:8px"></div>
        <div class="skeleton" style="height:12px;width:80%"></div>
      </div>
    `).join('')
  }</div>`;
}

export function tableSkeleton(rows = 5, cols = 4) {
  const headCells = Array.from({ length: cols }, () =>
    `<th><div class="skeleton" style="height:12px;width:70%"></div></th>`
  ).join('');
  const bodyCells = Array.from({ length: cols }, () =>
    `<td><div class="skeleton" style="height:12px;width:${50 + Math.random() * 40}%"></div></td>`
  ).join('');
  const bodyRows = Array.from({ length: rows }, () => `<tr>${bodyCells}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

// ============================================================
// CANVAS BAR CHART
// ============================================================
export function renderBarChart(canvasId, data, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = opts.width || canvas.parentElement.offsetWidth || 600;
  const H = opts.height || 250;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  // Bg
  ctx.fillStyle = getCSS('--bg-card');
  ctx.fillRect(0, 0, W, H);

  if (!data || data.length === 0) {
    ctx.fillStyle = getCSS('--text-muted');
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No data', W / 2, H / 2);
    return;
  }

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.max(2, (chartW / data.length) - 4);
  const barGap = 4;
  const color = opts.color || getCSS('--accent');

  // Grid lines
  ctx.strokeStyle = getCSS('--border');
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = getCSS('--text-muted');
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * (1 - i / 4)).toString(), padding.left - 8, y + 4);
  }

  // Bars
  data.forEach((d, i) => {
    const x = padding.left + i * (barWidth + barGap);
    const barH = (d.value / maxVal) * chartH;
    const y = padding.top + chartH - barH;

    ctx.fillStyle = d.color || color;
    ctx.beginPath();
    roundRect(ctx, x, y, barWidth, barH, 3);
    ctx.fill();

    // Label
    if (d.label) {
      ctx.fillStyle = getCSS('--text-muted');
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barWidth / 2, H - padding.bottom + 14);
      if (data.length > 15) ctx.rotate(-0.5);
      ctx.fillText(d.label.slice(0, 8), 0, 0);
      ctx.restore();
    }
  });
}

// ============================================================
// CANVAS LINE CHART
// ============================================================
export function renderLineChart(canvasId, series, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = opts.width || canvas.parentElement.offsetWidth || 600;
  const H = opts.height || 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  ctx.fillStyle = getCSS('--bg-card');
  ctx.fillRect(0, 0, W, H);

  if (!series || series.length === 0 || series[0].data.length === 0) {
    ctx.fillStyle = getCSS('--text-muted');
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', W / 2, H / 2);
    return;
  }

  const allVals = series.flatMap(s => s.data.map(d => d.value));
  const maxVal = Math.max(...allVals, 1);

  // Grid
  ctx.strokeStyle = getCSS('--border');
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = getCSS('--text-muted');
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * (1 - i / 4)).toString(), padding.left - 8, y + 4);
  }

  // Lines
  series.forEach(s => {
    const points = s.data;
    ctx.strokeStyle = s.color || getCSS('--accent');
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padding.left + (i / Math.max(1, points.length - 1)) * chartW;
      const y = padding.top + chartH - (p.value / maxVal) * chartH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    ctx.fillStyle = s.color || getCSS('--accent');
    points.forEach((p, i) => {
      const x = padding.left + (i / Math.max(1, points.length - 1)) * chartW;
      const y = padding.top + chartH - (p.value / maxVal) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // Legend
  if (series.length > 1) {
    let lx = padding.left;
    series.forEach(s => {
      ctx.fillStyle = s.color || getCSS('--accent');
      ctx.fillRect(lx, H - 12, 10, 10);
      ctx.fillStyle = getCSS('--text-secondary');
      ctx.font = '10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(s.label || '', lx + 14, H - 3);
      lx += ctx.measureText(s.label || '').width + 30;
    });
  }
}

// ============================================================
// FORCE-DIRECTED NETWORK GRAPH
// ============================================================
export class NetworkGraph {
  constructor(canvasId, opts = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.nodes = [];
    this.edges = [];
    this.opts = opts;
    this.dragging = null;
    this.offset = { x: 0, y: 0 };
    this.scale = 1;
    this.mouse = { x: 0, y: 0 };
    this.hovered = null;
    this.animFrame = null;
    this.running = false;

    this._resize();
    this._bindEvents();
  }

  setData(nodes, edges) {
    // nodes: [{ id, label, type, color, x?, y? }]
    // edges: [{ from, to }]
    const W = this.canvas.width / (window.devicePixelRatio || 1);
    const H = this.canvas.height / (window.devicePixelRatio || 1);
    this.nodes = nodes.map(n => ({
      ...n,
      x: n.x ?? W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: n.y ?? H / 2 + (Math.random() - 0.5) * H * 0.6,
      vx: 0, vy: 0,
      radius: n.radius || (n.type === 'self' ? 18 : 12),
    }));
    this.edges = edges;
    this._startSimulation();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const parent = this.canvas.parentElement;
    const W = this.opts.width || parent.offsetWidth || 600;
    const H = this.opts.height || 400;
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx.scale(dpr, dpr);
    this.W = W;
    this.H = H;
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', e => {
      const p = this._canvasPos(e);
      this.dragging = this._hitTest(p.x, p.y);
      if (this.dragging) { this.dragging._fixed = true; }
    });
    this.canvas.addEventListener('mousemove', e => {
      const p = this._canvasPos(e);
      this.mouse = p;
      if (this.dragging) {
        this.dragging.x = p.x;
        this.dragging.y = p.y;
      }
      this.hovered = this._hitTest(p.x, p.y);
      this.canvas.style.cursor = this.hovered ? 'grab' : 'default';
    });
    this.canvas.addEventListener('mouseup', () => {
      if (this.dragging) this.dragging._fixed = false;
      this.dragging = null;
    });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.scale = Math.max(0.3, Math.min(3, this.scale + (e.deltaY > 0 ? -0.1 : 0.1)));
    });
  }

  _canvasPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.W / 2) / this.scale + this.W / 2,
      y: (e.clientY - r.top - this.H / 2) / this.scale + this.H / 2,
    };
  }

  _hitTest(x, y) {
    for (const n of this.nodes) {
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy < (n.radius + 4) ** 2) return n;
    }
    return null;
  }

  _startSimulation() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      this._simulate();
      this._draw();
      this.animFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  stop() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  _simulate() {
    const alpha = 0.3;
    const repulsion = 3000;
    const attraction = 0.005;
    const centerForce = 0.01;
    const damping = 0.85;

    // Repulsion between all nodes
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force * alpha;
        const fy = (dy / dist) * force * alpha;
        if (!a._fixed) { a.vx -= fx; a.vy -= fy; }
        if (!b._fixed) { b.vx += fx; b.vy += fy; }
      }
    }

    // Attraction along edges
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    for (const e of this.edges) {
      const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * attraction * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a._fixed) { a.vx += fx; a.vy += fy; }
      if (!b._fixed) { b.vx -= fx; b.vy -= fy; }
    }

    // Center gravity
    for (const n of this.nodes) {
      if (n._fixed) continue;
      n.vx += (this.W / 2 - n.x) * centerForce * alpha;
      n.vy += (this.H / 2 - n.y) * centerForce * alpha;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      // Bounds
      n.x = Math.max(n.radius, Math.min(this.W - n.radius, n.x));
      n.y = Math.max(n.radius, Math.min(this.H - n.radius, n.y));
    }
  }

  _draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.W, this.H);

    // Background
    ctx.fillStyle = getCSS('--bg-card');
    ctx.fillRect(0, 0, this.W, this.H);

    // Apply zoom
    ctx.translate(this.W / 2, this.H / 2);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.W / 2, -this.H / 2);

    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));

    // Edges
    for (const e of this.edges) {
      const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
      if (!a || !b) continue;
      ctx.strokeStyle = e.color || getCSS('--border-light');
      ctx.lineWidth = e.width || 1;
      if (e.dashed) ctx.setLineDash([4, 4]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Nodes
    for (const n of this.nodes) {
      // Glow for hovered
      if (n === this.hovered) {
        ctx.shadowColor = n.color || getCSS('--accent');
        ctx.shadowBlur = 15;
      }

      ctx.fillStyle = n.color || getCSS('--accent');
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = n === this.hovered ? getCSS('--canvas-node-border-hover') : getCSS('--canvas-node-border');
      ctx.lineWidth = n === this.hovered ? 2 : 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = getCSS('--canvas-text');
      ctx.font = `${n.type === 'self' ? 'bold ' : ''}${n.radius > 14 ? 11 : 9}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(n.label || '', n.x, n.y + n.radius + 14);
    }

    // Tooltip for hovered
    if (this.hovered) {
      const n = this.hovered;
      const text = n.tooltip || n.id;
      ctx.fillStyle = getCSS('--canvas-tooltip-bg');
      const tw = ctx.measureText(text).width + 16;
      roundRect(ctx, n.x - tw / 2, n.y - n.radius - 32, tw, 24, 4);
      ctx.fill();
      ctx.fillStyle = getCSS('--canvas-text-bold');
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(text, n.x, n.y - n.radius - 16);
    }

    ctx.restore();
  }
}

// ============================================================
// SCORE DISPLAY
// ============================================================
export function scoreBar(value, color = 'accent', label = '') {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return `
    <div class="score-bar">
      ${label ? `<span style="font-size:0.8em;color:var(--text-muted);min-width:100px">${label}</span>` : ''}
      <div class="score-bar-fill">
        <div class="fill" style="width:${pct}%;background:var(--${color})"></div>
      </div>
      <span class="score-bar-label">${value.toFixed(2)}</span>
    </div>
  `;
}

export function scoreBadge(label, value, thresholds = { good: 0.6, warn: 0.3 }) {
  const color = value >= thresholds.good ? 'green' : value >= thresholds.warn ? 'amber' : 'red';
  return `<span class="badge badge-${color}">${label}: ${value.toFixed(2)}</span>`;
}

// ============================================================
// HELPERS
// ============================================================
export function getCSS(prop) {
  return getComputedStyle(document.documentElement).getPropertyValue(prop).trim() || '#888';
}

export function hexToRgba(hex, alpha = 1) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(128,128,128,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ============================================================
// SHARED DOC COMPONENTS (used by docs.js and other pages)
// ============================================================

/** Render a code block with copy button. */
export function codeBlock(code, lang = '') {
  const id = 'cb-' + Math.random().toString(36).slice(2, 8);
  return `
    <div class="docs-code-block">
      <div class="docs-code-header">
        ${lang ? `<span class="docs-code-lang">${lang}</span>` : '<span></span>'}
        <button class="docs-copy-btn" data-target="${id}" title="Copy to clipboard">
          ${icon('fileText', 14)} Copy
        </button>
      </div>
      <pre id="${id}"><code>${escapeHtml(code.trim())}</code></pre>
    </div>
  `;
}

/** Render an info card with icon. */
export function infoCard(iconName, title, desc, color = 'var(--accent)') {
  return `
    <div class="docs-info-card">
      <div class="docs-info-icon" style="color:${color}">${icon(iconName, 22)}</div>
      <div>
        <strong>${title}</strong>
        <p>${desc}</p>
      </div>
    </div>
  `;
}

/** Bind copy-to-clipboard handlers on .docs-copy-btn elements. */
export function bindCopyButtons(el) {
  el.querySelectorAll('.docs-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const text = target.textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = `${icon('shield', 14)} Copied!`;
        setTimeout(() => { btn.innerHTML = `${icon('fileText', 14)} Copy`; }, 1500);
      });
    });
  });
}

/** Bind collapsible toggle handlers on .docs-collapse-trigger elements. */
export function bindCollapsibles(el) {
  el.querySelectorAll('.docs-collapse-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const target = trigger.closest('.docs-collapsible');
      target.classList.toggle('open');
    });
  });
}
