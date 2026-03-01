// Doogle v2 — Animated Logo Text
// Each theme gets a unique animation for the "DOOGLE" navbar text:
//   dracula  — blood drip: letters drip down and reform
//   crt      — glitch: random offset flickers + scan distortion
//   modern   — block build: letters assemble from stacking blocks
//   light    — ink write: letters appear with quill-pen stroke
//   pride    — rainbow shimmer: cycling per-letter rainbow colors

const LETTERS = 'DOOGLE';
let currentTheme = null;
let interval = null;
let animFrame = null;

export function initLogoAnimation() {
  const el = document.getElementById('logo-text');
  if (!el) return;

  window.addEventListener('themechange', (e) => {
    applyLogoAnim(e.detail.theme);
  });

  const theme = document.documentElement.getAttribute('data-theme') || 'dracula';
  applyLogoAnim(theme);
}

function applyLogoAnim(theme) {
  cleanup();
  currentTheme = theme;
  const el = document.getElementById('logo-text');
  if (!el) return;

  // Reset to base state
  el.className = 'logo-text';
  el.innerHTML = LETTERS;
  el.style.cssText = '';

  switch (theme) {
    case 'dracula': draculaDrip(el); break;
    case 'crt':     crtGlitch(el); break;
    case 'modern':  blockBuild(el); break;
    case 'light':   inkWrite(el); break;
    case 'pride':   rainbowShimmer(el); break;
    default:        draculaDrip(el); break;
  }
}

function cleanup() {
  if (interval) { clearInterval(interval); interval = null; }
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
}

function wrapLetters(el) {
  el.innerHTML = LETTERS.split('').map((ch, i) =>
    `<span class="logo-letter" data-index="${i}" style="display:inline-block;position:relative">${ch}</span>`
  ).join('');
  return el.querySelectorAll('.logo-letter');
}

// ─────────────────────────────────────────────────
// Dracula: Blood Drip — letters periodically drip down and reform
// ─────────────────────────────────────────────────
function draculaDrip(el) {
  const letters = wrapLetters(el);
  el.classList.add('logo-anim-dracula');

  function drip() {
    const idx = Math.floor(Math.random() * letters.length);
    const letter = letters[idx];

    // Create drip droplet
    const drop = document.createElement('span');
    drop.className = 'logo-drip-drop';
    drop.textContent = letter.textContent;
    letter.appendChild(drop);

    // Animate letter down and back
    letter.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in';
    letter.style.transform = 'translateY(6px)';
    letter.style.opacity = '0.4';

    setTimeout(() => {
      letter.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out';
      letter.style.transform = 'translateY(0)';
      letter.style.opacity = '1';
    }, 400);

    setTimeout(() => {
      if (drop.parentNode) drop.remove();
      letter.style.transition = '';
    }, 1200);
  }

  // Initial drip cascade
  letters.forEach((l, i) => {
    l.style.opacity = '0';
    l.style.transform = 'translateY(-12px)';
    setTimeout(() => {
      l.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out';
      l.style.transform = 'translateY(0)';
      l.style.opacity = '1';
      setTimeout(() => { l.style.transition = ''; }, 600);
    }, 100 + i * 80);
  });

  interval = setInterval(drip, 3000);
}

// ─────────────────────────────────────────────────
// CRT: Glitch — random offset flickers + character swap
// ─────────────────────────────────────────────────
function crtGlitch(el) {
  const letters = wrapLetters(el);
  el.classList.add('logo-anim-crt');
  const glitchChars = '!@#$%^&*<>{}[]|/\\~';

  function glitch() {
    const idx = Math.floor(Math.random() * letters.length);
    const letter = letters[idx];
    const original = LETTERS[idx];

    // Random character swap
    letter.textContent = glitchChars[Math.floor(Math.random() * glitchChars.length)];

    // Offset
    const dx = (Math.random() - 0.5) * 6;
    const dy = (Math.random() - 0.5) * 3;
    letter.style.transform = `translate(${dx}px, ${dy}px)`;
    letter.style.textShadow = `${-dx}px 0 rgba(255,0,0,0.5), ${dx}px 0 rgba(0,255,255,0.5)`;

    setTimeout(() => {
      letter.textContent = original;
      letter.style.transform = '';
      letter.style.textShadow = '';
    }, 80 + Math.random() * 80);

    // Occasionally do a full-row glitch
    if (Math.random() > 0.7) {
      el.style.transform = `translateX(${(Math.random() - 0.5) * 4}px)`;
      setTimeout(() => { el.style.transform = ''; }, 60);
    }
  }

  // Burst: rapid glitches then calm
  function burst() {
    const count = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      setTimeout(glitch, i * 60);
    }
  }

  interval = setInterval(burst, 2500 + Math.random() * 2000);
}

// ─────────────────────────────────────────────────
// Modern: Block Build — letters assemble from stacking pieces
// ─────────────────────────────────────────────────
function blockBuild(el) {
  const letters = wrapLetters(el);
  el.classList.add('logo-anim-modern');

  // Initial build animation — letters slide in from random directions
  letters.forEach((l, i) => {
    const directions = [
      { x: 0, y: -20 },  // from top
      { x: 0, y: 20 },   // from bottom
      { x: -20, y: 0 },  // from left
      { x: 20, y: 0 },   // from right
    ];
    const dir = directions[i % directions.length];
    l.style.opacity = '0';
    l.style.transform = `translate(${dir.x}px, ${dir.y}px)`;

    setTimeout(() => {
      l.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out';
      l.style.transform = 'translate(0, 0)';
      l.style.opacity = '1';
      setTimeout(() => { l.style.transition = ''; }, 600);
    }, 150 + i * 100);
  });

  // Periodic rebuild: one letter disconnects and reconnects
  function rebuild() {
    const idx = Math.floor(Math.random() * letters.length);
    const letter = letters[idx];
    const dirs = [
      { x: 0, y: -8 },
      { x: 0, y: 8 },
      { x: -8, y: -4 },
      { x: 8, y: -4 },
    ];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];

    letter.style.transition = 'transform 0.3s ease-in, opacity 0.3s ease-in';
    letter.style.transform = `translate(${dir.x}px, ${dir.y}px)`;
    letter.style.opacity = '0.3';

    setTimeout(() => {
      letter.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease-out';
      letter.style.transform = 'translate(0, 0)';
      letter.style.opacity = '1';
      setTimeout(() => { letter.style.transition = ''; }, 500);
    }, 350);
  }

  interval = setInterval(rebuild, 3500);
}

// ─────────────────────────────────────────────────
// Light: Ink Write — letters appear with quill stroke reveal
// ─────────────────────────────────────────────────
function inkWrite(el) {
  const letters = wrapLetters(el);
  el.classList.add('logo-anim-light');

  // Initial write-in: each letter fades in with a slight upward stroke
  letters.forEach((l, i) => {
    l.style.opacity = '0';
    l.style.transform = 'translateY(4px) scaleY(0.3)';
    l.style.transformOrigin = 'bottom center';

    setTimeout(() => {
      l.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease-out';
      l.style.transform = 'translateY(0) scaleY(1)';
      l.style.opacity = '1';
      setTimeout(() => { l.style.transition = ''; }, 700);
    }, 200 + i * 120);
  });

  // Periodic: a letter gently fades and re-inks
  function reink() {
    const idx = Math.floor(Math.random() * letters.length);
    const letter = letters[idx];

    letter.style.transition = 'opacity 0.8s ease-in-out, transform 0.8s ease-in-out';
    letter.style.opacity = '0.2';
    letter.style.transform = 'translateY(2px) scaleY(0.8)';

    setTimeout(() => {
      letter.style.transition = 'opacity 0.6s ease-out, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
      letter.style.opacity = '1';
      letter.style.transform = 'translateY(0) scaleY(1)';
      setTimeout(() => { letter.style.transition = ''; }, 700);
    }, 800);
  }

  interval = setInterval(reink, 4000);
}

// ─────────────────────────────────────────────────
// Pride: Rainbow Shimmer — cycling per-letter rainbow colors
// ─────────────────────────────────────────────────
function rainbowShimmer(el) {
  const letters = wrapLetters(el);
  el.classList.add('logo-anim-pride');

  const colors = ['#ff6b6b', '#ffa500', '#fcc419', '#51cf66', '#339af0', '#cc5de8'];
  let offset = 0;

  function shimmer() {
    letters.forEach((l, i) => {
      const colorIdx = (i + offset) % colors.length;
      l.style.color = colors[colorIdx];
      l.style.textShadow = `0 0 8px ${colors[colorIdx]}44`;
      // Slight wave motion
      const wave = Math.sin((i + offset * 0.5) * 0.8) * 2;
      l.style.transform = `translateY(${wave}px)`;
    });
    offset++;
    animFrame = requestAnimationFrame(shimmer);
  }

  // Initial pop-in
  letters.forEach((l, i) => {
    l.style.opacity = '0';
    l.style.transform = 'scale(0.5) translateY(8px)';
    setTimeout(() => {
      l.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out';
      l.style.opacity = '1';
      l.style.transform = 'scale(1) translateY(0)';
      l.style.color = colors[i % colors.length];
      setTimeout(() => { l.style.transition = ''; }, 600);
    }, 80 + i * 70);
  });

  setTimeout(() => { shimmer(); }, 600);
}
