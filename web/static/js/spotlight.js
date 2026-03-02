// Doogle v2 — Shared Spotlight Diagram Engine
// Rich monitoring-style canvas dashboard with gauges, cylinders, rings, and animated particles.
// Inspired by Quest Spotlight on Oracle / SQL Server style.
import { getCSS, hexToRgba } from './components.js';

// ============================================================
// CANVAS HELPERS
// ============================================================
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

export function formatNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString();
}

// ============================================================
// GAUGE RENDERERS — drawn inside component boxes
// ============================================================

/** Ring/donut gauge — percentage arc with value in center */
function drawRingGauge(ctx, cx, cy, radius, value, max, color, label) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + pct * Math.PI * 2;
  const lineW = 5;
  const bgColor = hexToRgba(getCSS('--border'), 0.4);

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = bgColor;
  ctx.lineWidth = lineW;
  ctx.stroke();

  // Value arc
  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Glow
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, endAngle - 0.1, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.stroke();
    ctx.restore();
  }

  // Center value
  ctx.fillStyle = getCSS('--canvas-text-bold');
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const display = max <= 1 ? (pct * 100).toFixed(0) + '%' : formatNum(value);
  ctx.fillText(display, cx, cy - 1);

  // Label below
  if (label) {
    ctx.fillStyle = getCSS('--text-muted');
    ctx.font = '8px system-ui';
    ctx.fillText(label, cx, cy + radius + 10);
  }
}

/** Horizontal capacity bar with value label */
function drawBarGauge(ctx, x, y, w, h, value, max, color, label) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const bgColor = hexToRgba(getCSS('--border'), 0.3);

  // Label
  if (label) {
    ctx.fillStyle = getCSS('--text-muted');
    ctx.font = '9px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y - 8);
  }

  // Value text on right (above bar, aligned with label)
  ctx.fillStyle = getCSS('--canvas-text-bold');
  ctx.font = 'bold 9px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(formatNum(value), x + w, y - 8);

  // Background
  roundRect(ctx, x, y, w, h, 3);
  ctx.fillStyle = bgColor;
  ctx.fill();

  // Fill
  if (pct > 0) {
    const fw = Math.max(6, w * pct);
    roundRect(ctx, x, y, fw, h, 3);
    ctx.fillStyle = color;
    ctx.fill();

    // Glow on fill
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    roundRect(ctx, x, y, fw, h, 3);
    ctx.fill();
    ctx.restore();
  }
}

/** 3D cylinder gauge for storage */
function drawCylinder(ctx, cx, cy, w, h, value, max, color, label) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const halfW = w / 2;
  const ellipseH = 6;
  const bodyTop = cy - h / 2;
  const bodyBot = cy + h / 2;
  const fillBot = bodyBot;
  const fillTop = bodyBot - (h * pct);
  const bgColor = hexToRgba(getCSS('--border'), 0.25);
  const darkColor = hexToRgba(color, 0.6);

  // Body background
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.ellipse(cx, bodyTop, halfW, ellipseH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - halfW, bodyTop, w, h);
  ctx.beginPath();
  ctx.ellipse(cx, bodyBot, halfW, ellipseH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Fill
  if (pct > 0) {
    // Fill body
    ctx.fillStyle = darkColor;
    ctx.fillRect(cx - halfW, fillTop, w, fillBot - fillTop);

    // Fill top ellipse
    ctx.fillStyle = color;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(cx, fillTop, halfW, ellipseH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Fill bottom ellipse
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.ellipse(cx, fillBot, halfW, ellipseH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlight stripe
    ctx.fillStyle = hexToRgba(color, 0.3);
    ctx.fillRect(cx - halfW + 2, fillTop, 3, fillBot - fillTop);
  }

  // Outline
  ctx.strokeStyle = hexToRgba(getCSS('--border-light'), 0.5);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(cx, bodyTop, halfW, ellipseH, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - halfW, bodyTop);
  ctx.lineTo(cx - halfW, bodyBot);
  ctx.moveTo(cx + halfW, bodyTop);
  ctx.lineTo(cx + halfW, bodyBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, bodyBot, halfW, ellipseH, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Value label
  ctx.fillStyle = getCSS('--canvas-text-bold');
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatNum(value), cx, cy);

  // Label below
  if (label) {
    ctx.fillStyle = getCSS('--text-muted');
    ctx.font = '8px system-ui';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, cx, bodyBot + ellipseH + 10);
  }
}

/** Large counter number */
function drawCounter(ctx, cx, cy, value, label, color) {
  ctx.fillStyle = color || getCSS('--accent');
  ctx.font = 'bold 20px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Glow
  ctx.save();
  ctx.shadowColor = color || getCSS('--accent');
  ctx.shadowBlur = 10;
  ctx.fillText(formatNum(value), cx, cy);
  ctx.restore();

  if (label) {
    ctx.fillStyle = getCSS('--text-muted');
    ctx.font = '9px system-ui';
    ctx.fillText(label, cx, cy + 16);
  }
}

// ============================================================
// SPOTLIGHT DIAGRAM
// ============================================================
export class SpotlightDiagram {
  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {Object} opts
   * @param {Array} opts.components - [{ id, label, col, row, colSpan?, rowSpan? }]
   * @param {Array} opts.connections - [{ from, to, label? }]
   * @param {Object} opts.navRoutes - { componentId: '#/route' }
   * @param {number} opts.cols - column count
   * @param {number} opts.rows - row count
   * @param {number} opts.boxW - default box width (default 190)
   * @param {number} opts.boxH - default box height (default 130)
   * @param {number} opts.minHeight / maxHeight
   * @param {Function} opts.onTooltipExtra - (box, data) => string[]
   */
  constructor(canvasEl, opts = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.W = 0;
    this.H = 0;
    this.mouse = { x: -1000, y: -1000 };
    this.hovered = null;
    this.animFrame = null;
    this.running = false;
    this.time = 0;

    this.components = opts.components || [];
    this.connections = opts.connections || [];
    this.navRoutes = opts.navRoutes || {};
    this.cols = opts.cols || 3;
    this.rows = opts.rows || 5;
    this.boxW = opts.boxW || 190;
    this.boxH = opts.boxH || 130;
    this.minHeight = opts.minHeight || 520;
    this.maxHeight = opts.maxHeight || 680;
    this.layout = opts.layout || 'flow'; // 'flow' (pipeline) or 'grid' (Spotlight columns)
    this.onTooltipExtra = opts.onTooltipExtra || null;

    this.boxes = new Map();
    this.particles = [];
    this.data = {};
    this._spawnRateBase = 1;
    this._transition = null;

    this._resize();
    this._bindEvents();
  }

  // --- Layout ---
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    const parent = this.canvas.parentElement;
    const W = parent.offsetWidth || 900;
    const H = Math.max(this.minHeight, Math.min(this.maxHeight, window.innerHeight - 180));
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = W;
    this.H = H;
    this._computeLayout();
  }

  _computeLayout() {
    const W = this.W;
    const H = this.H;
    const boxW = this.boxW;
    const boxH = this.boxH;

    this.boxes.clear();

    if (this.layout === 'grid') {
      // Spotlight-style: panels fill available space in a column grid
      // Components specify { col, row } where col is the grid column
      // and row is vertical position within that column (0-indexed)
      const pad = 20;
      const gap = 18;

      // Group components by column
      const colGroups = new Map();
      for (const comp of this.components) {
        const col = comp.col || 0;
        if (!colGroups.has(col)) colGroups.set(col, []);
        colGroups.get(col).push(comp);
      }
      // Sort each column by row
      for (const [, group] of colGroups) {
        group.sort((a, b) => (a.row || 0) - (b.row || 0));
      }

      const numCols = colGroups.size;
      const colWidth = (W - pad * 2 - gap * (numCols - 1)) / numCols;
      const colKeys = [...colGroups.keys()].sort((a, b) => a - b);

      for (let ci = 0; ci < colKeys.length; ci++) {
        const colKey = colKeys[ci];
        const group = colGroups.get(colKey);
        const colX = pad + ci * (colWidth + gap);

        // Distribute panels vertically within column
        const totalGap = gap * (group.length - 1);
        const availH = H - pad * 2 - totalGap;
        // Each panel gets height proportional to its boxH or equal share
        const totalWeight = group.reduce((s, c) => s + (c.boxH || boxH), 0);

        let curY = pad;
        for (const comp of group) {
          const bw = comp.boxW ? Math.min(comp.boxW, colWidth) : colWidth;
          const bh = Math.max(80, (comp.boxH || boxH) / totalWeight * availH);
          const x = colX + (colWidth - bw) / 2;
          const cx = x + bw / 2;
          const cy = curY + bh / 2;
          this.boxes.set(comp.id, {
            ...comp,
            x, y: curY,
            cx, cy,
            w: bw, h: bh,
            health: 'green',
            metrics: [],
            gauges: [],
          });
          curY += bh + gap;
        }
      }
    } else {
      // Flow layout: centered grid based on col/row indices
      const padTop = 24;
      const padBottom = 24;
      const rowGap = this.rows > 1 ? (H - padTop - padBottom - boxH) / (this.rows - 1) : 0;

      const colXs = [];
      for (let c = 0; c < this.cols; c++) {
        colXs.push(W * ((c + 1) / (this.cols + 1)));
      }

      for (const comp of this.components) {
        const bw = comp.boxW || boxW;
        const bh = comp.boxH || boxH;
        const cx = colXs[comp.col] || W / 2;
        const cy = padTop + (comp.row || 0) * rowGap + boxH / 2;
        this.boxes.set(comp.id, {
          ...comp,
          x: cx - bw / 2,
          y: cy - bh / 2,
          cx, cy,
          w: bw, h: bh,
          health: 'green',
          metrics: [],
          gauges: [],
        });
      }
    }
  }

  // --- Events ---
  _bindEvents() {
    this.canvas.addEventListener('mousemove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.hovered = this._hitTest(this.mouse.x, this.mouse.y);
      const isNav = this.hovered && this.navRoutes[this.hovered.id];
      this.canvas.style.cursor = isNav ? 'pointer' : 'default';
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.x = -1000;
      this.mouse.y = -1000;
      this.hovered = null;
    });
    this.canvas.addEventListener('click', e => {
      const r = this.canvas.getBoundingClientRect();
      const hit = this._hitTest(e.clientX - r.left, e.clientY - r.top);
      if (!hit) return;
      const route = this.navRoutes[hit.id];
      if (!route) return;
      this._startTransition(hit, route);
    });
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
    this._themeHandler = () => {};
    window.addEventListener('themechange', this._themeHandler);
  }

  _hitTest(mx, my) {
    for (const [, box] of this.boxes) {
      if (mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h) {
        return box;
      }
    }
    return null;
  }

  // --- Transition ---
  _startTransition(box, targetRoute) {
    if (this._transition) return;
    this._transition = {
      box, targetRoute, progress: 0,
      ripples: [
        { delay: 0, maxRadius: Math.max(this.W, this.H) * 1.2 },
        { delay: 0.08, maxRadius: Math.max(this.W, this.H) * 1.0 },
        { delay: 0.16, maxRadius: Math.max(this.W, this.H) * 0.8 },
      ],
    };
  }

  _updateTransition() {
    if (!this._transition) return false;
    this._transition.progress += 0.025;
    if (this._transition.progress >= 1) {
      const route = this._transition.targetRoute;
      this._transition = null;
      window.location.hash = route;
      return false;
    }
    return true;
  }

  _drawTransition(ctx) {
    if (!this._transition) return;
    const { box, progress, ripples } = this._transition;
    const cx = box.cx;
    const cy = box.cy;
    const accent = getCSS('--accent');
    const bgPrimary = getCSS('--bg-primary');
    const W = this.W;
    const H = this.H;

    for (const rip of ripples) {
      const t = Math.max(0, Math.min(1, (progress - rip.delay) / 0.6));
      if (t <= 0) continue;
      const ease = 1 - Math.pow(1 - t, 3);
      const radius = ease * rip.maxRadius;
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = (1 - t) * 0.35;
      ctx.lineWidth = 3 - t * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (progress > 0.3) {
      const zoomT = Math.min(1, (progress - 0.3) / 0.7);
      ctx.save();
      ctx.globalAlpha = zoomT * zoomT * 0.15;
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (progress > 0.5) {
      const darkT = Math.min(1, (progress - 0.5) / 0.5);
      ctx.save();
      ctx.globalAlpha = darkT * darkT * darkT;
      ctx.fillStyle = bgPrimary;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      if (darkT > 0.2 && darkT < 0.9) {
        const a = darkT < 0.5 ? (darkT - 0.2) / 0.3 : (0.9 - darkT) / 0.4;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = accent;
        ctx.font = `bold ${16 + darkT * 8}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = accent;
        ctx.shadowBlur = 20;
        ctx.fillText(box.label, W / 2, H / 2);
        ctx.restore();
      }
    }
    if (progress < 0.4) {
      const pulse = Math.sin((progress / 0.4) * Math.PI);
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 30 * pulse;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.globalAlpha = pulse;
      roundRect(ctx, box.x - 4, box.y - 4, box.w + 8, box.h + 8, 12);
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- Data ---
  setBoxData(id, updates) {
    const box = this.boxes.get(id);
    if (box) Object.assign(box, updates);
  }

  setSpawnRate(rate) { this._spawnRateBase = Math.max(1, rate); }
  setData(data) { this.data = data; }

  // --- Particles ---
  _spawnParticles() {
    const rate = this._spawnRateBase;
    for (const conn of this.connections) {
      if (Math.random() > 0.03 * rate) continue;
      const from = this.boxes.get(conn.from);
      const to = this.boxes.get(conn.to);
      if (!from || !to) continue;
      this.particles.push({
        t: 0,
        speed: 0.003 + Math.random() * 0.004,
        fromX: from.cx, fromY: from.cy,
        toX: to.cx, toY: to.cy,
      });
    }
    if (this.particles.length > 200) this.particles = this.particles.slice(-200);
  }

  _updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].t += this.particles[i].speed;
      if (this.particles[i].t >= 1) this.particles.splice(i, 1);
    }
  }

  // --- Animation ---
  start() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.time++;
      this._updateTransition();
      if (!this._transition) this._spawnParticles();
      this._updateParticles();
      this._draw();
      this.animFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  stop() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeHandler);
    window.removeEventListener('themechange', this._themeHandler);
  }

  // --- Drawing ---
  _draw() {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;

    ctx.clearRect(0, 0, W, H);

    // Background with subtle grid pattern
    ctx.fillStyle = getCSS('--bg-card');
    roundRect(ctx, 0, 0, W, H, 12);
    ctx.fill();
    this._drawGrid(ctx, W, H);

    this._drawConnections(ctx);
    this._drawParticles(ctx);

    for (const [, box] of this.boxes) {
      this._drawBox(ctx, box);
    }

    if (this.hovered && !this._transition) {
      this._drawTooltip(ctx, this.hovered);
    }
    if (this._transition) {
      this._drawTransition(ctx);
    }
  }

  _drawGrid(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(getCSS('--border'), 0.08);
    ctx.lineWidth = 0.5;
    const step = 40;
    for (let x = step; x < W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = step; y < H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawConnections(ctx) {
    for (const conn of this.connections) {
      const from = this.boxes.get(conn.from);
      const to = this.boxes.get(conn.to);
      if (!from || !to) continue;

      // Find exit/entry points on box edges
      const fp = this._edgePoint(from, to);
      const tp = this._edgePoint(to, from);

      ctx.save();

      const dx = tp.x - fp.x;
      const dy = tp.y - fp.y;
      const cp1x = fp.x + dx * 0.4;
      const cp1y = fp.y;
      const cp2x = fp.x + dx * 0.6;
      const cp2y = tp.y;

      // Subtle glow layer
      ctx.strokeStyle = hexToRgba(getCSS('--accent'), 0.08);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(fp.x, fp.y);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tp.x, tp.y);
      ctx.stroke();

      // Main connection line
      ctx.strokeStyle = hexToRgba(getCSS('--border-light'), 0.45);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(fp.x, fp.y);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tp.x, tp.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow head
      const angle = Math.atan2(tp.y - cp2y, tp.x - cp2x);
      const arrowLen = 9;
      ctx.fillStyle = hexToRgba(getCSS('--border-light'), 0.55);
      ctx.beginPath();
      ctx.moveTo(tp.x, tp.y);
      ctx.lineTo(tp.x - arrowLen * Math.cos(angle - 0.35), tp.y - arrowLen * Math.sin(angle - 0.35));
      ctx.lineTo(tp.x - arrowLen * Math.cos(angle + 0.35), tp.y - arrowLen * Math.sin(angle + 0.35));
      ctx.closePath();
      ctx.fill();

      // Connection label at midpoint
      if (conn.label) {
        const midT = 0.5;
        const it = 1 - midT;
        const mx = it*it*it*fp.x + 3*it*it*midT*cp1x + 3*it*midT*midT*cp2x + midT*midT*midT*tp.x;
        const my = it*it*it*fp.y + 3*it*it*midT*cp1y + 3*it*midT*midT*cp2y + midT*midT*midT*tp.y;
        ctx.font = '8px system-ui';
        const tw = ctx.measureText(conn.label).width + 8;
        ctx.fillStyle = getCSS('--bg-card');
        ctx.fillRect(mx - tw / 2, my - 6, tw, 12);
        ctx.fillStyle = hexToRgba(getCSS('--text-muted'), 0.6);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(conn.label, mx, my);
      }

      ctx.restore();
    }
  }

  _edgePoint(from, to) {
    // Return a point on the edge of 'from' box facing 'to'
    const dx = to.cx - from.cx;
    const dy = to.cy - from.cy;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const hw = from.w / 2;
    const hh = from.h / 2;

    if (absDx / hw > absDy / hh) {
      // Exit left or right
      const sx = dx > 0 ? 1 : -1;
      return { x: from.cx + sx * hw, y: from.cy + dy * (hw / absDx) };
    } else {
      // Exit top or bottom
      const sy = dy > 0 ? 1 : -1;
      return { x: from.cx + dx * (hh / absDy), y: from.cy + sy * hh };
    }
  }

  _drawParticles(ctx) {
    const accent = getCSS('--accent');
    for (const p of this.particles) {
      const t = p.t;
      const from = this._findBoxByCenter(p.fromX, p.fromY);
      const to = this._findBoxByCenter(p.toX, p.toY);
      let fp = { x: p.fromX, y: p.fromY };
      let tp = { x: p.toX, y: p.toY };
      if (from && to) {
        fp = this._edgePoint(from, to);
        tp = this._edgePoint(to, from);
      }

      const dx = tp.x - fp.x;
      const dy = tp.y - fp.y;
      const cp1x = fp.x + dx * 0.4;
      const cp1y = fp.y;
      const cp2x = fp.x + dx * 0.6;
      const cp2y = tp.y;

      const it = 1 - t;
      const x = it*it*it*fp.x + 3*it*it*t*cp1x + 3*it*t*t*cp2x + t*t*t*tp.x;
      const y = it*it*it*fp.y + 3*it*it*t*cp1y + 3*it*t*t*cp2y + t*t*t*tp.y;

      const alpha = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;

      // Trail (3 fading dots behind the particle)
      for (let ti = 3; ti >= 1; ti--) {
        const tt = Math.max(0, t - ti * 0.018);
        const tit = 1 - tt;
        const tx = tit*tit*tit*fp.x + 3*tit*tit*tt*cp1x + 3*tit*tt*tt*cp2x + tt*tt*tt*tp.x;
        const ty = tit*tit*tit*fp.y + 3*tit*tit*tt*cp1y + 3*tit*tt*tt*cp2y + tt*tt*tt*tp.y;
        ctx.save();
        ctx.globalAlpha = alpha * (0.15 - ti * 0.035);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(tx, ty, 3 - ti * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Glow
      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Core
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = getCSS('--canvas-text-bold');
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _findBoxByCenter(cx, cy) {
    for (const [, box] of this.boxes) {
      if (Math.abs(box.cx - cx) < 1 && Math.abs(box.cy - cy) < 1) return box;
    }
    return null;
  }

  _drawBox(ctx, box) {
    const isHovered = box === this.hovered;
    const { x, y, w, h } = box;

    const healthColors = {
      green: getCSS('--green'),
      amber: getCSS('--amber'),
      red:   getCSS('--red'),
    };
    const healthColor = healthColors[box.health] || healthColors.green;

    // Panel background with subtle gradient
    ctx.save();
    if (isHovered) {
      ctx.shadowColor = hexToRgba(healthColor, 0.3);
      ctx.shadowBlur = 24;
    }
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, isHovered ? getCSS('--bg-hover') : hexToRgba(getCSS('--bg-secondary'), 0.95));
    grad.addColorStop(1, hexToRgba(getCSS('--bg-primary'), 0.8));
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = isHovered ? healthColor : hexToRgba(getCSS('--border'), 0.6);
    ctx.lineWidth = isHovered ? 2 : 1;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();
    ctx.restore();

    // Title bar background
    ctx.save();
    ctx.fillStyle = hexToRgba(healthColor, 0.12);
    roundRect(ctx, x + 1, y + 1, w - 2, 24, 7);
    ctx.fill();
    ctx.restore();

    // Health dot
    ctx.save();
    ctx.fillStyle = healthColor;
    ctx.shadowColor = healthColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x + 12, y + 13, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Title
    ctx.fillStyle = getCSS('--canvas-text-bold');
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(box.label, x + 22, y + 13);

    // Nav arrow in title bar
    if (this.navRoutes[box.id]) {
      ctx.save();
      ctx.globalAlpha = isHovered ? 1 : 0.4;
      ctx.fillStyle = isHovered ? getCSS('--accent') : getCSS('--text-muted');
      ctx.font = '12px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('→', x + w - 8, y + 13);
      ctx.restore();
    }

    // Render gauges
    const gauges = box.gauges || [];
    const gaugeAreaY = y + 28;
    const gaugeAreaH = h - 32;
    this._drawGauges(ctx, x, gaugeAreaY, w, gaugeAreaH, gauges);

    // Render text metrics below gauges
    const metrics = box.metrics || [];
    if (metrics.length > 0) {
      const metricsY = gauges.length > 0 ? y + h - 4 - metrics.length * 13 : gaugeAreaY + 6;
      ctx.fillStyle = getCSS('--text-secondary');
      ctx.font = '10px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      for (let i = 0; i < metrics.length; i++) {
        ctx.fillText(metrics[i], x + 8, metricsY + i * 13);
      }
    }
  }

  _drawGauges(ctx, boxX, areaY, boxW, areaH, gauges) {
    if (!gauges || gauges.length === 0) return;

    const count = gauges.length;
    const tall = areaH > 150 && count <= 3; // Stack vertically in tall panels

    if (tall) {
      // Vertical stacking
      const gapY = 6;
      const slotH = (areaH - gapY * (count - 1)) / count;
      for (let i = 0; i < count; i++) {
        const g = gauges[i];
        const slotCx = boxX + boxW / 2;
        const slotCy = areaY + slotH * i + slotH / 2 + gapY * i;

        if (g.type === 'ring') {
          const radius = Math.min(boxW / 2 - 20, slotH / 2 - 14);
          drawRingGauge(ctx, slotCx, slotCy - 4, Math.max(16, radius), g.value, g.max, g.color || getCSS('--accent'), g.label);
        } else if (g.type === 'bar') {
          const barW = boxW - 24;
          drawBarGauge(ctx, boxX + 12, slotCy - 4, barW, 12, g.value, g.max, g.color || getCSS('--accent'), g.label);
        } else if (g.type === 'cylinder') {
          const cylW = Math.min(boxW / 3, 36);
          const cylH = slotH - 24;
          drawCylinder(ctx, slotCx, slotCy, cylW, Math.max(28, cylH), g.value, g.max, g.color || getCSS('--green'), g.label);
        } else if (g.type === 'counter') {
          drawCounter(ctx, slotCx, slotCy, g.value, g.label, g.color || getCSS('--accent'));
        }
      }
    } else {
      // Horizontal layout
      const gapX = 8;
      const slotW = (boxW - gapX * 2) / count;
      for (let i = 0; i < count; i++) {
        const g = gauges[i];
        const slotCx = boxX + gapX + slotW * i + slotW / 2;
        const slotCy = areaY + areaH / 2;

        if (g.type === 'ring') {
          const radius = Math.min(slotW / 2 - 8, areaH / 2 - 14);
          drawRingGauge(ctx, slotCx, slotCy - 4, Math.max(14, radius), g.value, g.max, g.color || getCSS('--accent'), g.label);
        } else if (g.type === 'bar') {
          const barW = slotW - 16;
          drawBarGauge(ctx, slotCx - barW / 2, slotCy - 4, barW, 10, g.value, g.max, g.color || getCSS('--accent'), g.label);
        } else if (g.type === 'cylinder') {
          const cylW = Math.min(slotW - 16, 30);
          const cylH = areaH - 28;
          drawCylinder(ctx, slotCx, slotCy - 2, cylW, Math.max(24, cylH), g.value, g.max, g.color || getCSS('--green'), g.label);
        } else if (g.type === 'counter') {
          drawCounter(ctx, slotCx, slotCy - 2, g.value, g.label, g.color || getCSS('--accent'));
        }
      }
    }
  }

  _drawTooltip(ctx, box) {
    const lines = [box.label, ...(box.metrics || [])];
    const extra = this.onTooltipExtra ? this.onTooltipExtra(box, this.data) : [];
    const isNavigable = !!this.navRoutes[box.id];
    const allLines = [...lines, ...extra, ...(isNavigable ? ['Click to open →'] : [])];

    ctx.save();
    ctx.font = '11px system-ui';
    ctx.textBaseline = 'alphabetic';
    const maxW = Math.max(...allLines.map(l => ctx.measureText(l).width)) + 24;
    const tipH = allLines.length * 18 + 16;
    let tipX = box.cx - maxW / 2;
    let tipY = box.y - tipH - 10;
    if (tipX < 8) tipX = 8;
    if (tipX + maxW > this.W - 8) tipX = this.W - maxW - 8;
    if (tipY < 8) tipY = box.y + box.h + 10;

    ctx.fillStyle = getCSS('--canvas-tooltip-bg');
    ctx.shadowColor = hexToRgba(getCSS('--bg-primary'), 0.7);
    ctx.shadowBlur = 16;
    roundRect(ctx, tipX, tipY, maxW, tipH, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
    for (let i = 0; i < allLines.length; i++) {
      const isNavHint = isNavigable && i === allLines.length - 1;
      ctx.fillStyle = isNavHint ? getCSS('--accent') : (i === 0 ? getCSS('--canvas-text-bold') : getCSS('--text-secondary'));
      ctx.font = (i === 0 || isNavHint) ? 'bold 11px system-ui' : '11px system-ui';
      ctx.fillText(allLines[i], tipX + 12, tipY + 18 + i * 18);
    }
    ctx.restore();
  }
}

// ============================================================
// MOBILE CARD FALLBACK — replaces canvas below MOBILE_BP
// ============================================================
const HEALTH_COLORS = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)' };

export function renderMobileCards(container, boxes, navRoutes) {
  container.innerHTML = '';
  for (const box of boxes) {
    const route = navRoutes && navRoutes[box.id];
    const card = document.createElement(route ? 'a' : 'div');
    card.className = 'mobile-card';
    if (route) { card.href = route; card.style.textDecoration = 'none'; card.style.color = 'inherit'; }

    const dot = HEALTH_COLORS[box.health] || HEALTH_COLORS.green;
    const gauges = box.gauges || [];
    const metrics = box.metrics || [];

    // Pick primary gauge — first counter or first ring
    const primary = gauges.find(g => g.type === 'counter') || gauges[0];
    let primaryHTML = '';
    if (primary) {
      const val = primary.max != null && primary.max <= 1
        ? (primary.max > 0 ? ((Math.min(1, primary.value / primary.max) * 100).toFixed(0) + '%') : '0%')
        : formatNum(primary.value);
      primaryHTML = `
        <div class="mc-primary" style="color:${primary.color || 'var(--accent)'}">${val}</div>
        <div class="mc-primary-label">${primary.label || ''}</div>
      `;
    }

    // Secondary gauges (skip the primary)
    const secondary = gauges.filter(g => g !== primary);
    let secHTML = '';
    for (const g of secondary) {
      const val = g.max != null && g.max <= 1
        ? (g.max > 0 ? ((Math.min(1, g.value / g.max) * 100).toFixed(0) + '%') : '0%')
        : formatNum(g.value);
      secHTML += `<div>${g.label || ''}: ${val}</div>`;
    }
    for (const m of metrics) {
      secHTML += `<div>${m}</div>`;
    }

    card.innerHTML = `
      <div class="mc-header">
        <span class="mc-dot" style="background:${dot}"></span>
        <span class="mc-label">${box.label || box.id}</span>
      </div>
      ${primaryHTML}
      ${secHTML ? `<div class="mc-secondary">${secHTML}</div>` : ''}
    `;
    container.appendChild(card);
  }
}
