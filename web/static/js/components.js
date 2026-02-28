// Doogle v2 — Shared UI Components
// Modal, Skeleton loaders, Canvas charts, Force-directed graph

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
      ctx.strokeStyle = n === this.hovered ? '#fff' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = n === this.hovered ? 2 : 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = `${n.type === 'self' ? 'bold ' : ''}${n.radius > 14 ? 11 : 9}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(n.label || '', n.x, n.y + n.radius + 14);
    }

    // Tooltip for hovered
    if (this.hovered) {
      const n = this.hovered;
      const text = n.tooltip || n.id;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      const tw = ctx.measureText(text).width + 16;
      roundRect(ctx, n.x - tw / 2, n.y - n.radius - 32, tw, 24, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
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
function getCSS(prop) {
  return getComputedStyle(document.documentElement).getPropertyValue(prop).trim() || '#888';
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
