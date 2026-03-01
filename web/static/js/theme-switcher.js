// Doogle v2 — Theme Switcher
// Applies themes, manages picker UI, CRT overlay, and persistence.

import { themes } from './themes.js';

const STORAGE_KEY = 'doogle-theme';
let currentTheme = 'dracula';

/** Read localStorage and apply saved theme (or default). */
export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const id = saved && themes[saved] ? saved : 'dracula';
  applyTheme(id);
}

/** Return the active theme id. */
export function getCurrentTheme() {
  return currentTheme;
}

/** Apply a theme by id: set CSS vars on :root, manage CRT overlay, persist. */
export function applyTheme(id) {
  const theme = themes[id];
  if (!theme) return;

  currentTheme = id;
  const root = document.documentElement;

  // Set all CSS variables
  for (const [prop, value] of Object.entries(theme)) {
    if (prop === 'name') continue;
    root.style.setProperty(prop, value);
  }

  // Set data-theme attribute for CSS selectors
  root.setAttribute('data-theme', id);

  // Manage CRT overlay
  manageCRTOverlay(id === 'crt');

  // Persist choice
  localStorage.setItem(STORAGE_KEY, id);

  // Update picker active state if it exists
  updatePickerState(id);

  // Dispatch event for canvas redraws
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: id } }));
}

/** Inject theme picker dropdown into the navbar. */
export function createThemePicker() {
  const navbar = document.querySelector('.navbar');
  if (!navbar || document.querySelector('.theme-picker')) return;

  const picker = document.createElement('div');
  picker.className = 'theme-picker';

  // Build options from themes object
  const optionsHtml = Object.entries(themes).map(([id, theme]) => {
    const swatch = theme['--accent'];
    return `
      <button class="theme-picker-option" data-theme="${id}">
        <span class="theme-picker-swatch" style="background:${swatch}"></span>
        <span>${theme.name}</span>
      </button>
    `;
  }).join('');

  picker.innerHTML = `
    <button class="theme-picker-btn" title="Switch theme">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    </button>
    <div class="theme-picker-dropdown">
      ${optionsHtml}
    </div>
  `;

  // Insert before the node-badge (rightmost element)
  const badge = navbar.querySelector('.node-badge');
  if (badge) {
    navbar.insertBefore(picker, badge);
  } else {
    navbar.appendChild(picker);
  }

  // Toggle dropdown
  const btn = picker.querySelector('.theme-picker-btn');
  const dropdown = picker.querySelector('.theme-picker-dropdown');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Theme selection
  picker.querySelectorAll('.theme-picker-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      applyTheme(opt.dataset.theme);
      dropdown.classList.remove('open');
    });
  });

  // Close on outside click
  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
  });

  // Set initial active state
  updatePickerState(currentTheme);
}

// ---- Internal helpers ----

function updatePickerState(activeId) {
  document.querySelectorAll('.theme-picker-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === activeId);
  });
}

let crtOverlay = null;

function manageCRTOverlay(enable) {
  if (enable && !crtOverlay) {
    crtOverlay = document.createElement('div');
    crtOverlay.className = 'crt-overlay';
    document.body.appendChild(crtOverlay);
  } else if (!enable && crtOverlay) {
    crtOverlay.remove();
    crtOverlay = null;
  }
}
