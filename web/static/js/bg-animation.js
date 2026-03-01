// Doogle v2 — Theme Background Animations
// Subtle, non-invasive canvas animations per theme.
// Each theme gets its own visual identity:
//   dracula  — drifting bats + mist particles
//   crt      — matrix character rain
//   modern   — connected particle mesh
//   light    — floating dust motes
//   pride    — aurora borealis rainbow wave

let canvas = null;
let ctx = null;
let animId = null;
let currentAnim = null;
let resizeHandler = null;

export function initBgAnimation() {
  canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();

  resizeHandler = () => resize();
  window.addEventListener('resize', resizeHandler);
  window.addEventListener('themechange', (e) => startAnimation(e.detail.theme));

  const theme = document.documentElement.getAttribute('data-theme') || 'dracula';
  startAnimation(theme);
}

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function startAnimation(theme) {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  if (currentAnim && currentAnim.cleanup) currentAnim.cleanup();
  currentAnim = null;

  switch (theme) {
    case 'crt':     currentAnim = matrixRain(); break;
    case 'dracula': currentAnim = draculaBats(); break;
    case 'modern':  currentAnim = particleMesh(); break;
    case 'light':   currentAnim = dustMotes(); break;
    case 'pride':   currentAnim = auroraWave(); break;
    default:        currentAnim = draculaBats(); break;
  }
}

function css(prop) {
  return getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
}

// ─────────────────────────────────────────────────
// CRT: Matrix Rain — multi-layer, varied speed/opacity, subtle background
// ─────────────────────────────────────────────────
function matrixRain() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソ0123456789';

  // Three layers with different densities, speeds, and opacities
  const layers = [
    { fontSize: 18, spacing: 5, speed: [0.06, 0.12], opacity: [0.06, 0.12] },  // far bg, slow, dim
    { fontSize: 14, spacing: 4, speed: [0.10, 0.22], opacity: [0.10, 0.18] },  // mid layer
    { fontSize: 11, spacing: 6, speed: [0.15, 0.30], opacity: [0.14, 0.22] },  // near, faster, still subtle
  ];

  let columns = [];

  function initColumns() {
    columns = [];
    for (const layer of layers) {
      const colSpacing = layer.fontSize * layer.spacing;
      const count = Math.floor(canvas.width / colSpacing);
      const cols = [];
      for (let i = 0; i < count; i++) {
        const speed = layer.speed[0] + Math.random() * (layer.speed[1] - layer.speed[0]);
        const opacity = layer.opacity[0] + Math.random() * (layer.opacity[1] - layer.opacity[0]);
        cols.push({
          x: i * colSpacing + colSpacing * 0.5,
          y: Math.random() * -80,
          speed,
          opacity,
          fontSize: layer.fontSize,
        });
      }
      columns.push(cols);
    }
  }

  initColumns();

  function draw() {
    // Slow fade — creates soft trails
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const layer of columns) {
      for (const col of layer) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const yPx = col.y * col.fontSize;

        ctx.font = col.fontSize + 'px monospace';
        ctx.fillStyle = `rgba(51, 255, 51, ${col.opacity})`;
        ctx.fillText(char, col.x, yPx);

        col.y += col.speed;

        if (yPx > canvas.height && Math.random() > 0.975) {
          col.y = Math.random() * -30;
          // Re-randomize speed slightly for organic feel
          col.speed *= 0.85 + Math.random() * 0.3;
        }
      }
    }

    animId = requestAnimationFrame(draw);
  }

  const onResize = () => initColumns();
  window.addEventListener('resize', onResize);

  draw();
  return { cleanup: () => window.removeEventListener('resize', onResize) };
}

// ─────────────────────────────────────────────────
// Dracula: Bats + Mist
// ─────────────────────────────────────────────────
function draculaBats() {
  const bats = [];
  const mist = [];
  const batCount = Math.max(5, Math.floor((canvas.width * canvas.height) / 200000));
  const mistCount = Math.max(10, Math.floor((canvas.width * canvas.height) / 80000));

  for (let i = 0; i < batCount; i++) {
    bats.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.3,
      size: 8 + Math.random() * 10,
      wingPhase: Math.random() * Math.PI * 2,
      wingSpeed: 0.04 + Math.random() * 0.03,
      opacity: 0.06 + Math.random() * 0.08,
    });
  }

  for (let i = 0; i < mistCount; i++) {
    mist.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 30 + Math.random() * 60,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.08,
      opacity: 0.008 + Math.random() * 0.015,
    });
  }

  function drawBat(b) {
    const wing = Math.sin(b.wingPhase) * 0.6;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalAlpha = b.opacity;
    ctx.fillStyle = '#00d4ff';

    // Body
    ctx.beginPath();
    ctx.ellipse(0, 0, b.size * 0.15, b.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Left wing
    ctx.beginPath();
    ctx.moveTo(0, -b.size * 0.1);
    ctx.quadraticCurveTo(-b.size * 0.5, -b.size * (0.4 + wing * 0.3), -b.size, b.size * wing * 0.2);
    ctx.quadraticCurveTo(-b.size * 0.4, b.size * 0.15, 0, b.size * 0.1);
    ctx.fill();

    // Right wing
    ctx.beginPath();
    ctx.moveTo(0, -b.size * 0.1);
    ctx.quadraticCurveTo(b.size * 0.5, -b.size * (0.4 + wing * 0.3), b.size, b.size * wing * 0.2);
    ctx.quadraticCurveTo(b.size * 0.4, b.size * 0.15, 0, b.size * 0.1);
    ctx.fill();

    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mist
    for (const m of mist) {
      ctx.beginPath();
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      g.addColorStop(0, `rgba(0, 212, 255, ${m.opacity})`);
      g.addColorStop(1, 'rgba(0, 212, 255, 0)');
      ctx.fillStyle = g;
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();

      m.x += m.vx;
      m.y += m.vy;
      if (m.x < -m.r) m.x = canvas.width + m.r;
      if (m.x > canvas.width + m.r) m.x = -m.r;
      if (m.y < -m.r) m.y = canvas.height + m.r;
      if (m.y > canvas.height + m.r) m.y = -m.r;
    }

    // Bats
    for (const b of bats) {
      drawBat(b);
      b.wingPhase += b.wingSpeed;
      b.x += b.vx;
      b.y += b.vy;

      // Subtle sine drift
      b.y += Math.sin(b.wingPhase * 0.3) * 0.2;

      if (b.x < -30) b.x = canvas.width + 30;
      if (b.x > canvas.width + 30) b.x = -30;
      if (b.y < -30) b.y = canvas.height + 30;
      if (b.y > canvas.height + 30) b.y = -30;
    }

    animId = requestAnimationFrame(draw);
  }

  draw();
  return { cleanup: () => {} };
}

// ─────────────────────────────────────────────────
// Modern: Connected Particle Mesh
// ─────────────────────────────────────────────────
function particleMesh() {
  const count = Math.max(20, Math.floor((canvas.width * canvas.height) / 25000));
  const linkDist = 120;
  const particles = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 1 + Math.random() * 1.5,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < linkDist) {
          const alpha = (1 - dist / linkDist) * 0.08;
          ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    }

    animId = requestAnimationFrame(draw);
  }

  draw();
  return { cleanup: () => {} };
}

// ─────────────────────────────────────────────────
// Light: Floating Dust Motes
// ─────────────────────────────────────────────────
function dustMotes() {
  const count = Math.max(15, Math.floor((canvas.width * canvas.height) / 40000));
  const motes = [];

  for (let i = 0; i < count; i++) {
    motes.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 1 + Math.random() * 2.5,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.05 - Math.random() * 0.15, // float upward
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.005 + Math.random() * 0.01,
      opacity: 0.06 + Math.random() * 0.1,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const m of motes) {
      ctx.beginPath();
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 2);
      g.addColorStop(0, `rgba(0, 102, 204, ${m.opacity})`);
      g.addColorStop(1, 'rgba(0, 102, 204, 0)');
      ctx.fillStyle = g;
      ctx.arc(m.x, m.y, m.r * 2, 0, Math.PI * 2);
      ctx.fill();

      m.phase += m.phaseSpeed;
      m.x += m.vx + Math.sin(m.phase) * 0.15;
      m.y += m.vy;

      // Wrap
      if (m.y < -10) { m.y = canvas.height + 10; m.x = Math.random() * canvas.width; }
      if (m.x < -10) m.x = canvas.width + 10;
      if (m.x > canvas.width + 10) m.x = -10;
    }

    animId = requestAnimationFrame(draw);
  }

  draw();
  return { cleanup: () => {} };
}

// ─────────────────────────────────────────────────
// Pride: Aurora Borealis Rainbow Wave
// ─────────────────────────────────────────────────
function auroraWave() {
  const colors = [
    [255, 107, 107], // red
    [255, 165,   0], // orange
    [252, 196,  25], // yellow
    [ 81, 207, 102], // green
    [ 51, 154, 240], // blue
    [204,  93, 232], // purple
  ];

  let time = 0;
  const bands = 5;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let b = 0; b < bands; b++) {
      ctx.beginPath();

      const yBase = canvas.height * (0.15 + b * 0.15);
      const colorIdx = b % colors.length;
      const [r, g, bl] = colors[colorIdx];

      ctx.moveTo(0, canvas.height);

      for (let x = 0; x <= canvas.width; x += 4) {
        const wave1 = Math.sin((x * 0.003) + time * 0.5 + b * 1.2) * 40;
        const wave2 = Math.sin((x * 0.007) + time * 0.3 + b * 0.8) * 20;
        const wave3 = Math.sin((x * 0.001) + time * 0.15 + b * 2) * 60;
        const y = yBase + wave1 + wave2 + wave3;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, yBase - 80, 0, yBase + 80);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${bl}, 0)`);
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${bl}, 0.04)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);

      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Shimmer particles
    for (let i = 0; i < 3; i++) {
      const px = (Math.sin(time * 0.7 + i * 2.1) * 0.5 + 0.5) * canvas.width;
      const py = (Math.sin(time * 0.4 + i * 1.7) * 0.3 + 0.3) * canvas.height;
      const ci = (Math.floor(time * 2 + i) % colors.length);
      const [r, g, bl] = colors[ci];

      ctx.beginPath();
      const sg = ctx.createRadialGradient(px, py, 0, px, py, 30);
      sg.addColorStop(0, `rgba(${r}, ${g}, ${bl}, 0.06)`);
      sg.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
      ctx.fillStyle = sg;
      ctx.arc(px, py, 30, 0, Math.PI * 2);
      ctx.fill();
    }

    time += 0.008;
    animId = requestAnimationFrame(draw);
  }

  draw();
  return { cleanup: () => {} };
}
