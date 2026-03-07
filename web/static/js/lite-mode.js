// Doogle v2 — Lite Mode
// Disables heavy animations, canvas effects, and visual frills.

const STORAGE_KEY = 'doogle-lite-mode';

/** Check if lite mode is active (localStorage or prefers-reduced-motion). */
export function isLiteMode() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Enable or disable lite mode. Persists and dispatches event. */
export function setLiteMode(on) {
  localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
  document.documentElement.setAttribute('data-lite', on ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('litemodechange', { detail: { lite: on } }));
}

/** Toggle lite mode. */
export function toggleLiteMode() {
  setLiteMode(!isLiteMode());
}

/** Return an interval value, doubled when in lite mode. */
export function pollInterval(ms) {
  return isLiteMode() ? ms * 2 : ms;
}

/** Set data-lite attribute on startup based on saved preference. */
export function initLiteMode() {
  const on = isLiteMode();
  document.documentElement.setAttribute('data-lite', on ? 'true' : 'false');
}
