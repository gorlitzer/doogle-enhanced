// Doogle v2 — Node Status (Admin Overview)
import { api } from '../api.js';
import { icon } from '../components.js';

export function renderNode(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Node Overview</h2>
      <p>P2P node status and health</p>
    </div>
    <div id="node-content"><div class="loading">Loading node status...</div></div>
  `;
  loadStatus();
  window._pageInterval = setInterval(loadStatus, 5000);
}

async function loadStatus() {
  try {
    const s = await api.status();
    const content = document.getElementById('node-content');
    if (!content) return;

    content.innerHTML = `
      <div class="card-grid">
        <div class="card">
          <div class="card-label">Peer ID</div>
          <div class="card-value" style="font-size:0.9em;word-break:break-all;font-family:monospace">${s.peer_id}</div>
        </div>
        <div class="card">
          <div class="card-label">Uptime</div>
          <div class="card-value">${s.uptime}</div>
          <div class="card-sub">Started ${new Date(s.started_at).toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Connected Peers</div>
          <div class="card-value">${s.connected_peers}</div>
        </div>
        <div class="card">
          <div class="card-label">Indexed Documents</div>
          <div class="card-value">${s.indexed_docs.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Crawled URLs</div>
          <div class="card-value">${s.crawled_urls.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">URLs in Queue</div>
          <div class="card-value">${s.urls_in_queue.toLocaleString()}</div>
        </div>
      </div>

      <div class="section">
        <h3>Multiaddresses</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Address</th></tr></thead>
            <tbody>
              ${(s.addrs || []).map(a => `<tr><td class="mono">${escapeHtml(a)}</td></tr>`).join('')
                || '<tr><td class="empty-state">No addresses available</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="section">
        <h3>Connected Peers</h3>
        ${renderPeerList(s.peer_list || [])}
      </div>

      <div class="section">
        <h3>Quick Actions</h3>
        <div class="form-row">
          <input type="text" id="seed-url-input" placeholder="https://example.com">
          <button class="btn btn-primary" id="add-seed-btn">Add Seed URL</button>
        </div>
        <div id="seed-result" style="margin-top:8px;font-size:0.85em"></div>
      </div>
    `;

    document.getElementById('add-seed-btn').addEventListener('click', addSeed);
  } catch (err) {
    const content = document.getElementById('node-content');
    if (content) {
      content.innerHTML = `<div class="empty-state">${icon('alertTriangle', 32, 'var(--red)')}<p>Failed to load status: ${err.message}</p></div>`;
    }
  }
}

function renderPeerList(peers) {
  if (peers.length === 0) {
    return '<div class="empty-state"><p>No peers connected. Waiting for discovery via mDNS or bootstrap...</p></div>';
  }
  return peers.map(p => `
    <div class="peer-item">
      <div>
        <div class="peer-id">${p.slice(0, 16)}...${p.slice(-8)}</div>
      </div>
      <span class="badge badge-green">connected</span>
    </div>
  `).join('');
}

async function addSeed() {
  const input = document.getElementById('seed-url-input');
  const result = document.getElementById('seed-result');
  const url = input.value.trim();
  if (!url) return;

  try {
    await api.addSeed(url);
    result.innerHTML = `<span class="badge badge-green">Queued: ${escapeHtml(url)}</span>`;
    input.value = '';
  } catch (err) {
    result.innerHTML = `<span class="badge badge-red">Error: ${err.message}</span>`;
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
