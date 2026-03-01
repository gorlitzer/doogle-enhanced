// Doogle v2 — Animated Logo Text
// Each theme gets a unique animation for the "DOOGLE" navbar text:
//   dracula  — blood drip: letters drip down and reform
//   crt      — glitch: random offset flickers + scan distortion
//   modern   — block build: letters assemble from stacking blocks
//   light    — ink write: letters appear with quill-pen stroke
//   storm    — electric crackle: letters jolt with lightning flashes
//   pride    — rainbow shimmer: cycling per-letter rainbow colors

const LETTERS = 'DOOGLE';
let currentTheme = null;
const navState = { interval: null, animFrame: null };

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
  cleanupState(navState);
  currentTheme = theme;
  const el = document.getElementById('logo-text');
  if (!el) return;

  // Reset to base state
  el.className = 'logo-text';
  el.innerHTML = LETTERS;
  el.style.cssText = '';

  applyThemeAnim(el, LETTERS, navState, theme);
}

/** Animate any element with the current theme's logo animation. Returns a cleanup function. */
export function animateElement(el, text) {
  const state = { interval: null, animFrame: null };
  const theme = document.documentElement.getAttribute('data-theme') || 'dracula';
  applyThemeAnim(el, text, state, theme);

  function onThemeChange(e) {
    cleanupState(state);
    // Re-wrap and animate with new theme
    applyThemeAnim(el, text, state, e.detail.theme);
  }
  window.addEventListener('themechange', onThemeChange);

  return () => {
    cleanupState(state);
    window.removeEventListener('themechange', onThemeChange);
  };
}

function applyThemeAnim(el, text, state, theme) {
  switch (theme) {
    case 'dracula': draculaDrip(el, text, state); break;
    case 'crt':     crtGlitch(el, text, state); break;
    case 'storm':   stormCrackle(el, text, state); break;
    case 'modern':  blockBuild(el, text, state); break;
    case 'light':   inkWrite(el, text, state); break;
    case 'pride':   rainbowShimmer(el, text, state); break;
    default:        draculaDrip(el, text, state); break;
  }
}

function cleanupState(state) {
  if (state.interval) { clearInterval(state.interval); state.interval = null; }
  if (state.animFrame) { cancelAnimationFrame(state.animFrame); state.animFrame = null; }
}

function wrapLetters(el, text) {
  el.innerHTML = text.split('').map((ch, i) =>
    `<span class="logo-letter" data-index="${i}" style="display:inline-block;position:relative">${ch}</span>`
  ).join('');
  return el.querySelectorAll('.logo-letter');
}

// ─────────────────────────────────────────────────
// Dracula: Vampiric Pulse — letters breathe with a dark heartbeat,
// periodically one letter flickers dim and reforms with a crimson pulse.
// Clean, no spawned DOM elements.
// ─────────────────────────────────────────────────
function draculaDrip(el, text, state) {
  const letters = wrapLetters(el, text);
  el.classList.add('logo-anim-dracula');
  // Ensure no overflow escapes the navbar
  el.style.overflow = 'hidden';

  let breathPhase = 0;

  // Ambient breathing — subtle pulsing glow on all letters
  function breathe() {
    breathPhase += 0.02;
    const pulse = Math.sin(breathPhase) * 0.3 + 0.7; // 0.4 – 1.0
    const glow = Math.sin(breathPhase) * 4 + 4;       // 0 – 8px
    letters.forEach((l) => {
      // Only apply breathing if letter isn't mid-flicker
      if (l.dataset.flickering) return;
      l.style.textShadow = `0 0 ${glow}px rgba(0,212,255,${0.08 * pulse})`;
    });
    state.animFrame = requestAnimationFrame(breathe);
  }

  // Flicker event — one letter dims to crimson and snaps back
  function flicker() {
    const idx = Math.floor(Math.random() * letters.length);
    const letter = letters[idx];
    if (letter.dataset.flickering) return;
    letter.dataset.flickering = '1';

    // Phase 1: letter dims and shifts to red
    letter.style.transition = 'color 0.15s, text-shadow 0.15s, opacity 0.15s, filter 0.15s';
    letter.style.color = '#cc2244';
    letter.style.textShadow = '0 0 12px rgba(200,30,60,0.6), 0 0 4px rgba(200,30,60,0.3)';
    letter.style.opacity = '0.45';
    letter.style.filter = 'blur(0.5px)';

    // Phase 2: snap back with overshoot glow
    setTimeout(() => {
      letter.style.transition = 'color 0.5s ease-out, text-shadow 0.5s ease-out, opacity 0.3s ease-out, filter 0.3s ease-out';
      letter.style.color = '';
      letter.style.textShadow = '0 0 14px rgba(0,212,255,0.35)';
      letter.style.opacity = '1';
      letter.style.filter = '';
    }, 200);

    // Phase 3: settle to ambient
    setTimeout(() => {
      letter.style.transition = 'text-shadow 0.8s ease-out';
      letter.style.textShadow = '';
      setTimeout(() => {
        letter.style.transition = '';
        delete letter.dataset.flickering;
      }, 800);
    }, 700);

    // Sometimes cascade to neighbor
    if (Math.random() > 0.6) {
      const neighbor = letters[(idx + 1) % letters.length];
      if (!neighbor.dataset.flickering) {
        setTimeout(() => {
          neighbor.dataset.flickering = '1';
          neighbor.style.transition = 'color 0.12s, opacity 0.12s';
          neighbor.style.color = '#cc2244';
          neighbor.style.opacity = '0.55';
          setTimeout(() => {
            neighbor.style.transition = 'color 0.4s ease-out, opacity 0.25s ease-out';
            neighbor.style.color = '';
            neighbor.style.opacity = '1';
            setTimeout(() => { neighbor.style.transition = ''; delete neighbor.dataset.flickering; }, 500);
          }, 150);
        }, 120);
      }
    }
  }

  // Initial entrance: letters materialize one by one with a cool→red→cool flash
  letters.forEach((l, i) => {
    l.style.opacity = '0';
    l.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      l.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out, color 0.2s';
      l.style.transform = 'translateY(0)';
      l.style.opacity = '1';
      l.style.color = '#cc3355';
      l.style.textShadow = '0 0 10px rgba(200,30,60,0.4)';
      setTimeout(() => {
        l.style.transition = 'color 0.6s ease-out, text-shadow 0.8s ease-out';
        l.style.color = '';
        l.style.textShadow = '';
        setTimeout(() => { l.style.transition = ''; }, 800);
      }, 250);
    }, 80 + i * 80);
  });

  // Start ambient breathing after entrance
  setTimeout(() => breathe(), 700);

  state.interval = setInterval(flicker, 2800);
}

// ─────────────────────────────────────────────────
// CRT: Glitch — scan lines, chromatic aberration, character corruption
// ─────────────────────────────────────────────────
function crtGlitch(el, text, state) {
  const letters = wrapLetters(el, text);
  el.classList.add('logo-anim-crt');
  const glitchChars = '!@#$%^&*<>{}[]|/\\~01';

  // Initial typing effect
  letters.forEach((l, i) => {
    const orig = text[i];
    l.textContent = '_';
    l.style.opacity = '0.3';
    setTimeout(() => {
      // Rapid character cycling before landing on correct letter
      let ticks = 0;
      const cyc = setInterval(() => {
        l.textContent = glitchChars[Math.floor(Math.random() * glitchChars.length)];
        l.style.color = '#33ff33';
        ticks++;
        if (ticks > 3 + Math.floor(Math.random() * 3)) {
          clearInterval(cyc);
          l.textContent = orig;
          l.style.opacity = '1';
          l.style.color = '';
        }
      }, 50);
    }, 80 + i * 120);
  });

  function glitch() {
    const idx = Math.floor(Math.random() * letters.length);
    const letter = letters[idx];
    const original = text[idx];

    letter.textContent = glitchChars[Math.floor(Math.random() * glitchChars.length)];

    const dx = (Math.random() - 0.5) * 8;
    const dy = (Math.random() - 0.5) * 4;
    letter.style.transform = `translate(${dx}px, ${dy}px)`;
    letter.style.textShadow = `${-dx*0.8}px 0 rgba(255,0,0,0.6), ${dx*0.8}px 0 rgba(0,255,255,0.6)`;

    setTimeout(() => {
      letter.textContent = original;
      letter.style.transform = '';
      letter.style.textShadow = '';
    }, 60 + Math.random() * 100);

    // Full row scan-line glitch
    if (Math.random() > 0.6) {
      el.style.transform = `translateX(${(Math.random() - 0.5) * 6}px) skewX(${(Math.random() - 0.5) * 2}deg)`;
      el.style.filter = `brightness(${1.2 + Math.random() * 0.5})`;
      setTimeout(() => { el.style.transform = ''; el.style.filter = ''; }, 50);
    }
  }

  function burst() {
    const count = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      setTimeout(glitch, i * 50);
    }
  }

  state.interval = setInterval(burst, 2000 + Math.random() * 2500);
}

// ─────────────────────────────────────────────────
// Modern: Block Build — geometric assembly with glow
// ─────────────────────────────────────────────────
function blockBuild(el, text, state) {
  const letters = wrapLetters(el, text);
  el.classList.add('logo-anim-modern');

  // Initial build: letters materialize from scattered positions with rotation
  letters.forEach((l, i) => {
    const angle = (Math.random() - 0.5) * 30;
    const dx = (Math.random() - 0.5) * 40;
    const dy = -20 - Math.random() * 15;
    l.style.opacity = '0';
    l.style.transform = `translate(${dx}px, ${dy}px) rotate(${angle}deg) scale(0.4)`;

    setTimeout(() => {
      l.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease-out';
      l.style.transform = 'translate(0, 0) rotate(0deg) scale(1)';
      l.style.opacity = '1';
      // Landing glow
      l.style.textShadow = '0 0 14px rgba(99,102,241,0.7)';
      setTimeout(() => {
        l.style.textShadow = '';
        l.style.transition = '';
      }, 700);
    }, 120 + i * 110);
  });

  // Periodic: one letter detaches, rotates, and snaps back into place
  function rebuild() {
    const idx = Math.floor(Math.random() * letters.length);
    const letter = letters[idx];
    const angle = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 12);
    const dx = (Math.random() - 0.5) * 12;
    const dy = -6 - Math.random() * 6;

    letter.style.transition = 'transform 0.3s ease-in, opacity 0.3s ease-in';
    letter.style.transform = `translate(${dx}px, ${dy}px) rotate(${angle}deg)`;
    letter.style.opacity = '0.2';

    setTimeout(() => {
      letter.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease-out';
      letter.style.transform = 'translate(0, 0) rotate(0deg)';
      letter.style.opacity = '1';
      letter.style.textShadow = '0 0 10px rgba(99,102,241,0.5)';
      setTimeout(() => { letter.style.transition = ''; letter.style.textShadow = ''; }, 500);
    }, 300);
  }

  state.interval = setInterval(rebuild, 3200);
}

// ─────────────────────────────────────────────────
// Light: Ink Write — calligraphic stroke with ink splash
// ─────────────────────────────────────────────────
function inkWrite(el, text, state) {
  const letters = wrapLetters(el, text);
  el.classList.add('logo-anim-light');

  // Initial write-in: quill stroke from left to right with varying pressure
  letters.forEach((l, i) => {
    l.style.opacity = '0';
    l.style.transform = 'translateY(6px) scaleY(0.2) scaleX(0.8)';
    l.style.transformOrigin = 'bottom left';

    setTimeout(() => {
      l.style.transition = 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease-out';
      l.style.transform = 'translateY(0) scaleY(1) scaleX(1)';
      l.style.opacity = '1';
      // Ink bleed effect on arrival
      l.style.textShadow = '0 1px 3px rgba(0,50,100,0.3)';
      setTimeout(() => {
        l.style.textShadow = '';
        l.style.transition = '';
      }, 800);
    }, 180 + i * 130);
  });

  // Periodic: ink blot — letter gets heavy then lightens
  function reink() {
    const idx = Math.floor(Math.random() * letters.length);
    const letter = letters[idx];

    // Ink pools — letter gets bold/dark then releases
    letter.style.transition = 'opacity 0.6s ease-in-out, transform 0.6s ease-in-out, font-weight 0.4s';
    letter.style.opacity = '0.3';
    letter.style.transform = 'translateY(3px) scaleY(0.7)';
    letter.style.transformOrigin = 'bottom center';

    setTimeout(() => {
      letter.style.transition = 'opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
      letter.style.opacity = '1';
      letter.style.transform = 'translateY(0) scaleY(1)';
      letter.style.textShadow = '0 1px 4px rgba(0,50,100,0.25)';
      setTimeout(() => { letter.style.transition = ''; letter.style.textShadow = ''; }, 700);
    }, 650);
  }

  state.interval = setInterval(reink, 3800);
}

// ─────────────────────────────────────────────────
// Storm: Electric Crackle — letters drop in like rain, periodic lightning jolt
// ─────────────────────────────────────────────────
function stormCrackle(el, text, state) {
  const letters = wrapLetters(el, text);
  el.classList.add('logo-anim-storm');
  el.style.overflow = 'visible';

  let breathPhase = 0;

  // Ambient: subtle cool pulsing glow
  function breathe() {
    breathPhase += 0.015;
    const glow = Math.sin(breathPhase) * 3 + 3;
    letters.forEach(l => {
      if (l.dataset.jolting) return;
      l.style.textShadow = `0 0 ${glow}px rgba(126,184,218,${0.06 + Math.sin(breathPhase) * 0.03})`;
    });
    state.animFrame = requestAnimationFrame(breathe);
  }

  // Entrance: letters fall from above like raindrops
  letters.forEach((l, i) => {
    l.style.opacity = '0';
    l.style.transform = `translateY(-${16 + Math.random() * 10}px)`;
    setTimeout(() => {
      l.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease-out';
      l.style.transform = 'translateY(0)';
      l.style.opacity = '1';
      l.style.color = '#ffffff';
      l.style.textShadow = '0 0 12px rgba(126,184,218,0.6)';
      setTimeout(() => {
        l.style.transition = 'color 0.5s ease-out, text-shadow 0.6s ease-out';
        l.style.color = '';
        l.style.textShadow = '';
        setTimeout(() => { l.style.transition = ''; }, 600);
      }, 200);
    }, 60 + i * 90);
  });

  // Lightning jolt: random letter flashes bright white with electric crackle
  function jolt() {
    const idx = Math.floor(Math.random() * letters.length);
    const letter = letters[idx];
    if (letter.dataset.jolting) return;
    letter.dataset.jolting = '1';

    // Flash white with electric glow
    letter.style.transition = 'color 0.05s, text-shadow 0.05s, transform 0.05s';
    letter.style.color = '#ffffff';
    letter.style.textShadow = '0 0 16px rgba(126,184,218,0.9), 0 0 30px rgba(126,184,218,0.4), -1px 0 rgba(160,200,255,0.5), 1px 0 rgba(160,200,255,0.5)';
    const jx = (Math.random() - 0.5) * 4;
    letter.style.transform = `translateX(${jx}px)`;

    // Quick double-flash
    setTimeout(() => {
      letter.style.opacity = '0.5';
      setTimeout(() => {
        letter.style.opacity = '1';
        letter.style.textShadow = '0 0 20px rgba(126,184,218,0.7)';
      }, 40);
    }, 60);

    // Settle
    setTimeout(() => {
      letter.style.transition = 'color 0.6s ease-out, text-shadow 0.8s ease-out, transform 0.4s ease-out, opacity 0.3s';
      letter.style.color = '';
      letter.style.textShadow = '';
      letter.style.transform = '';
      letter.style.opacity = '1';
      setTimeout(() => {
        letter.style.transition = '';
        delete letter.dataset.jolting;
      }, 800);
    }, 200);

    // Chain to neighbor sometimes
    if (Math.random() > 0.5) {
      const ni = (idx + (Math.random() > 0.5 ? 1 : -1) + letters.length) % letters.length;
      const nb = letters[ni];
      if (!nb.dataset.jolting) {
        setTimeout(() => {
          nb.dataset.jolting = '1';
          nb.style.transition = 'color 0.05s, text-shadow 0.05s';
          nb.style.color = '#ffffff';
          nb.style.textShadow = '0 0 14px rgba(126,184,218,0.7)';
          setTimeout(() => {
            nb.style.transition = 'color 0.5s ease-out, text-shadow 0.6s ease-out';
            nb.style.color = '';
            nb.style.textShadow = '';
            setTimeout(() => { nb.style.transition = ''; delete nb.dataset.jolting; }, 600);
          }, 120);
        }, 80);
      }
    }
  }

  setTimeout(() => breathe(), 700);
  state.interval = setInterval(jolt, 2500);
}

// ─────────────────────────────────────────────────
// Pride: Prismatic Flow — flashy entrance, then readable with subtle rainbow underline
// ─────────────────────────────────────────────────
function rainbowShimmer(el, text, state) {
  const letters = wrapLetters(el, text);
  el.classList.add('logo-anim-pride');

  let t = 0;
  let phase = 'intro'; // 'intro' → 'settle' → 'idle'

  function hslColor(hue) {
    return `hsl(${hue % 360}, 85%, 65%)`;
  }

  // Idle animation: letters are WHITE and readable, with a subtle
  // color-cycling underline/bottom-glow and very gentle wave motion.
  function animate() {
    t += 0.5;

    if (phase === 'idle') {
      letters.forEach((l, i) => {
        const hue = t * 1.5 + i * 55;
        // White text — always readable
        l.style.color = '#fff';
        // Colored bottom glow only (acts as rainbow underline)
        l.style.textShadow = `0 2px 6px hsla(${hue % 360}, 80%, 55%, 0.45), 0 0 2px rgba(255,255,255,0.3)`;
        // Very gentle wave
        const wave = Math.sin((t * 0.03) + i * 0.6) * 1.5;
        l.style.transform = `translateY(${wave}px)`;
      });

      // Occasional sparkle
      if (Math.random() > 0.95) {
        const idx = Math.floor(Math.random() * letters.length);
        const letter = letters[idx];
        const spark = document.createElement('span');
        const sx = (Math.random() - 0.5) * 12;
        const sy = -3 - Math.random() * 8;
        const hue = (t * 1.5 + idx * 55) % 360;
        spark.style.cssText = `position:absolute;left:50%;top:0;pointer-events:none;font-size:0.5em;color:hsl(${hue},85%,75%);`;
        spark.textContent = '\u2726';
        letter.appendChild(spark);
        spark.animate([
          { transform: `translate(${sx}px, 0px) scale(1)`, opacity: 0.8 },
          { transform: `translate(${sx * 1.5}px, ${sy}px) scale(0)`, opacity: 0 },
        ], { duration: 500 + Math.random() * 300, easing: 'ease-out', fill: 'forwards' })
          .onfinish = () => spark.remove();
      }
    }

    state.animFrame = requestAnimationFrame(animate);
  }

  // Phase 1: Flashy rainbow entrance (letters burst in with full color)
  letters.forEach((l, i) => {
    l.style.opacity = '0';
    l.style.transform = 'scale(0) rotate(-20deg)';
    const hue = i * 50;
    setTimeout(() => {
      l.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out';
      l.style.opacity = '1';
      l.style.transform = 'scale(1.15) rotate(0deg)';
      l.style.color = hslColor(hue);
      l.style.textShadow = `0 0 14px hsla(${hue % 360}, 90%, 60%, 0.7), 0 0 30px hsla(${hue % 360}, 90%, 60%, 0.3)`;
      setTimeout(() => { l.style.transition = ''; }, 500);
    }, 80 + i * 80);
  });

  // Phase 2: Settle — transition from full rainbow to white+underline glow
  setTimeout(() => {
    phase = 'settle';
    letters.forEach((l, i) => {
      const hue = i * 55;
      l.style.transition = 'color 0.8s ease, text-shadow 0.8s ease, transform 0.6s ease';
      l.style.color = '#fff';
      l.style.textShadow = `0 2px 6px hsla(${hue % 360}, 80%, 55%, 0.45), 0 0 2px rgba(255,255,255,0.3)`;
      l.style.transform = 'scale(1)';
      setTimeout(() => { l.style.transition = ''; }, 900);
    });

    setTimeout(() => { phase = 'idle'; }, 900);
  }, 900);

  setTimeout(() => { animate(); }, 700);
}
