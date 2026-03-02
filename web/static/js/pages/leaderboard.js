// Doogle v2 — WebExplorers Leaderboard
import { api } from '../api.js';

export function renderLeaderboard(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>WebExplorers Leaderboard</h2>
      <p>Peer contribution rankings</p>
    </div>
    <div id="lb-content"><div class="loading">Loading leaderboard...</div></div>
  `;
  loadLeaderboard();
  window._pageInterval = setInterval(loadLeaderboard, 10000);
}

function shortPeer(id) {
  if (!id) return 'Unknown';
  return id.slice(0, 8) + '...' + id.slice(-6);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function animateCounter(el, target) {
  const duration = 1200;
  const start = performance.now();
  function update(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
    el.textContent = Math.round(ease * target).toLocaleString();
    if (t < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function trustBadge(score) {
  if (score >= 0.8) return '<span class="badge badge-green" title="Trusted">Trusted</span>';
  if (score >= 0.5) return '<span class="badge" title="Neutral">Neutral</span>';
  return '<span class="badge badge-red" title="Low Trust">Low</span>';
}

function formatDate(d) {
  if (!d || d === '0001-01-01T00:00:00Z') return '-';
  return new Date(d).toLocaleDateString();
}

function renderPodium(explorers, localPeerID) {
  if (explorers.length === 0) return '';

  const medals = [
    { idx: 0, cls: 'lb-gold',   label: '1st', gradient: 'radial-gradient(circle, #fbbf24, #f59e0b)', size: 40 },
    { idx: 1, cls: 'lb-silver', label: '2nd', gradient: 'radial-gradient(circle, #d1d5db, #9ca3af)', size: 36 },
    { idx: 2, cls: 'lb-bronze', label: '3rd', gradient: 'radial-gradient(circle, #d97706, #b45309)', size: 32 },
  ];

  // Display order: 2nd, 1st, 3rd
  const order = [1, 0, 2];

  const cards = order.map((rank, i) => {
    const m = medals[rank];
    const e = explorers[m.idx];
    if (!e) return '';
    const isLocal = e.peer_id === localPeerID;
    const name = e.node_name || shortPeer(e.peer_id);
    const localCls = isLocal ? ' lb-local' : '';

    return `
      <div class="lb-podium-card ${m.cls}${localCls}" style="animation-delay:${i * 0.15}s">
        <div class="lb-medal" style="width:${m.size}px;height:${m.size}px;background:${m.gradient}">${m.label}</div>
        <div class="lb-name">${escapeHtml(name)}</div>
        ${isLocal ? '<span class="lb-you-badge">YOU</span>' : ''}
        <div class="lb-doc-count" data-target="${e.doc_count}">0</div>
        <div class="lb-doc-label">documents</div>
        ${trustBadge(e.trust_score)}
      </div>
    `;
  }).join('');

  return `<div class="lb-podium">${cards}</div>`;
}

function renderTable(explorers, localPeerID) {
  const rest = explorers.slice(3);
  if (rest.length === 0) return '';

  const rows = rest.map((e, i) => {
    const rank = i + 4;
    const isLocal = e.peer_id === localPeerID;
    const name = e.node_name || shortPeer(e.peer_id);
    const localCls = isLocal ? ' lb-local-row' : '';
    return `
      <tr class="${localCls}">
        <td>#${rank}</td>
        <td>
          ${escapeHtml(name)}
          ${isLocal ? ' <span class="lb-you-badge lb-you-badge-sm">YOU</span>' : ''}
        </td>
        <td>${e.doc_count.toLocaleString()}</td>
        <td>${trustBadge(e.trust_score)}</td>
        <td>${formatDate(e.first_seen)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="section">
      <h3>All Explorers</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Explorer</th>
              <th>Documents</th>
              <th>Trust</th>
              <th>First Seen</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadLeaderboard() {
  try {
    const data = await api.leaderboard();
    const content = document.getElementById('lb-content');
    if (!content) return;

    const explorers = data.explorers || [];
    const localPeerID = data.local_peer_id || '';
    const localExplorer = explorers.find(e => e.peer_id === localPeerID);
    const localRank = explorers.findIndex(e => e.peer_id === localPeerID) + 1;

    content.innerHTML = `
      <div class="card-grid">
        <div class="card">
          <div class="card-label">Total Explorers</div>
          <div class="card-value">${explorers.length}</div>
        </div>
        <div class="card">
          <div class="card-label">Total Documents</div>
          <div class="card-value">${(data.total_docs || 0).toLocaleString()}</div>
        </div>
        <div class="card" style="border-color:var(--accent)">
          <div class="card-label">Your Rank</div>
          <div class="card-value" style="color:var(--accent)">${localRank > 0 ? '#' + localRank : '-'}</div>
          <div class="card-sub">${localExplorer ? localExplorer.doc_count.toLocaleString() + ' docs contributed' : 'no contributions yet'}</div>
        </div>
      </div>

      ${renderPodium(explorers, localPeerID)}
      ${renderTable(explorers, localPeerID)}
    `;

    // Animate counters on podium
    content.querySelectorAll('.lb-doc-count[data-target]').forEach(el => {
      animateCounter(el, parseInt(el.dataset.target, 10));
    });
  } catch (err) {
    const content = document.getElementById('lb-content');
    if (content) {
      content.innerHTML = `<div class="empty-state"><p>Failed to load leaderboard: ${err.message}</p></div>`;
    }
  }
}
