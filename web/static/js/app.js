// Doogle v2 — SPA Router & App Shell
import { api } from './api.js';
import { initTheme, createThemePicker } from './theme-switcher.js';
import { renderSearch } from './pages/search.js';
import { renderNode } from './pages/node.js';
import { renderCrawler } from './pages/crawler.js';
import { renderIndexer } from './pages/indexer.js';
import { renderNetwork } from './pages/network.js';
import { renderDocs } from './pages/docs.js';
import { renderAbout } from './pages/about.js';

const routes = {
  '':            { render: renderSearch, layout: 'search' },
  'search':      { render: renderSearch, layout: 'search' },
  'admin':       { render: renderNode,    layout: 'admin' },
  'admin/crawler': { render: renderCrawler, layout: 'admin' },
  'admin/indexer': { render: renderIndexer, layout: 'admin' },
  'admin/network': { render: renderNetwork, layout: 'admin' },
  'docs':        { render: renderDocs,   layout: 'search' },
  'about':       { render: renderAbout,  layout: 'search' },
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
    sidebar.style.display = 'block';
    main.classList.remove('full-width');
  } else {
    sidebar.style.display = 'none';
    main.classList.add('full-width');
  }

  setActiveNav();

  // Clear any existing intervals from previous page
  if (window._pageInterval) {
    clearInterval(window._pageInterval);
    window._pageInterval = null;
  }

  match.render(main);
}

function startStatusPolling() {
  async function poll() {
    try {
      const s = await api.status();
      const badge = document.getElementById('node-badge-text');
      if (badge) {
        badge.textContent = `${s.peer_id.slice(0, 12)}... | ${s.indexed_docs} docs | ${s.connected_peers} peers`;
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
  render();
  startStatusPolling();
});
