// Doogle v2 — Cycling Tab Title + Node Identity Favicon
// Alternates between "Doogle — P2P Search" (owl) and "<NodeName> — Doogle" (letter icon).

import { getCurrentTheme } from './theme-switcher.js';
import { themes } from './themes.js';

const CYCLE_MS = 3500;
const DEFAULT_TITLE = 'Doogle \u2014 P2P Search';

let nodeName = '';
let phase = 0;        // 0 = owl, 1 = letter
let intervalId = null;

// ---- Public API ----

/** Call once on DOMContentLoaded. */
export function initTabIdentity() {
  applyPhase();
  startCycling();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopCycling();
    } else {
      applyPhase();
      startCycling();
    }
  });

  window.addEventListener('themechange', () => {
    renderFaviconForPhase(phase);
  });
}

/** Call on every successful status poll. */
export function updateNodeIdentity(status) {
  const name = status.node_name || '';
  if (name !== nodeName) {
    nodeName = name;
    applyPhase();
  }
}

// ---- Cycling ----

function startCycling() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    phase = phase === 0 ? 1 : 0;
    applyPhase();
  }, CYCLE_MS);
}

function stopCycling() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function applyPhase() {
  const displayName = nodeName || 'Anonymous Node';

  if (phase === 0) {
    document.title = DEFAULT_TITLE;
  } else {
    document.title = `${displayName} \u2014 Doogle`;
  }

  renderFaviconForPhase(phase);
}

// ---- Favicon rendering ----

function renderFaviconForPhase(p) {
  const theme = themes[getCurrentTheme()] || themes.dracula;
  const accent = theme['--accent'];
  const bg = theme['--bg-primary'] || '#0a0a0f';

  const svg = p === 0
    ? owlSvg(accent, bg)
    : letterSvg(accent, bg, nodeName);

  setFavicon(svg);
}

function owlSvg(accent, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="15" fill="${bg}" stroke="${accent}" stroke-width="0.8" opacity="0.9"/>
    <path d="M9.5 10.5 L8 4.5 L12 9Z" fill="none" stroke="${accent}" stroke-width="1" stroke-linejoin="round" opacity="0.6"/>
    <path d="M22.5 10.5 L24 4.5 L20 9Z" fill="none" stroke="${accent}" stroke-width="1" stroke-linejoin="round" opacity="0.6"/>
    <circle cx="11" cy="14.5" r="4.2" fill="none" stroke="${accent}" stroke-width="1" opacity="0.5"/>
    <circle cx="11" cy="14.5" r="2.5" fill="${accent}" opacity="0.2"/>
    <circle cx="11" cy="14.5" r="1.5" fill="${accent}" opacity="0.7"/>
    <circle cx="11" cy="14.5" r="0.6" fill="${bg}"/>
    <circle cx="10.3" cy="13.8" r="0.5" fill="white" opacity="0.45"/>
    <circle cx="21" cy="14.5" r="4.2" fill="none" stroke="${accent}" stroke-width="1" opacity="0.5"/>
    <circle cx="21" cy="14.5" r="2.5" fill="${accent}" opacity="0.2"/>
    <circle cx="21" cy="14.5" r="1.5" fill="${accent}" opacity="0.7"/>
    <circle cx="21" cy="14.5" r="0.6" fill="${bg}"/>
    <circle cx="20.3" cy="13.8" r="0.5" fill="white" opacity="0.45"/>
    <path d="M14.8 18.5 L16 22 L17.2 18.5Z" fill="${accent}" opacity="0.45"/>
    <path d="M12 24.5 L16 26.5 L20 24.5" fill="none" stroke="${accent}" stroke-width="0.7" opacity="0.25"/>
  </svg>`;
}

function letterSvg(accent, bg, name) {
  const letter = name ? name.charAt(0).toUpperCase() : '?';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="15" fill="${bg}" stroke="${accent}" stroke-width="1.2"/>
    <circle cx="16" cy="16" r="11" fill="${accent}" opacity="0.12"/>
    <text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="bold" fill="${accent}">${letter}</text>
  </svg>`;
}

function setFavicon(svg) {
  const dataUri = 'data:image/svg+xml,' + encodeURIComponent(svg);
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }
  link.href = dataUri;
}
