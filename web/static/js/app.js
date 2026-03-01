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
import { renderLearn } from './pages/learn.js';
import { renderWizard } from './pages/wizard.js';
import { initBgAnimation } from './bg-animation.js';
import { initLogoAnimation } from './logo-animation.js';

const routes = {
  '':            { render: renderSearch, layout: 'search' },
  'search':      { render: renderSearch, layout: 'search' },
  'admin':       { render: renderNode,    layout: 'admin' },
  'admin/crawler': { render: renderCrawler, layout: 'admin' },
  'admin/indexer': { render: renderIndexer, layout: 'admin' },
  'admin/network': { render: renderNetwork, layout: 'admin' },
  'docs':        { render: renderDocs,   layout: 'search' },
  'learn':       { render: renderLearn,  layout: 'search' },
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
  let firstPoll = true;
  async function poll() {
    try {
      const s = await api.status();
      const badge = document.getElementById('node-badge-text');
      if (badge) {
        const name = s.node_name || `${s.peer_id.slice(0, 12)}...`;
        badge.textContent = `${name} | ${s.indexed_docs} docs | ${s.connected_peers} peers`;
      }
      if (firstPoll) {
        firstPoll = false;
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
  render();
  startStatusPolling();
});
