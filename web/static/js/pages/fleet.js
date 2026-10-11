// Doogle v2 — Fleet Management Dashboard
import { escapeHtml, cardSkeleton, timeAgo } from '../components.js';
import { api, peerNames } from '../api.js';
import { navGen } from '../nav-gen.js';

let fleetToken = '';

async function fleetFetch(path) {
  if (!fleetToken) {
    const s = await api.status();
    fleetToken = s.fleet_api_token || '';
  }
  if (!fleetToken) throw new Error('no token');
  const resp = await fetch(path, {
    headers: { 'Authorization': `Bearer ${fleetToken}` },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function fleetProxy(peerID, targetPath, options) {
  if (!fleetToken) {
    const s = await api.status();
    fleetToken = s.fleet_api_token || '';
  }
  const fetchOpts = {
    headers: { 'Authorization': `Bearer ${fleetToken}` },
  };
  if (options && options.method) fetchOpts.method = options.method;
  if (options && options.body) {
    fetchOpts.body = JSON.stringify(options.body);
    fetchOpts.headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(`/api/fleet/nodes/${peerID}/proxy${targetPath}`, fetchOpts);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function fleetPost(path, body) {
  if (!fleetToken) {
    const s = await api.status();
    fleetToken = s.fleet_api_token || '';
  }
  return fetch(path, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${fleetToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : '{}',
  });
}

export function renderFleet(container) {
  fleetToken = '';

  container.innerHTML = `
    <div class="page-header">
      <h2>Fleet Management</h2>
      <p>Monitor and manage worker nodes</p>
    </div>
    <div id="fleet-content">${cardSkeleton(4)}</div>
  `;

  loadFleetData(container);
  window._pageInterval = setInterval(() => loadFleetData(container), 8000);
}

async function loadFleetData(container) {
  const content = document.getElementById('fleet-content');
  if (!content) return;
  const gen = navGen();

  try {
    const data = await fleetFetch('/api/fleet/nodes');
    if (gen !== navGen()) return;

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
          <div class="card-value" style="font-size:0.75em;word-break:break-all">${escapeHtml(peerNames.resolve(coordID))}</div>
        </div>
      </div>

      <div class="section" id="fleet-upgrade-controls" style="margin-bottom:16px">
        <h3>Fleet Upgrades</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-sm" id="fleet-check-updates-btn">Check for Updates</button>
          <span id="fleet-version-status" style="font-size:0.9em;color:var(--text-muted)"></span>
        </div>
        <div id="fleet-upgrade-actions" style="margin-top:8px;display:none">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm" id="fleet-upgrade-all-btn">Upgrade All Workers</button>
            <button class="btn btn-sm" id="fleet-upgrade-coord-btn" style="display:none">Upgrade Coordinator</button>
          </div>
        </div>
        <div id="fleet-upgrade-log" style="display:none;margin-top:12px;background:var(--bg-code,#1a1a2e);border-radius:8px;padding:12px;font-family:monospace;font-size:0.85em;max-height:300px;overflow-y:auto;white-space:pre-wrap"></div>
      </div>

      <div class="section">
        <h3>Worker Nodes</h3>
        ${nodes.length === 0
          ? '<div class="empty-state"><p>No workers connected yet. Add one from <a href="#/admin/actions">Actions</a>.</p></div>'
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
                <th>Version</th>
                <th>Last Seen</th>
                <th></th>
              </tr></thead>
              <tbody>
                ${nodes.map(n => `<tr>
                  <td>${escapeHtml(n.name || 'Anonymous Node')}</td>
                  <td class="mono" style="font-size:0.85em" title="${escapeHtml(n.peer_id)}">${escapeHtml((n.peer_id || '').slice(0, 12))}...</td>
                  <td><span class="badge badge-${statusColor(n.status)}">${escapeHtml(n.status)}</span></td>
                  <td>${(n.stats?.indexed_docs || 0).toLocaleString()}</td>
                  <td>${(n.stats?.crawled_urls || 0).toLocaleString()}</td>
                  <td>${(n.stats?.urls_in_queue || 0).toLocaleString()}</td>
                  <td>${n.stats?.connected_peers || 0}</td>
                  <td>${escapeHtml(n.stats?.uptime || '-')}</td>
                  <td class="mono" style="font-size:0.85em">${escapeHtml(n.stats?.version || '-')}</td>
                  <td>${timeAgo(n.last_seen)}</td>
                  <td style="display:flex;gap:4px">
                    <button class="btn btn-sm fleet-open-btn" data-peer="${escapeHtml(n.peer_id)}" ${n.status !== 'online' ? 'disabled' : ''}>Open</button>
                    <button class="btn btn-sm fleet-upgrade-btn" data-peer="${escapeHtml(n.peer_id)}" data-name="${escapeHtml(n.name || 'Worker')}" ${n.status !== 'online' ? 'disabled' : ''}>Upgrade</button>
                  </td>
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

    // Bind per-worker upgrade buttons.
    content.querySelectorAll('.fleet-upgrade-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const peerID = btn.dataset.peer;
        const name = btn.dataset.name;
        btn.disabled = true;
        btn.textContent = 'Upgrading...';
        startFleetUpgrade([peerID]);
      });
    });

    // Bind check updates button.
    const checkBtn = document.getElementById('fleet-check-updates-btn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => checkForUpdates());
    }

    // Bind upgrade all button.
    const upgradeAllBtn = document.getElementById('fleet-upgrade-all-btn');
    if (upgradeAllBtn) {
      upgradeAllBtn.addEventListener('click', () => {
        upgradeAllBtn.disabled = true;
        upgradeAllBtn.textContent = 'Upgrading...';
        startFleetUpgrade([]);
      });
    }

    // Bind coordinator upgrade button.
    const coordBtn = document.getElementById('fleet-upgrade-coord-btn');
    if (coordBtn) {
      coordBtn.addEventListener('click', () => upgradeCoordinator(coordBtn));
    }

  } catch (err) {
    const msg = err.message === 'no token'
      ? 'Fleet token not available. Access this page from <code>localhost</code> or enter the token from your terminal logs in <a href="#/admin/actions">Actions &gt; Fleet</a>.'
      : 'Fleet not available. Set the fleet role to <strong>Coordinator</strong> in the <a href="#/wizard">setup wizard</a>.';
    content.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
  }
}

async function checkForUpdates() {
  const statusEl = document.getElementById('fleet-version-status');
  const actionsEl = document.getElementById('fleet-upgrade-actions');
  if (!statusEl) return;

  statusEl.textContent = 'Checking...';
  statusEl.style.color = 'var(--text-muted)';

  try {
    const data = await fleetFetch('/api/fleet/versions');
    if (data.update_available) {
      statusEl.innerHTML = `Update available: <strong>${escapeHtml(data.latest_version)}</strong> (coordinator: ${escapeHtml(data.coordinator_version)})`;
      statusEl.style.color = 'var(--green, #4ade80)';
      if (actionsEl) {
        actionsEl.style.display = 'block';
        // Show coordinator upgrade button if coordinator itself needs update.
        const coordBtn = document.getElementById('fleet-upgrade-coord-btn');
        if (coordBtn && data.coordinator_version !== data.latest_version && data.coordinator_version !== 'dev') {
          coordBtn.style.display = '';
        }
      }
    } else {
      statusEl.textContent = 'All nodes up to date' + (data.latest_version ? ` (${data.latest_version})` : '');
      statusEl.style.color = 'var(--green, #4ade80)';
      if (actionsEl) actionsEl.style.display = 'none';
    }
  } catch (err) {
    statusEl.textContent = 'Failed to check: ' + err.message;
    statusEl.style.color = 'var(--red, #f87171)';
  }
}

async function startFleetUpgrade(peerIDs) {
  const logEl = document.getElementById('fleet-upgrade-log');
  if (!logEl) return;

  logEl.style.display = 'block';
  logEl.textContent = '';

  try {
    const resp = await fleetPost('/api/fleet/upgrade', { peer_ids: peerIDs });
    if (!resp.ok && !resp.body) {
      appendLog(logEl, 'error', `HTTP ${resp.status}`);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          renderUpgradeEvent(logEl, evt);
        } catch { /* skip */ }
      }
    }
  } catch (err) {
    appendLog(logEl, 'error', `Stream error: ${err.message}`);
  }
}

function renderUpgradeEvent(logEl, evt) {
  const prefix = evt.worker_num && evt.total
    ? `[${evt.worker_num}/${evt.total}] `
    : '';
  const name = evt.peer_name || (evt.peer_id ? evt.peer_id.slice(0, 12) : '');
  let color = 'var(--text-muted, #888)';
  let text = '';

  switch (evt.step) {
    case 'start':
      text = evt.message;
      color = 'var(--blue, #60a5fa)';
      break;
    case 'skipped':
      text = `${prefix}${name}: skipped (${evt.message})`;
      color = 'var(--text-muted, #888)';
      break;
    case 'updating':
      text = `${prefix}${name}: updating...`;
      color = 'var(--amber, #fbbf24)';
      break;
    case 'restarting':
      text = `${prefix}${name}: restarting...`;
      color = 'var(--amber, #fbbf24)';
      break;
    case 'online':
      text = `${prefix}${name}: online (${evt.version})`;
      color = 'var(--green, #4ade80)';
      break;
    case 'failed':
    case 'timeout':
    case 'error':
      text = `${prefix}${name ? name + ': ' : ''}${evt.step} - ${evt.message}`;
      color = 'var(--red, #f87171)';
      break;
    case 'complete':
      text = evt.message;
      color = 'var(--green, #4ade80)';
      break;
    default:
      text = `${prefix}${name}: ${evt.step} - ${evt.message}`;
  }

  appendLog(logEl, color, text);
}

function appendLog(logEl, color, text) {
  const line = document.createElement('div');
  line.style.color = color;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

async function upgradeCoordinator(btn) {
  const logEl = document.getElementById('fleet-upgrade-log');
  if (logEl) {
    logEl.style.display = 'block';
    appendLog(logEl, 'var(--amber, #fbbf24)', 'Upgrading coordinator...');
  }
  btn.disabled = true;
  btn.textContent = 'Upgrading...';

  try {
    await api.applyUpdateRestart();
    if (logEl) appendLog(logEl, 'var(--amber, #fbbf24)', 'Update applied, coordinator restarting...');

    // Poll status until coordinator comes back.
    let attempts = 0;
    const maxAttempts = 45; // 90 seconds
    const poll = setInterval(async () => {
      attempts++;
      try {
        await api.status();
        clearInterval(poll);
        if (logEl) appendLog(logEl, 'var(--green, #4ade80)', 'Coordinator back online! Reloading...');
        setTimeout(() => window.location.reload(), 1000);
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(poll);
          if (logEl) appendLog(logEl, 'var(--red, #f87171)', 'Coordinator did not come back within 90s');
          btn.disabled = false;
          btn.textContent = 'Upgrade Coordinator';
        }
      }
    }, 2000);
  } catch (err) {
    if (logEl) appendLog(logEl, 'var(--red, #f87171)', 'Upgrade failed: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Upgrade Coordinator';
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
        <h3>Worker: ${escapeHtml(status.node_name || 'Anonymous Node')}</h3>
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
