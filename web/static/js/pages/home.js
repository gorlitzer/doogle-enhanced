// Doogle v2 — Interactive Animated Homepage
// Each theme gets a unique foreground canvas animation with mouse/touch interaction.
//   dracula  — crimson/cyan particle swarm with spring physics
//   crt      — matrix character grid that decodes near cursor
//   modern   — floating geometric polygons connected by lines
//   light    — golden fireflies + ink drop mouse trail
//   pride    — rainbow particle fountain with wind interaction

import { animateElement } from '../logo-animation.js';

// ── Helpers ──────────────────────────────────────
const isMobile = () => window.innerWidth < 768;
const mobileScale = (n) => isMobile() ? Math.floor(n * 0.6) : n;
const getTheme = () => document.documentElement.getAttribute('data-theme') || 'dracula';
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function renderHome(container) {
  container.innerHTML = `
    <div class="home-page">
      <canvas id="home-canvas"></canvas>
      <div class="home-content">
        <h1 class="home-title" id="home-title">DOOGLE</h1>
        <p class="home-subtitle">decentralized peer-to-peer search</p>
        <a href="#/search" class="home-cta" id="home-cta">
          <span id="home-cta-text">explore the web</span>
          <span class="home-cta-arrow">\u2192</span>
        </a>
      </div>
    </div>
  `;

  const canvas = document.getElementById('home-canvas');
  const ctx = canvas.getContext('2d');
  const mouse = { x: -1000, y: -1000, down: false, clickX: -1000, clickY: -1000, clickTime: 0 };
  let animId = null;
  let currentAnimation = null;
  let cleanups = [];

  // ── Canvas resize ──────────────────────────────
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  cleanups.push(() => window.removeEventListener('resize', resize));

  // ── Mouse / touch tracking ─────────────────────
  function onMouseMove(e) { mouse.x = e.clientX; mouse.y = e.clientY; }
  function onTouchMove(e) {
    if (e.touches.length > 0) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
  }
  function onClick(e) {
    mouse.clickX = e.clientX ?? e.touches?.[0]?.clientX ?? mouse.x;
    mouse.clickY = e.clientY ?? e.touches?.[0]?.clientY ?? mouse.y;
    mouse.clickTime = performance.now();
  }
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('touchmove', onTouchMove, { passive: true });
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchend', onClick);
  cleanups.push(() => {
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('touchend', onClick);
  });

  // ── Keyboard: Enter/Space → search ─────────────
  function onKeyDown(e) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.location.hash = '#/search';
    }
  }
  document.addEventListener('keydown', onKeyDown);
  cleanups.push(() => document.removeEventListener('keydown', onKeyDown));

  // ── Start animation for current theme ──────────
  function startAnim(theme) {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (currentAnimation && currentAnimation.cleanup) currentAnimation.cleanup();
    currentAnimation = null;

    switch (theme) {
      case 'dracula': currentAnimation = draculaSwarm(ctx, canvas, mouse, (id) => { animId = id; }); break;
      case 'storm':   currentAnimation = stormFront(ctx, canvas, mouse, (id) => { animId = id; }); break;
      case 'crt':     currentAnimation = crtDecode(ctx, canvas, mouse, (id) => { animId = id; }); break;
      case 'modern':  currentAnimation = modernPolygons(ctx, canvas, mouse, (id) => { animId = id; }); break;
      case 'light':   currentAnimation = lightFireflies(ctx, canvas, mouse, (id) => { animId = id; }); break;
      case 'pride':   currentAnimation = prideFountain(ctx, canvas, mouse, (id) => { animId = id; }); break;
      default:        currentAnimation = draculaSwarm(ctx, canvas, mouse, (id) => { animId = id; }); break;
    }
  }

  function onThemeChange(e) { startAnim(e.detail.theme); }
  window.addEventListener('themechange', onThemeChange);
  cleanups.push(() => window.removeEventListener('themechange', onThemeChange));

  // ── Entrance choreography ──────────────────────
  startAnim(getTheme());

  // Title animation at 300ms
  const titleEl = document.getElementById('home-title');
  let titleCleanup = null;
  setTimeout(() => {
    if (titleEl) titleCleanup = animateElement(titleEl, 'DOOGLE');
  }, 300);

  // CTA text animation at 1200ms
  const ctaTextEl = document.getElementById('home-cta-text');
  let ctaCleanup = null;
  setTimeout(() => {
    if (ctaTextEl) ctaCleanup = animateElement(ctaTextEl, 'explore the web');
  }, 1200);

  // ── Page cleanup (called by router) ────────────
  window._pageCleanup = () => {
    if (animId) cancelAnimationFrame(animId);
    if (currentAnimation && currentAnimation.cleanup) currentAnimation.cleanup();
    cleanups.forEach(fn => fn());
    if (titleCleanup) titleCleanup();
    if (ctaCleanup) ctaCleanup();
  };
}

// ═════════════════════════════════════════════════
// DRACULA — Vampiric Vortex
// Pulsing energy core, multi-ring orbits with glowing trails,
// tendrils that reach toward cursor, shockwave + bat swarm on click
// ═════════════════════════════════════════════════
function draculaSwarm(ctx, canvas, mouse, setAnimId) {
  const cx = () => canvas.width / 2;
  const cy = () => canvas.height / 2;

  // --- Orbit rings (3 concentric, counter-rotating) ---
  const rings = [
    { radius: 90,  count: mobileScale(30), speed: 0.003,  dir: 1,  trailLen: 6 },
    { radius: 160, count: mobileScale(50), speed: 0.002,  dir: -1, trailLen: 8 },
    { radius: 250, count: mobileScale(40), speed: 0.0015, dir: 1,  trailLen: 10 },
  ];

  const particles = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const angle = (Math.PI * 2 / ring.count) * i + Math.random() * 0.3;
      particles.push({
        angle,
        ring,
        orbitOffset: (Math.random() - 0.5) * 30,  // radial wobble
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.01 + Math.random() * 0.02,
        x: 0, y: 0, vx: 0, vy: 0,
        trail: [],
        size: 1.2 + Math.random() * 2.5,
        isCrimson: Math.random() < 0.25,
        alpha: 0.4 + Math.random() * 0.4,
      });
    }
  }

  // --- Bats ---
  let bats = [];
  // --- Shockwaves ---
  let shockwaves = [];
  // --- Embers (post-click floating sparks) ---
  let embers = [];

  let time = 0;

  function draw() {
    // Soft fade for trails (don't clearRect)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    time += 0.016;
    const ccx = cx(), ccy = cy();
    const now = performance.now();
    const clickAge = (now - mouse.clickTime) / 1000;

    // ── Pulsing energy core ──────────────────────
    const corePulse = Math.sin(time * 2) * 0.3 + 0.7;
    const coreSize = 35 * corePulse;
    // Outer crimson haze
    const coreG1 = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, coreSize * 3);
    coreG1.addColorStop(0, `rgba(180, 20, 50, ${0.08 * corePulse})`);
    coreG1.addColorStop(0.5, `rgba(120, 10, 30, ${0.04 * corePulse})`);
    coreG1.addColorStop(1, 'rgba(120, 10, 30, 0)');
    ctx.beginPath();
    ctx.arc(ccx, ccy, coreSize * 3, 0, Math.PI * 2);
    ctx.fillStyle = coreG1;
    ctx.fill();
    // Inner cyan-white core
    const coreG2 = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, coreSize);
    coreG2.addColorStop(0, `rgba(180, 240, 255, ${0.35 * corePulse})`);
    coreG2.addColorStop(0.3, `rgba(0, 212, 255, ${0.2 * corePulse})`);
    coreG2.addColorStop(1, 'rgba(0, 212, 255, 0)');
    ctx.beginPath();
    ctx.arc(ccx, ccy, coreSize, 0, Math.PI * 2);
    ctx.fillStyle = coreG2;
    ctx.fill();

    // ── Particles with trails ────────────────────
    for (const p of particles) {
      p.angle += p.ring.speed * p.ring.dir;
      p.wobblePhase += p.wobbleSpeed;
      const wobble = Math.sin(p.wobblePhase) * p.orbitOffset;
      const r = p.ring.radius + wobble;

      // Target orbit position
      let tx = ccx + Math.cos(p.angle) * r;
      let ty = ccy + Math.sin(p.angle) * r;

      // Mouse tendril — particles stretch toward cursor
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 280 && dist > 1) {
        const force = ((280 - dist) / 280) ** 2 * 0.15;
        tx += dx * force * 2.5;
        ty += dy * force * 2.5;
      }

      // Click explosion
      if (clickAge < 1.2) {
        const cdx = p.x - mouse.clickX;
        const cdy = p.y - mouse.clickY;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist < 400 && cdist > 1) {
          const t01 = clickAge / 1.2;
          const push = (1 - t01) * (400 - cdist) / 400 * 18;
          p.vx += (cdx / cdist) * push;
          p.vy += (cdy / cdist) * push;
        }
      }

      // Spring physics
      p.vx += (tx - p.x) * 0.02;
      p.vy += (ty - p.y) * 0.02;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.x += p.vx;
      p.y += p.vy;

      // Record trail
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > p.ring.trailLen) p.trail.shift();

      // Draw trail
      if (p.trail.length > 1) {
        for (let t = 0; t < p.trail.length - 1; t++) {
          const a = (t / p.trail.length) * p.alpha * 0.3;
          ctx.beginPath();
          ctx.moveTo(p.trail[t].x, p.trail[t].y);
          ctx.lineTo(p.trail[t + 1].x, p.trail[t + 1].y);
          ctx.strokeStyle = p.isCrimson
            ? `rgba(200, 30, 60, ${a})`
            : `rgba(0, 212, 255, ${a})`;
          ctx.lineWidth = p.size * 0.6;
          ctx.stroke();
        }
      }

      // Draw particle with glow
      const glowSize = p.size * (1 + Math.sin(time * 3 + p.angle) * 0.3);
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowSize * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.isCrimson
        ? `rgba(200, 30, 60, ${p.alpha * 0.08})`
        : `rgba(0, 212, 255, ${p.alpha * 0.08})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
      ctx.fillStyle = p.isCrimson
        ? `rgba(220, 50, 80, ${p.alpha})`
        : `rgba(0, 212, 255, ${p.alpha})`;
      ctx.fill();
    }

    // ── Shockwaves ───────────────────────────────
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i];
      s.radius += 5;
      s.life -= 0.018;
      if (s.life <= 0) { shockwaves.splice(i, 1); continue; }
      // Double ring
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 212, 255, ${s.life * 0.3})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 30, 60, ${s.life * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ── Embers ───────────────────────────────────
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.x += e.vx;
      e.y += e.vy;
      e.vy -= 0.015;
      e.vx *= 0.995;
      e.life -= 0.008;
      if (e.life <= 0) { embers.splice(i, 1); continue; }
      const flicker = Math.sin(time * 15 + e.phase) > 0 ? 1 : 0.4;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * e.life, 0, Math.PI * 2);
      ctx.fillStyle = e.crimson
        ? `rgba(255, 80, 60, ${e.life * 0.7 * flicker})`
        : `rgba(100, 230, 255, ${e.life * 0.6 * flicker})`;
      ctx.fill();
    }

    // ── Bats ─────────────────────────────────────
    for (let i = bats.length - 1; i >= 0; i--) {
      const b = bats[i];
      // Bats steer upward + spread with slight homing drift
      b.vx += (Math.sin(b.wobble) * 0.1);
      b.vy -= 0.06;
      b.wobble += b.wobbleSpeed;
      b.x += b.vx;
      b.y += b.vy;
      b.life -= 0.01;
      if (b.life <= 0) { bats.splice(i, 1); continue; }
      drawMiniBat(ctx, b.x, b.y, b.size, b.life, b.wingPhase);
      b.wingPhase += 0.12 + b.speed * 0.02;
    }

    // ── Spawn on click ───────────────────────────
    if (clickAge < 0.05 && mouse.clickTime > 0) {
      // Shockwave
      shockwaves.push({ x: mouse.clickX, y: mouse.clickY, radius: 10, life: 1 });
      // Bats scatter
      const batCount = mobileScale(10);
      for (let i = 0; i < batCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3;
        bats.push({
          x: mouse.clickX, y: mouse.clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.5 - 1.5,
          size: 10 + Math.random() * 12,
          life: 1,
          wingPhase: Math.random() * Math.PI * 2,
          speed,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.03 + Math.random() * 0.04,
        });
      }
      // Embers burst
      const emberCount = mobileScale(25);
      for (let i = 0; i < emberCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 5;
        embers.push({
          x: mouse.clickX, y: mouse.clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 1 + Math.random() * 3,
          life: 1,
          phase: Math.random() * Math.PI * 2,
          crimson: Math.random() < 0.5,
        });
      }
    }

    setAnimId(requestAnimationFrame(draw));
  }

  // Initialize particle positions before first frame
  const initCx = cx(), initCy = cy();
  for (const p of particles) {
    const r = p.ring.radius + Math.sin(p.wobblePhase) * p.orbitOffset;
    p.x = initCx + Math.cos(p.angle) * r;
    p.y = initCy + Math.sin(p.angle) * r;
  }

  draw();
  return { cleanup: () => { bats = []; shockwaves = []; embers = []; } };
}

function drawMiniBat(ctx, x, y, size, alpha, wingPhase) {
  const wing = Math.sin(wingPhase) * 0.7;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha * 0.65;
  // Body — dark with cyan highlight
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.13, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = `rgba(200, 30, 60, ${0.8})`;
  ctx.beginPath();
  ctx.arc(-size * 0.06, -size * 0.12, size * 0.04, 0, Math.PI * 2);
  ctx.arc(size * 0.06, -size * 0.12, size * 0.04, 0, Math.PI * 2);
  ctx.fill();
  // Left wing
  ctx.fillStyle = `rgba(0, 180, 220, ${0.3 + wing * 0.15})`;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.1);
  ctx.bezierCurveTo(-size * 0.3, -size * (0.5 + wing * 0.3), -size * 0.9, -size * (0.2 + wing * 0.2), -size * 0.85, size * wing * 0.2);
  ctx.bezierCurveTo(-size * 0.5, size * 0.2, -size * 0.2, size * 0.15, 0, size * 0.1);
  ctx.fill();
  // Right wing
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.1);
  ctx.bezierCurveTo(size * 0.3, -size * (0.5 + wing * 0.3), size * 0.9, -size * (0.2 + wing * 0.2), size * 0.85, size * wing * 0.2);
  ctx.bezierCurveTo(size * 0.5, size * 0.2, size * 0.2, size * 0.15, 0, size * 0.1);
  ctx.fill();
  // Wing membrane glow
  ctx.strokeStyle = `rgba(0, 212, 255, ${0.15 * alpha})`;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, -size * 0.1);
  ctx.lineTo(-size * 0.7, -size * (0.1 + wing * 0.15));
  ctx.moveTo(-size * 0.15, 0);
  ctx.lineTo(-size * 0.6, size * wing * 0.1);
  ctx.moveTo(size * 0.2, -size * 0.1);
  ctx.lineTo(size * 0.7, -size * (0.1 + wing * 0.15));
  ctx.moveTo(size * 0.15, 0);
  ctx.lineTo(size * 0.6, size * wing * 0.1);
  ctx.stroke();
  ctx.restore();
}

// ═════════════════════════════════════════════════
// Storm — Falling rain with mouse ripples + click lightning
// ═════════════════════════════════════════════════
function stormFront(ctx, canvas, mouse, setAnimId) {
  const dropCount = mobileScale(120);
  const drops = [];
  const splashes = [];
  const ripples = [];
  let bolts = [];
  let flashAlpha = 0;
  let time = 0;

  for (let i = 0; i < dropCount; i++) drops.push(makeDrop());

  function makeDrop() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height * 1.5,
      len: 12 + Math.random() * 22,
      speed: 4 + Math.random() * 5,
      opacity: 0.08 + Math.random() * 0.15,
      drift: -0.3 + Math.random() * 0.1, // slight wind to the left
      width: 0.5 + Math.random() * 1,
    };
  }

  function generateBolt(x, y, angle, depth) {
    const segments = [];
    const len = 100 + Math.random() * 200;
    const steps = 8 + Math.floor(Math.random() * 6);
    let cx = x, cy = y;
    for (let i = 0; i < steps; i++) {
      const jitter = (Math.random() - 0.5) * 50;
      cx += Math.sin(angle) * (len / steps) + jitter;
      cy += Math.cos(angle) * (len / steps);
      segments.push({ x: cx, y: cy });
    }
    const branches = [];
    if (depth < 2) {
      for (let i = 2; i < segments.length; i++) {
        if (Math.random() < 0.35) {
          branches.push(generateBolt(segments[i].x, segments[i].y, angle + (Math.random() - 0.5) * 1.4, depth + 1));
        }
      }
    }
    return { startX: x, startY: y, segments, branches, width: Math.max(0.5, 2.5 - depth) };
  }

  function drawBolt(bolt, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#d0eaff';
    ctx.lineWidth = bolt.width;
    ctx.shadowColor = '#7eb8da';
    ctx.shadowBlur = 12 + bolt.width * 5;
    ctx.beginPath();
    ctx.moveTo(bolt.startX, bolt.startY);
    for (const seg of bolt.segments) ctx.lineTo(seg.x, seg.y);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(0.4, bolt.width * 0.4);
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(bolt.startX, bolt.startY);
    for (const seg of bolt.segments) ctx.lineTo(seg.x, seg.y);
    ctx.stroke();
    ctx.restore();
    for (const branch of bolt.branches) drawBolt(branch, alpha * 0.6);
  }

  // Fill initial frame with theme bg so there's no black flash
  const style = getComputedStyle(document.documentElement);
  const bgColor = style.getPropertyValue('--bg-primary').trim() || '#0b0e14';
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  function draw() {
    // Trail fade using theme bg with low alpha for smooth streaks
    ctx.fillStyle = hexToRgba(bgColor, 0.18);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    time += 0.016;
    const now = performance.now();
    const clickAge = (now - mouse.clickTime) / 1000;

    // Rain drops
    for (const d of drops) {
      // Mouse repulsion — drops bend away from cursor
      let dx = 0;
      const ddx = d.x - mouse.x;
      const ddy = d.y - mouse.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < 150 && dist > 1) {
        dx = (ddx / dist) * ((150 - dist) / 150) * 3;
      }

      ctx.save();
      ctx.globalAlpha = d.opacity;
      ctx.strokeStyle = '#7eb8da';
      ctx.lineWidth = d.width;
      ctx.beginPath();
      ctx.moveTo(d.x + dx, d.y);
      ctx.lineTo(d.x + d.drift * d.len + dx, d.y + d.len);
      ctx.stroke();
      ctx.restore();

      d.y += d.speed;
      d.x += d.drift * 0.5;

      if (d.y > canvas.height - 8) {
        // Splash particles — spawn above bottom edge so they're visible
        const groundY = canvas.height - 8;
        if (Math.random() < 0.3) {
          for (let s = 0; s < 2 + Math.floor(Math.random() * 3); s++) {
            const ang = Math.PI + (Math.random() - 0.5) * 1.5;
            splashes.push({
              x: d.x, y: groundY,
              vx: Math.cos(ang) * (1 + Math.random() * 2),
              vy: Math.sin(ang) * (1.5 + Math.random() * 2),
              life: 1, size: 0.5 + Math.random(),
            });
          }
        }
        // Ripple (half-circle at ground)
        ripples.push({ x: d.x, y: groundY, radius: 0, life: 1, full: false });
        Object.assign(d, makeDrop());
      }
    }

    // Splash particles
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.x += s.vx; s.y += s.vy;
      s.vy += 0.1; // gravity
      s.life -= 0.03;
      if (s.life <= 0 || s.y > canvas.height) { splashes.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = s.life * 0.4;
      ctx.fillStyle = '#7eb8da';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.radius += r.full ? 1.5 : 0.6;
      r.life -= r.full ? 0.018 : 0.025;
      if (r.life <= 0) { ripples.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = r.life * (r.full ? 0.25 : 0.12);
      ctx.strokeStyle = '#7eb8da';
      ctx.lineWidth = r.full ? 1 : 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, r.full ? 0 : Math.PI, r.full ? Math.PI * 2 : 0);
      ctx.stroke();
      ctx.restore();
    }

    // Click → spawn lightning bolt at click position
    if (clickAge < 0.05 && mouse.clickTime > 0) {
      bolts.push({
        bolt: generateBolt(mouse.clickX, Math.max(0, mouse.clickY - 120), Math.PI * (0.9 + Math.random() * 0.2), 0),
        born: now,
        duration: 250 + Math.random() * 200,
      });
      flashAlpha = 0.08 + Math.random() * 0.05;
      // Ripple burst — centered where the bolt originates
      const rippleY = Math.max(0, mouse.clickY - 100);
      for (let r = 0; r < 5; r++) {
        ripples.push({ x: mouse.clickX + (Math.random() - 0.5) * 40, y: rippleY + Math.random() * 30, radius: 0, life: 1, full: true });
      }
    }

    // Draw bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const age = now - b.born;
      if (age < b.duration) {
        const flicker = Math.random() > 0.2 ? 1 : 0;
        drawBolt(b.bolt, (1 - age / b.duration) * flicker);
      } else {
        bolts.splice(i, 1);
      }
    }

    // Screen flash
    if (flashAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = '#7eb8da';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      flashAlpha *= 0.9;
    }

    setAnimId(requestAnimationFrame(draw));
  }

  draw();
  return { cleanup: () => { bolts = []; } };
}

// ═════════════════════════════════════════════════
// CRT — Matrix grid that decodes near cursor
// ═════════════════════════════════════════════════
function crtDecode(ctx, canvas, mouse, setAnimId) {
  const words = ['CRAWL', 'INDEX', 'PEER', 'NODE', 'HASH', 'LINK', 'QUERY', 'SHARD', 'ROUTE', 'MESH', 'SYNC', 'DATA', 'FETCH', 'TRUST', 'RANK'];
  const randChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコ0123456789!@#$%^&*';
  const fontSize = isMobile() ? 12 : 16;
  const spacing = fontSize * 1.8;

  let grid = [];
  let ripples = [];

  function initGrid() {
    grid = [];
    const cols = Math.ceil(canvas.width / spacing) + 1;
    const rows = Math.ceil(canvas.height / spacing) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const word = words[Math.floor(Math.random() * words.length)];
        grid.push({
          x: c * spacing + spacing / 2,
          y: r * spacing + spacing / 2,
          char: randChars[Math.floor(Math.random() * randChars.length)],
          targetChar: word[c % word.length],
          decoded: false,
          decodeProgress: 0,
          flickerTimer: Math.random() * 100,
        });
      }
    }
  }
  initGrid();

  const onResize = () => initGrid();
  window.addEventListener('resize', onResize);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    const clickAge = (now - mouse.clickTime) / 1000;

    // Update ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].radius += 3;
      ripples[i].life -= 0.012;
      if (ripples[i].life <= 0) ripples.splice(i, 1);
    }

    // Spawn ripple on click
    if (clickAge < 0.05 && mouse.clickTime > 0) {
      ripples.push({ x: mouse.clickX, y: mouse.clickY, radius: 0, life: 1 });
    }

    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const cell of grid) {
      cell.flickerTimer += 0.05;

      // Check proximity to mouse
      const dx = mouse.x - cell.x;
      const dy = mouse.y - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const decodeRadius = 120;

      // Check if inside any ripple
      let inRipple = false;
      for (const rip of ripples) {
        const rd = Math.sqrt((rip.x - cell.x) ** 2 + (rip.y - cell.y) ** 2);
        if (Math.abs(rd - rip.radius) < 40) { inRipple = true; break; }
      }

      if (dist < decodeRadius || inRipple) {
        cell.decodeProgress = Math.min(1, cell.decodeProgress + 0.06);
      } else {
        cell.decodeProgress = Math.max(0, cell.decodeProgress - 0.02);
      }

      let ch, alpha;
      if (cell.decodeProgress > 0.7) {
        ch = cell.targetChar;
        alpha = 0.4 + cell.decodeProgress * 0.5;
      } else if (cell.decodeProgress > 0) {
        // Scrambling
        ch = randChars[Math.floor(Math.random() * randChars.length)];
        alpha = 0.15 + cell.decodeProgress * 0.3;
      } else {
        // Ambient noise
        if (Math.random() > 0.98) cell.char = randChars[Math.floor(Math.random() * randChars.length)];
        ch = cell.char;
        alpha = 0.06 + Math.sin(cell.flickerTimer) * 0.03;
      }

      ctx.fillStyle = `rgba(51, 255, 51, ${alpha})`;
      ctx.fillText(ch, cell.x, cell.y);
    }

    // Draw ripple rings
    for (const rip of ripples) {
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(51, 255, 51, ${rip.life * 0.15})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    setAnimId(requestAnimationFrame(draw));
  }

  draw();
  return { cleanup: () => { window.removeEventListener('resize', onResize); ripples = []; } };
}

// ═════════════════════════════════════════════════
// MODERN — Floating geometric polygons
// ═════════════════════════════════════════════════
function modernPolygons(ctx, canvas, mouse, setAnimId) {
  const count = mobileScale(40);
  const shapes = [];
  let fragments = [];

  function makeShape(x, y, extraVel) {
    const sides = [3, 4, 5, 6][Math.floor(Math.random() * 4)];
    const v = extraVel || 1;
    return {
      x: x ?? Math.random() * canvas.width,
      y: y ?? Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4 * v,
      vy: (Math.random() - 0.5) * 0.4 * v,
      sides,
      size: 8 + Math.random() * 20,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.01,
      alpha: 0.15 + Math.random() * 0.2,
    };
  }

  for (let i = 0; i < count; i++) shapes.push(makeShape());

  function drawPolygon(x, y, sides, size, rotation, alpha) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rotation + (Math.PI * 2 / sides) * i;
      const px = x + Math.cos(a) * size;
      const py = y + Math.sin(a) * size;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  const linkDist = 150;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    const clickAge = (now - mouse.clickTime) / 1000;

    // Spawn fragments on click
    if (clickAge < 0.05 && mouse.clickTime > 0) {
      for (let i = 0; i < 5; i++) {
        const s = makeShape(mouse.clickX, mouse.clickY, 6);
        s.fragment = true;
        s.life = 1;
        s.size *= 0.6;
        fragments.push(s);
      }
    }

    // Draw connections
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const dx = shapes[i].x - shapes[j].x;
        const dy = shapes[i].y - shapes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < linkDist) {
          const a = (1 - dist / linkDist) * 0.1;
          ctx.strokeStyle = `rgba(99, 102, 241, ${a})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(shapes[i].x, shapes[i].y);
          ctx.lineTo(shapes[j].x, shapes[j].y);
          ctx.stroke();
        }
      }
    }

    // Update & draw shapes
    for (const s of shapes) {
      // Mouse gravity well with tangential velocity
      const dx = mouse.x - s.x;
      const dy = mouse.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200 && dist > 5) {
        const force = (200 - dist) / 200 * 0.03;
        // Radial + tangential
        s.vx += dx / dist * force * 0.5 + (-dy / dist) * force * 1.5;
        s.vy += dy / dist * force * 0.5 + (dx / dist) * force * 1.5;
      }

      s.vx *= 0.98;
      s.vy *= 0.98;
      s.x += s.vx;
      s.y += s.vy;
      s.rotation += s.rotSpeed;

      // Wrap
      if (s.x < -30) s.x = canvas.width + 30;
      if (s.x > canvas.width + 30) s.x = -30;
      if (s.y < -30) s.y = canvas.height + 30;
      if (s.y > canvas.height + 30) s.y = -30;

      drawPolygon(s.x, s.y, s.sides, s.size, s.rotation, s.alpha);
    }

    // Fragments
    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i];
      f.x += f.vx;
      f.y += f.vy;
      f.vx *= 0.96;
      f.vy *= 0.96;
      f.rotation += f.rotSpeed * 3;
      f.life -= 0.015;
      if (f.life <= 0) { fragments.splice(i, 1); continue; }
      drawPolygon(f.x, f.y, f.sides, f.size * f.life, f.rotation, f.alpha * f.life);
    }

    setAnimId(requestAnimationFrame(draw));
  }

  draw();
  return { cleanup: () => { fragments = []; } };
}

// ═════════════════════════════════════════════════
// LIGHT — Golden fireflies + ink drop trail
// ═════════════════════════════════════════════════
function lightFireflies(ctx, canvas, mouse, setAnimId) {
  const count = mobileScale(60);
  const fireflies = [];
  let inkDrops = [];
  let lastInkTime = 0;

  for (let i = 0; i < count; i++) {
    fireflies.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.01 + Math.random() * 0.02,
      size: 2 + Math.random() * 3,
      brightness: 0.3 + Math.random() * 0.5,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    const clickAge = (now - mouse.clickTime) / 1000;

    // Ink trail from mouse
    if (now - lastInkTime > 80 && mouse.x > 0 && mouse.y > 0) {
      inkDrops.push({
        x: mouse.x + (Math.random() - 0.5) * 10,
        y: mouse.y + (Math.random() - 0.5) * 10,
        radius: 3 + Math.random() * 8,
        maxRadius: 15 + Math.random() * 15,
        alpha: 0.12,
      });
      lastInkTime = now;
    }

    // Click splash
    if (clickAge < 0.05 && mouse.clickTime > 0) {
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 30;
        inkDrops.push({
          x: mouse.clickX + Math.cos(angle) * dist,
          y: mouse.clickY + Math.sin(angle) * dist,
          radius: 5 + Math.random() * 15,
          maxRadius: 25 + Math.random() * 25,
          alpha: 0.15 + Math.random() * 0.1,
        });
      }
    }

    // Draw & update ink drops
    for (let i = inkDrops.length - 1; i >= 0; i--) {
      const d = inkDrops[i];
      d.radius = Math.min(d.radius + 0.3, d.maxRadius);
      d.alpha *= 0.985;
      if (d.alpha < 0.005) { inkDrops.splice(i, 1); continue; }

      ctx.beginPath();
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.radius);
      g.addColorStop(0, `rgba(0, 80, 160, ${d.alpha})`);
      g.addColorStop(1, `rgba(0, 80, 160, 0)`);
      ctx.fillStyle = g;
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fireflies
    for (const f of fireflies) {
      f.phase += f.phaseSpeed;
      const glow = (Math.sin(f.phase) * 0.5 + 0.5) * f.brightness;

      // Sine-wave drift
      f.x += f.vx + Math.sin(f.phase * 0.7) * 0.2;
      f.y += f.vy + Math.cos(f.phase * 0.5) * 0.15;

      // Wrap
      if (f.x < -10) f.x = canvas.width + 10;
      if (f.x > canvas.width + 10) f.x = -10;
      if (f.y < -10) f.y = canvas.height + 10;
      if (f.y > canvas.height + 10) f.y = -10;

      // Draw glow
      ctx.beginPath();
      const fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 3);
      fg.addColorStop(0, `rgba(200, 170, 50, ${glow * 0.5})`);
      fg.addColorStop(0.4, `rgba(200, 170, 50, ${glow * 0.15})`);
      fg.addColorStop(1, `rgba(200, 170, 50, 0)`);
      ctx.fillStyle = fg;
      ctx.arc(f.x, f.y, f.size * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 220, 100, ${glow})`;
      ctx.fill();
    }

    setAnimId(requestAnimationFrame(draw));
  }

  draw();
  return { cleanup: () => { inkDrops = []; } };
}

// ═════════════════════════════════════════════════
// PRIDE — Rainbow particle fountain
// ═════════════════════════════════════════════════
function prideFountain(ctx, canvas, mouse, setAnimId) {
  const colors = [
    [255, 107, 107], // red
    [255, 165,   0], // orange
    [252, 196,  25], // yellow
    [ 81, 207, 102], // green
    [ 51, 154, 240], // blue
    [204,  93, 232], // purple
  ];

  let particles = [];
  const maxParticles = mobileScale(300);
  let spawnRate = isMobile() ? 2 : 4;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    const clickAge = (now - mouse.clickTime) / 1000;

    // Spawn fountain particles from bottom center
    const fountainX = canvas.width / 2;
    const fountainY = canvas.height;
    if (particles.length < maxParticles) {
      for (let i = 0; i < spawnRate; i++) {
        const ci = Math.floor(Math.random() * colors.length);
        const [r, g, b] = colors[ci];
        particles.push({
          x: fountainX + (Math.random() - 0.5) * 40,
          y: fountainY,
          vx: (Math.random() - 0.5) * 3,
          vy: -3 - Math.random() * 4,
          r, g, b,
          size: 2 + Math.random() * 3,
          life: 1,
          decay: 0.003 + Math.random() * 0.004,
          gravity: 0.02 + Math.random() * 0.01,
        });
      }
    }

    // Click burst
    if (clickAge < 0.05 && mouse.clickTime > 0) {
      const burstCount = mobileScale(40);
      for (let i = 0; i < burstCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        const ci = Math.floor(Math.random() * colors.length);
        const [r, g, b] = colors[ci];
        particles.push({
          x: mouse.clickX, y: mouse.clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r, g, b,
          size: 2 + Math.random() * 4,
          life: 1,
          decay: 0.008 + Math.random() * 0.008,
          gravity: 0.03,
          confetti: true,
        });
      }
    }

    // Update & draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // Wind from cursor
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200 && dist > 1) {
        const force = (200 - dist) / 200 * 0.3;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force * 0.5;
      }

      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;

      if (p.life <= 0 || p.y > canvas.height + 20) {
        particles.splice(i, 1);
        continue;
      }

      // Draw
      ctx.beginPath();
      if (p.confetti) {
        // Confetti: small rectangles
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.vx * 0.5);
        ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.life * 0.7})`;
        ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        ctx.restore();
      } else {
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.life * 0.5})`;
        ctx.fill();
      }
    }

    setAnimId(requestAnimationFrame(draw));
  }

  draw();
  return { cleanup: () => { particles = []; } };
}
