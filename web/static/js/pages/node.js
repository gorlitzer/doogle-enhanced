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

function formatBytes(bytes) {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function pct(part, total) {
  if (total <= 0) return '0%';
  return ((part / total) * 100).toFixed(1) + '%';
}

function pctNum(part, total) {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function renderStorageSection(storage) {
  if (!storage) return '';
  const total = storage.total_bytes || 0;
  return `
    <div class="section">
      <h3>Storage</h3>
      <div class="card-grid">
        <div class="card">
          <div class="card-label">Total Data</div>
          <div class="card-value">${formatBytes(total)}</div>
          <div class="card-sub">${escapeHtml(storage.data_dir)}</div>
        </div>
        <div class="card" style="border-color: var(--accent)">
          <div class="card-label">Bleve Index</div>
          <div class="card-value" style="color:var(--accent)">${formatBytes(storage.bleve_bytes)}</div>
          <div class="card-sub">${pct(storage.bleve_bytes, total)} of data</div>
        </div>
        <div class="card" style="border-color: var(--purple)">
          <div class="card-label">BadgerDB</div>
          <div class="card-value" style="color:var(--purple)">${formatBytes(storage.badger_bytes)}</div>
          <div class="card-sub">${pct(storage.badger_bytes, total)} of data</div>
        </div>
        <div class="card" style="border-color: var(--green)">
          <div class="card-label">Free Disk</div>
          <div class="card-value" style="color:var(--green)">${storage.free_bytes >= 0 ? formatBytes(storage.free_bytes) : 'N/A'}</div>
          <div class="card-sub">${storage.free_bytes >= 0 ? 'available on volume' : 'not available'}</div>
        </div>
      </div>
      ${total > 0 ? `
      <div class="storage-bar">
        <div class="storage-segment" style="width:${pctNum(storage.bleve_bytes, total)}%;background:var(--accent)" title="Bleve: ${formatBytes(storage.bleve_bytes)}"></div>
        <div class="storage-segment" style="width:${pctNum(storage.badger_bytes, total)}%;background:var(--purple)" title="Badger: ${formatBytes(storage.badger_bytes)}"></div>
        <div class="storage-segment" style="width:${pctNum(storage.other_bytes, total)}%;background:var(--text-muted)" title="Other: ${formatBytes(storage.other_bytes)}"></div>
      </div>
      <div class="storage-legend">
        <span><span class="dot" style="background:var(--accent)"></span> Bleve</span>
        <span><span class="dot" style="background:var(--purple)"></span> Badger</span>
        <span><span class="dot" style="background:var(--text-muted)"></span> Other</span>
      </div>
      ` : ''}
    </div>
  `;
}

async function loadStatus() {
  try {
    const [s, storage] = await Promise.all([
      api.status(),
      api.storage().catch(() => null),
    ]);
    const content = document.getElementById('node-content');
    if (!content) return;

    content.innerHTML = `
      <div class="card-grid">
        ${s.node_name ? `
        <div class="card">
          <div class="card-label">Node Name</div>
          <div class="card-value">${escapeHtml(s.node_name)}</div>
        </div>` : ''}
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
          <div class="card-sub">${s.local_docs.toLocaleString()} local · ${s.peer_docs.toLocaleString()} from peers</div>
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

      ${renderStorageSection(storage)}

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
    `;
  } catch (err) {
    const content = document.getElementById('node-content');
    if (content) {
      content.innerHTML = `<div class="empty-state">${icon('alertTriangle', 32, 'var(--red)')}<p>Failed to load status: ${err.message}</p></div>`;
    }
  }
}

function renderPeerList(peers) {
  if (peers.length === 0) {
    return '<div class="empty-state"><p>No peers connected. Waiting for discovery via IPFS DHT, mDNS, or bootstrap...</p></div>';
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

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
