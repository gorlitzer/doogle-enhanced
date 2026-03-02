// Doogle v2 — Fleet Management Dashboard
import { escapeHtml, cardSkeleton, timeAgo } from '../components.js';

const TOKEN_KEY = 'doogle_fleet_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function fleetFetch(path) {
  const token = getToken();
  const resp = await fetch(path, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (resp.status === 401) throw new Error('unauthorized');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function fleetProxy(peerID, targetPath) {
  const token = getToken();
  const resp = await fetch(`/api/fleet/nodes/${peerID}/proxy${targetPath}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (resp.status === 401) throw new Error('unauthorized');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export function renderFleet(container) {
  const token = getToken();

  if (!token) {
    renderAuthGate(container);
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <h2>Fleet Management</h2>
      <p>Monitor and manage worker nodes from this coordinator</p>
    </div>
    <div id="fleet-content">${cardSkeleton(4)}</div>
    <div style="margin-top:24px">
      <button class="btn" id="fleet-clear-token" style="font-size:0.85em;opacity:0.7">Clear stored token</button>
    </div>
  `;

  document.getElementById('fleet-clear-token')?.addEventListener('click', () => {
    clearToken();
    renderFleet(container);
  });

  loadFleetData(container);
  window._pageInterval = setInterval(() => loadFleetData(container), 8000);
}

function renderAuthGate(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Fleet Management</h2>
      <p>Enter the fleet API token to access fleet management</p>
    </div>
    <div class="section" style="max-width:480px">
      <div class="form-row" style="flex-direction:column;gap:12px;align-items:stretch">
        <input type="password" id="fleet-token-input" placeholder="Fleet API token"
          style="padding:10px 12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.95em;font-family:monospace">
        <button class="btn btn-primary" id="fleet-token-submit" style="align-self:flex-start">Connect</button>
        <div id="fleet-token-error" style="color:var(--red);font-size:0.9em;display:none"></div>
      </div>
    </div>
  `;

  const input = document.getElementById('fleet-token-input');
  const btn = document.getElementById('fleet-token-submit');
  const errEl = document.getElementById('fleet-token-error');

  async function tryConnect() {
    const token = input.value.trim();
    if (!token) return;
    setToken(token);
    try {
      await fleetFetch('/api/fleet/nodes');
      renderFleet(container);
    } catch {
      clearToken();
      errEl.textContent = 'Invalid token or fleet not available';
      errEl.style.display = 'block';
    }
  }

  btn.addEventListener('click', tryConnect);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryConnect(); });
}

async function loadFleetData(container) {
  const content = document.getElementById('fleet-content');
  if (!content) return;

  try {
    const data = await fleetFetch('/api/fleet/nodes');

    const totalNodes = data.total_nodes || 0;
    const onlineNodes = data.online_nodes || 0;
    const totalDocs = data.total_docs || 0;
    const coordID = data.coordinator_id || '';
    const nodes = data.nodes || [];

    content.innerHTML = `
      <div class="card-grid">
        <div class="card">
          <div class="card-label">Total Workers</div>
          <div class="card-value">${totalNodes}</div>
        </div>
        <div class="card">
          <div class="card-label">Online</div>
          <div class="card-value">${onlineNodes}</div>
        </div>
        <div class="card">
          <div class="card-label">Total Indexed Docs</div>
          <div class="card-value">${totalDocs.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Coordinator</div>
          <div class="card-value" style="font-size:0.75em;word-break:break-all">${escapeHtml(coordID.slice(0, 16))}...</div>
        </div>
      </div>

      <div class="section">
        <h3>Worker Nodes</h3>
        ${nodes.length === 0
          ? '<div class="empty-state"><p>No workers registered yet. Start a worker with <code>--fleet-role worker</code>.</p></div>'
          : `<div class="table-wrap"><table>
              <thead><tr>
                <th>Name</th>
                <th>Peer ID</th>
                <th>Status</th>
                <th>Docs</th>
                <th>Crawled</th>
                <th>Queue</th>
                <th>Peers</th>
                <th>Uptime</th>
                <th>Last Seen</th>
                <th></th>
              </tr></thead>
              <tbody>
                ${nodes.map(n => `<tr>
                  <td>${escapeHtml(n.name || '(unnamed)')}</td>
                  <td class="mono" style="font-size:0.85em" title="${escapeHtml(n.peer_id)}">${escapeHtml((n.peer_id || '').slice(0, 12))}...</td>
                  <td><span class="badge badge-${statusColor(n.status)}">${escapeHtml(n.status)}</span></td>
                  <td>${(n.stats?.indexed_docs || 0).toLocaleString()}</td>
                  <td>${(n.stats?.crawled_urls || 0).toLocaleString()}</td>
                  <td>${(n.stats?.urls_in_queue || 0).toLocaleString()}</td>
                  <td>${n.stats?.connected_peers || 0}</td>
                  <td>${escapeHtml(n.stats?.uptime || '-')}</td>
                  <td>${timeAgo(n.last_seen)}</td>
                  <td><button class="btn btn-sm fleet-open-btn" data-peer="${escapeHtml(n.peer_id)}" ${n.status !== 'online' ? 'disabled' : ''}>Open</button></td>
                </tr>`).join('')}
              </tbody>
            </table></div>`
        }
      </div>

      <div id="fleet-worker-detail" style="margin-top:16px"></div>
    `;

    // Bind open buttons.
    content.querySelectorAll('.fleet-open-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const peerID = btn.dataset.peer;
        openWorkerDetail(peerID);
      });
    });
  } catch (err) {
    if (err.message === 'unauthorized') {
      clearToken();
      renderFleet(container);
      return;
    }
    content.innerHTML = `<div class="empty-state"><p>Fleet not available. This node may not be running as a coordinator.</p></div>`;
  }
}

async function openWorkerDetail(peerID) {
  const detail = document.getElementById('fleet-worker-detail');
  if (!detail) return;

  detail.innerHTML = `<div class="section"><h3>Loading worker data...</h3></div>`;

  try {
    const status = await fleetProxy(peerID, '/api/status');
    detail.innerHTML = `
      <div class="section">
        <h3>Worker: ${escapeHtml(status.node_name || peerID.slice(0, 12))}</h3>
        <div class="card-grid">
          <div class="card">
            <div class="card-label">Indexed Docs</div>
            <div class="card-value">${(status.indexed_docs || 0).toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-label">Crawled URLs</div>
            <div class="card-value">${(status.crawled_urls || 0).toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-label">Queue</div>
            <div class="card-value">${(status.urls_in_queue || 0).toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-label">Uptime</div>
            <div class="card-value">${escapeHtml(status.uptime || '-')}</div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    detail.innerHTML = `<div class="section"><p style="color:var(--red)">Failed to load worker data: ${escapeHtml(err.message)}</p></div>`;
  }
}

function statusColor(status) {
  switch (status) {
    case 'online': return 'green';
    case 'stale': return 'amber';
    case 'offline': return 'red';
    default: return 'default';
  }
}
