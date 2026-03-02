// Doogle v2 — SPA Router & App Shell
import { api } from './api.js';
import { initTheme, createThemePicker } from './theme-switcher.js';
import { renderHome } from './pages/home.js';
import { renderSearch } from './pages/search.js';
import { renderNode } from './pages/node.js';
import { renderCrawler } from './pages/crawler.js';
import { renderIndexer } from './pages/indexer.js';
import { renderNetwork } from './pages/network.js';
import { renderDocs } from './pages/docs.js';
import { renderAbout } from './pages/about.js';
import { renderWizard } from './pages/wizard.js';
import { renderActions } from './pages/actions.js';
import { renderTrust } from './pages/trust.js';
import { renderFleet } from './pages/fleet.js';
import { initBgAnimation } from './bg-animation.js';
import { initLogoAnimation } from './logo-animation.js';
import { initTabIdentity, updateNodeIdentity } from './tab-identity.js';

const routes = {
  '':            { render: renderHome,   layout: 'home' },
  'search':      { render: renderSearch, layout: 'search' },
  'admin':       { render: renderNode,    layout: 'admin' },
  'admin/crawler': { render: renderCrawler, layout: 'admin' },
  'admin/indexer': { render: renderIndexer, layout: 'admin' },
  'admin/network': { render: renderNetwork, layout: 'admin' },
  'admin/actions': { render: renderActions, layout: 'admin' },
  'admin/trust':   { render: renderTrust,   layout: 'admin' },
  'admin/fleet':   { render: renderFleet,   layout: 'admin' },
  'docs':        { render: renderDocs,   layout: 'search' },
  'about':       { render: renderAbout,  layout: 'search' },
  'wizard':      { render: renderWizard, layout: 'search' },
};

let statusInterval = null;

function getRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return hash || '';
}

function setActiveNav() {
  const route = getRoute();
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href').replace('#/', '');
    a.classList.toggle('active', route === href || (href === 'admin' && route.startsWith('admin')));
  });
  document.querySelectorAll('.sidebar a').forEach(a => {
    const href = a.getAttribute('href').replace('#/', '');
    a.classList.toggle('active', route === href);
  });
}

function render() {
  const route = getRoute();
  const match = routes[route] || routes[''];
  const main = document.getElementById('main-content');
  const sidebar = document.getElementById('sidebar');

  if (match.layout === 'admin') {
    sidebar.classList.add('sidebar-visible');
    main.classList.remove('full-width');
  } else {
    sidebar.classList.remove('sidebar-visible');
    main.classList.add('full-width');
  }

  setActiveNav();

  // Close mobile nav on route change
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) navLinks.classList.remove('open');

  // Clear any existing intervals from previous page
  if (window._pageInterval) {
    clearInterval(window._pageInterval);
    window._pageInterval = null;
  }
  if (window._pageCleanup) {
    window._pageCleanup();
    window._pageCleanup = null;
  }

  // Transparent navbar for immersive homepage
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    if (match.layout === 'home') {
      navbar.classList.add('navbar-transparent');
    } else {
      navbar.classList.remove('navbar-transparent');
    }
  }

  match.render(main);
}

function startStatusPolling() {
  let firstPoll = true;
  async function poll() {
    try {
      const s = await api.status();
      updateNodeIdentity(s);
      const badge = document.getElementById('node-badge-text');
      if (badge) {
        const name = s.node_name || `${s.peer_id.slice(0, 12)}...`;
        badge.textContent = `${name} | ${s.indexed_docs} docs | ${s.connected_peers} peers`;
      }
      // Update sidebar wizard status icon.
      const wizardLink = document.getElementById('sidebar-wizard');
      if (wizardLink) {
        const done = !!localStorage.getItem('doogle_wizard_dismissed') || s.indexed_docs > 0;
        const dot = done
          ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);margin-right:6px;vertical-align:middle" title="Setup complete"></span>'
          : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--amber);margin-right:6px;vertical-align:middle" title="Setup pending"></span>';
        wizardLink.innerHTML = `${dot}Setup Wizard`;
      }

      if (firstPoll) {
        firstPoll = false;
        // Fresh node (no data at all) — clear stale wizard dismissal from previous runs.
        if (s.indexed_docs === 0 && s.crawled_urls === 0) {
          localStorage.removeItem('doogle_wizard_dismissed');
        }
        if (s.indexed_docs === 0 && !localStorage.getItem('doogle_wizard_dismissed')) {
          window.location.hash = '#/wizard';
        }
      }
    } catch {
      const badge = document.getElementById('node-badge-text');
      if (badge) badge.textContent = 'Connecting...';
    }
  }
  poll();
  statusInterval = setInterval(poll, 10000);
}

// Boot
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  createThemePicker();
  initBgAnimation();
  initLogoAnimation();
  initTabIdentity();
  // Hamburger menu toggle
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  render();
  startStatusPolling();

  // Global keyboard shortcuts: / and Ctrl+K / Cmd+K to focus search
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
    const isCmdK = e.key === 'k' && (e.ctrlKey || e.metaKey);

    if (isSlash || isCmdK) {
      const input = document.getElementById('search-input');
      if (input) {
        e.preventDefault();
        input.focus();
      }
    }
  });
});
