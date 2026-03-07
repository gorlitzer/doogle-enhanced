// Doogle v2 — Actions & Management Page
import { api } from '../api.js';
import { navGen } from '../nav-gen.js';
import { icon, showModal, closeModal } from '../components.js';
import { isLiteMode, setLiteMode } from '../lite-mode.js';

export function renderActions(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Actions & Management</h2>
      <p>Node operations, crawl management, and data tools</p>
    </div>
    <div id="actions-content">
      <!-- Crawl Management -->
      <div class="actions-section">
        <div class="actions-section-header">
          ${icon('globe', 20, 'var(--accent)')}
          <h3>Crawl Management</h3>
        </div>
        <div class="actions-grid">
          <div class="action-card">
            <div class="action-card-header">
              <div class="action-icon">${icon('globe', 24, 'var(--accent)')}</div>
              <div>
                <strong>Add Seed URL</strong>
                <p>Queue a single URL for crawling. The crawler will visit this page and follow its links.</p>
              </div>
            </div>
            <div class="action-card-body">
              <div class="action-input-col">
                <input type="text" id="seed-url-input" placeholder="https://example.com" class="action-input">
                <button class="btn btn-primary" id="add-seed-btn">
                  <span class="btn-label">Add Seed</span>
                </button>
              </div>
              <div id="seed-result" class="action-result"></div>
            </div>
          </div>

          <div class="action-card">
            <div class="action-card-header">
              <div class="action-icon">${icon('zap', 24, 'var(--blue)')}</div>
              <div>
                <strong>Batch Seed Import</strong>
                <p>Queue multiple URLs at once. Enter one URL per line (max 200).</p>
              </div>
            </div>
            <div class="action-card-body">
              <textarea id="batch-urls-input" class="action-textarea" rows="5" placeholder="https://example.com&#10;https://another-site.org&#10;https://third-site.net"></textarea>
              <div class="action-row">
                <span class="action-hint" id="batch-count">0 URLs</span>
                <button class="btn btn-primary" id="batch-seed-btn">
                  <span class="btn-label">Import All</span>
                </button>
              </div>
              <div id="batch-result" class="action-result"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Node Settings -->
      <div class="actions-section">
        <div class="actions-section-header">
          ${icon('cpu', 20, 'var(--green)')}
          <h3>Node Settings</h3>
        </div>
        <div class="actions-grid">
          <div class="action-card">
            <div class="action-card-header">
              <div class="action-icon">${icon('fileText', 24, 'var(--green)')}</div>
              <div>
                <strong>Node Name</strong>
                <p>Set a friendly name for your node. This appears in the nav bar and peer list.</p>
              </div>
            </div>
            <div class="action-card-body">
              <div class="action-input-row">
                <input type="text" id="node-name-input" placeholder="My Doogle Node" class="action-input" maxlength="64">
                <button class="btn btn-primary" id="set-name-btn">
                  <span class="btn-label">Save Name</span>
                </button>
              </div>
              <div id="name-result" class="action-result"></div>
            </div>
          </div>

          <div class="action-card">
            <div class="action-card-header">
              <div class="action-icon">${icon('cpu', 24, 'var(--green)')}</div>
              <div>
                <strong>Node ID</strong>
                <p>Your unique libp2p peer identity. Share this with others so they can connect to your node.</p>
              </div>
            </div>
            <div class="action-card-body">
              <div class="action-input-row">
                <input type="text" id="node-id-display" class="action-input" readonly placeholder="Loading...">
                <button class="btn btn-primary" id="copy-node-id-btn">
                  <span class="btn-label">${icon('fileText', 16)} Copy</span>
                </button>
              </div>
              <div id="node-id-result" class="action-result"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Resource Limits -->
      <div class="actions-section" id="limits-section">
        <div class="actions-section-header">
          ${icon('database', 20, 'var(--blue)')}
          <h3>Resource Limits</h3>
        </div>
        <div class="actions-grid">
          <div class="action-card" style="grid-column:1/-1">
            <div class="action-card-header">
              <div class="action-icon">${icon('database', 24, 'var(--blue)')}</div>
              <div>
                <strong>Storage & Crawl Limits</strong>
                <p>Set caps on storage, documents, and queue size. The crawler auto-pauses when limits are reached.</p>
              </div>
            </div>
            <div class="action-card-body" id="limits-body">
              <div class="wizard-loading">Loading limits...</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance -->
      <div class="actions-section" id="performance-section">
        <div class="actions-section-header">
          ${icon('zap', 20, 'var(--green)')}
          <h3>Performance</h3>
        </div>
        <div class="actions-grid">
          <div class="action-card" style="grid-column:1/-1">
            <div class="action-card-header">
              <div class="action-icon">${icon('cpu', 24, 'var(--green)')}</div>
              <div>
                <strong>System Resources & Eco Mode</strong>
                <p>Monitor your system and toggle resource-saving modes.</p>
              </div>
            </div>
            <div class="action-card-body" id="performance-body">
              <div class="wizard-loading">Loading system info...</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Fleet Management -->
      <div class="actions-section" id="fleet-section" style="display:none">
        <div class="actions-section-header">
          ${icon('network', 20, 'var(--accent)')}
          <h3>Fleet</h3>
        </div>
        <div class="actions-grid">
          <div class="action-card">
            <div class="action-card-header">
              <div class="action-icon">${icon('shield', 24, 'var(--accent)')}</div>
              <div>
                <strong>API Token</strong>
                <p>Required to access the <a href="#/admin/fleet">Fleet dashboard</a>. Only visible from localhost.</p>
              </div>
            </div>
            <div class="action-card-body">
              <div class="action-input-col">
                <input type="password" id="fleet-token-display" class="action-input mono" readonly placeholder="Only visible from localhost">
                <div class="action-btn-group">
                  <button class="btn" id="fleet-token-reveal-btn" title="Show / Hide">
                    <span class="btn-label">${icon('eye', 16)} Reveal</span>
                  </button>
                  <button class="btn btn-primary" id="fleet-token-copy-btn">
                    <span class="btn-label">${icon('fileText', 16)} Copy</span>
                  </button>
                </div>
              </div>
              <div id="fleet-token-result" class="action-result"></div>
            </div>
          </div>

          <div class="action-card">
            <div class="action-card-header">
              <div class="action-icon">${icon('link', 24, 'var(--green)')}</div>
              <div>
                <strong>Add a Worker</strong>
                <p>Share these values with the worker node. On the worker, go to the setup wizard and select <strong>Worker</strong> role.</p>
              </div>
            </div>
            <div class="action-card-body">
              <div class="action-input-col">
                <label style="font-size:0.82em;color:var(--text-secondary)">Coordinator Multiaddr</label>
                <input type="text" id="fleet-worker-addr" class="action-input mono" readonly placeholder="Loading...">
                <div class="action-btn-group">
                  <button class="btn btn-primary" id="fleet-addr-copy-btn">
                    <span class="btn-label">${icon('fileText', 16)} Copy Multiaddr</span>
                  </button>
                </div>
                <div id="fleet-addr-result" class="action-result"></div>
              </div>
              <div class="action-input-col" style="margin-top:12px">
                <label style="font-size:0.82em;color:var(--text-secondary)">Fleet Secret</label>
                <input type="password" id="fleet-worker-secret" class="action-input mono" readonly placeholder="Loading...">
                <div class="action-btn-group">
                  <button class="btn" id="fleet-secret-reveal-btn">
                    <span class="btn-label">${icon('eye', 16)} Reveal</span>
                  </button>
                  <button class="btn btn-primary" id="fleet-secret-copy-btn">
                    <span class="btn-label">${icon('fileText', 16)} Copy Secret</span>
                  </button>
                </div>
                <div id="fleet-secret-result" class="action-result"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Data Management -->
      <div class="actions-section">
        <div class="actions-section-header">
          ${icon('database', 20, 'var(--blue)')}
          <h3>Data Management</h3>
        </div>
        <div class="actions-grid">
          <div class="action-card">
            <div class="action-card-header">
              <div class="action-icon">${icon('download', 24, 'var(--accent)')}</div>
              <div>
                <strong>Backup</strong>
                <p>Download a full backup of your node's data directory as a compressed <code>.tar.gz</code> archive. Includes index, crawl data, link graph, and peer identity.</p>
              </div>
            </div>
            <div class="action-card-body">
              <button class="btn btn-primary" id="backup-btn">
                <span class="btn-label">${icon('download', 16)} Download Backup</span>
              </button>
              <div id="backup-result" class="action-result"></div>
            </div>
          </div>

          <div class="action-card">
            <div class="action-card-header">
              <div class="action-icon">${icon('upload', 24, 'var(--green)')}</div>
              <div>
                <strong>Restore</strong>
                <p>Upload a previously exported <code>.tar.gz</code> backup archive to restore your node's data. <strong>Requires a node restart after restore.</strong></p>
              </div>
            </div>
            <div class="action-card-body">
              <input type="file" id="restore-file-input" accept=".tar.gz,.gz,.tgz" style="display:none">
              <button class="btn" id="restore-btn">
                <span class="btn-label">${icon('upload', 16)} Upload Backup</span>
              </button>
              <div id="restore-result" class="action-result"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="actions-section actions-danger-zone">
        <div class="actions-section-header">
          ${icon('alertTriangle', 20, 'var(--red)')}
          <h3>Danger Zone</h3>
        </div>
        <div class="actions-grid">
          <div class="action-card action-card-danger">
            <div class="danger-card-layout">
              <div class="danger-card-info">
                <div class="danger-card-title">
                  ${icon('trash', 20, 'var(--red)')}
                  <strong>Delete All Data</strong>
                </div>
                <p>Permanently delete all crawled data, search indexes, link graph, and peer identity. This cannot be undone — you will need to restart the node and re-crawl everything.</p>
              </div>
              <button class="btn btn-danger" id="delete-all-btn">
                <span class="btn-label">${icon('trash', 16)} Delete All Data</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  setupHandlers();
  loadCurrentName();
  loadLimits();
  loadPerformance();
}

async function loadCurrentName() {
  const gen = navGen();
  try {
    const s = await api.status();
    if (gen !== navGen()) return;
    const input = document.getElementById('node-name-input');
    if (input && s.node_name) input.value = s.node_name;
    const idInput = document.getElementById('node-id-display');
    if (idInput && s.peer_id) idInput.value = s.peer_id;

    // Fleet section — only show when running as coordinator with a token.
    const fleetSection = document.getElementById('fleet-section');
    if (fleetSection && s.fleet_role === 'coordinator' && s.fleet_api_token) {
      fleetSection.style.display = '';
      document.getElementById('fleet-token-display').value = s.fleet_api_token;

      // Populate worker connection fields.
      const addr = (s.addrs || []).find(a => a.includes('/tcp/')) || '';
      const addrEl = document.getElementById('fleet-worker-addr');
      if (addrEl) addrEl.value = addr || 'Multiaddr not available — check node logs';

      const secretHex = s.fleet_secret_hex || '';
      const secretEl = document.getElementById('fleet-worker-secret');
      if (secretEl) secretEl.value = secretHex || 'Check ' + (s.fleet_secret_file || 'data/fleet.secret');
    }
  } catch { /* ignore */ }
}

function setupHandlers() {
  // --- Add Seed ---
  const seedBtn = document.getElementById('add-seed-btn');
  const seedInput = document.getElementById('seed-url-input');
  seedBtn.addEventListener('click', () => addSeed(seedBtn, seedInput));
  seedInput.addEventListener('keydown', e => { if (e.key === 'Enter') addSeed(seedBtn, seedInput); });

  // --- Batch Import ---
  const batchInput = document.getElementById('batch-urls-input');
  const batchBtn = document.getElementById('batch-seed-btn');
  const batchCount = document.getElementById('batch-count');
  batchInput.addEventListener('input', () => {
    const urls = parseUrls(batchInput.value);
    batchCount.textContent = `${urls.length} URL${urls.length !== 1 ? 's' : ''}`;
  });
  batchBtn.addEventListener('click', () => batchImport(batchBtn, batchInput));

  // --- Node Name ---
  const nameBtn = document.getElementById('set-name-btn');
  const nameInput = document.getElementById('node-name-input');
  nameBtn.addEventListener('click', () => setNodeName(nameBtn, nameInput));
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') setNodeName(nameBtn, nameInput); });

  // --- Copy Node ID ---
  const copyIdBtn = document.getElementById('copy-node-id-btn');
  copyIdBtn.addEventListener('click', () => {
    const idInput = document.getElementById('node-id-display');
    const result = document.getElementById('node-id-result');
    if (!idInput.value || idInput.value === 'Loading...') return;
    navigator.clipboard.writeText(idInput.value).then(() => {
      result.innerHTML = '<span class="badge badge-green">Copied to clipboard</span>';
      setTimeout(() => { result.innerHTML = ''; }, 2000);
    }).catch(() => {
      idInput.select();
      document.execCommand('copy');
      result.innerHTML = '<span class="badge badge-green">Copied to clipboard</span>';
      setTimeout(() => { result.innerHTML = ''; }, 2000);
    });
  });

  // --- Fleet Token ---
  const fleetRevealBtn = document.getElementById('fleet-token-reveal-btn');
  const fleetTokenInput = document.getElementById('fleet-token-display');
  if (fleetRevealBtn) {
    fleetRevealBtn.addEventListener('click', () => {
      const isHidden = fleetTokenInput.type === 'password';
      fleetTokenInput.type = isHidden ? 'text' : 'password';
      fleetRevealBtn.querySelector('.btn-label').innerHTML = `${icon('eye', 16)}`;
    });
  }

  const fleetCopyBtn = document.getElementById('fleet-token-copy-btn');
  if (fleetCopyBtn) {
    fleetCopyBtn.addEventListener('click', () => copyField('fleet-token-display', 'fleet-token-result'));
  }

  const fleetSecretRevealBtn = document.getElementById('fleet-secret-reveal-btn');
  const fleetSecretInput = document.getElementById('fleet-worker-secret');
  if (fleetSecretRevealBtn && fleetSecretInput) {
    fleetSecretRevealBtn.addEventListener('click', () => {
      const isHidden = fleetSecretInput.type === 'password';
      fleetSecretInput.type = isHidden ? 'text' : 'password';
      fleetSecretRevealBtn.querySelector('.btn-label').innerHTML = `${icon('eye', 16)}`;
    });
  }

  const fleetAddrCopyBtn = document.getElementById('fleet-addr-copy-btn');
  if (fleetAddrCopyBtn) {
    fleetAddrCopyBtn.addEventListener('click', () => copyField('fleet-worker-addr', 'fleet-addr-result'));
  }

  const fleetSecretCopyBtn = document.getElementById('fleet-secret-copy-btn');
  if (fleetSecretCopyBtn) {
    fleetSecretCopyBtn.addEventListener('click', () => copyField('fleet-worker-secret', 'fleet-secret-result'));
  }

  // --- Backup ---
  document.getElementById('backup-btn').addEventListener('click', downloadBackup);

  // --- Restore ---
  const restoreFile = document.getElementById('restore-file-input');
  document.getElementById('restore-btn').addEventListener('click', () => restoreFile.click());
  restoreFile.addEventListener('change', () => uploadRestore(restoreFile));

  // --- Delete All ---
  document.getElementById('delete-all-btn').addEventListener('click', showDeleteConfirmation);
}

// ---- Action Handlers ----

async function addSeed(btn, input) {
  const url = input.value.trim();
  if (!url) return;
  const result = document.getElementById('seed-result');

  setLoading(btn, true, 'Queuing...');
  try {
    await api.addSeed(url);
    result.innerHTML = `<span class="badge badge-green">Queued: ${escapeHtml(url)}</span>`;
    input.value = '';
  } catch (err) {
    result.innerHTML = `<span class="badge badge-red">Error: ${escapeHtml(err.message)}</span>`;
  }
  setLoading(btn, false, 'Add Seed');
}

async function batchImport(btn, textarea) {
  const urls = parseUrls(textarea.value);
  if (urls.length === 0) return;
  const result = document.getElementById('batch-result');

  if (urls.length > 200) {
    result.innerHTML = '<span class="badge badge-red">Maximum 200 URLs per batch</span>';
    return;
  }

  setLoading(btn, true, `Importing ${urls.length}...`);
  try {
    const resp = await api.crawlBatch(urls);
    const queued = resp.queued ?? urls.length;
    result.innerHTML = `<span class="badge badge-green">Queued ${queued} URL${queued !== 1 ? 's' : ''} for crawling</span>`;
    textarea.value = '';
    document.getElementById('batch-count').textContent = '0 URLs';
  } catch (err) {
    result.innerHTML = `<span class="badge badge-red">Error: ${escapeHtml(err.message)}</span>`;
  }
  setLoading(btn, false, 'Import All');
}

async function setNodeName(btn, input) {
  const name = input.value.trim();
  if (!name) return;
  const result = document.getElementById('name-result');

  setLoading(btn, true, 'Saving...');
  try {
    await api.setNodeName(name);
    result.innerHTML = '<span class="badge badge-green">Node name updated</span>';
  } catch (err) {
    result.innerHTML = `<span class="badge badge-red">Error: ${escapeHtml(err.message)}</span>`;
  }
  setLoading(btn, false, 'Save Name');
}

function downloadBackup() {
  const btn = document.getElementById('backup-btn');
  const result = document.getElementById('backup-result');
  setLoading(btn, true, 'Preparing...');
  result.innerHTML = '<span class="badge badge-blue">Downloading backup archive...</span>';

  // Trigger download via hidden iframe to avoid navigating away
  const a = document.createElement('a');
  a.href = '/api/admin/dump';
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    setLoading(btn, false, `${icon('download', 16)} Download Backup`);
    result.innerHTML = '<span class="badge badge-green">Download started</span>';
  }, 2000);
}

async function uploadRestore(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const btn = document.getElementById('restore-btn');
  const result = document.getElementById('restore-result');

  setLoading(btn, true, 'Uploading...');
  result.innerHTML = `<span class="badge badge-blue">Uploading ${escapeHtml(file.name)} (${formatBytes(file.size)})...</span>`;

  try {
    const resp = await api.restore(file);
    const msg = resp.message || 'Restart the node to apply changes.';
    result.innerHTML = `
      <span class="badge badge-green">Restored ${resp.files ?? 'all'} files</span>
      <p class="action-note">${escapeHtml(msg)}</p>
    `;
  } catch (err) {
    result.innerHTML = `<span class="badge badge-red">Error: ${escapeHtml(err.message)}</span>`;
  }
  setLoading(btn, false, `${icon('upload', 16)} Upload Backup`);
  fileInput.value = '';
}

function showDeleteConfirmation() {
  showModal('Delete All Data', `
    <div class="delete-confirm-modal">
      <div class="delete-confirm-warning">
        ${icon('alertTriangle', 32, 'var(--red)')}
        <p><strong>This will permanently destroy all data on this node.</strong></p>
      </div>
      <ul class="delete-confirm-list">
        <li>All crawled page data</li>
        <li>Full-text search indexes</li>
        <li>Link graph and PageRank data</li>
        <li>Peer identity and keys</li>
        <li>URL queue and dedup state</li>
      </ul>
      <p class="delete-confirm-instruction">Type <strong class="delete-confirm-keyword">DELETE</strong> below to confirm:</p>
      <input type="text" id="delete-confirm-input" placeholder="Type DELETE" autocomplete="off" spellcheck="false"
        style="width:100%;padding:10px 12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;font-size:0.95em;outline:none;margin-bottom:16px;font-family:monospace;letter-spacing:2px;text-align:center">
      <div class="delete-confirm-actions">
        <button class="btn" id="delete-cancel-btn">Cancel</button>
        <button class="btn btn-danger" id="delete-confirm-btn" disabled>
          <span class="btn-label">${icon('trash', 16)} Delete Everything</span>
        </button>
      </div>
      <div id="delete-result" class="action-result" style="margin-top:12px"></div>
    </div>
  `, { width: '480px' });

  const confirmInput = document.getElementById('delete-confirm-input');
  const confirmBtn = document.getElementById('delete-confirm-btn');
  const cancelBtn = document.getElementById('delete-cancel-btn');

  confirmInput.addEventListener('input', () => {
    const match = confirmInput.value.trim() === 'DELETE';
    confirmBtn.disabled = !match;
    confirmInput.style.borderColor = confirmInput.value.trim().length > 0
      ? (match ? 'var(--green)' : 'var(--red)')
      : 'var(--border)';
  });

  cancelBtn.addEventListener('click', closeModal);

  confirmBtn.addEventListener('click', async () => {
    if (confirmInput.value.trim() !== 'DELETE') return;
    const resultEl = document.getElementById('delete-result');

    setLoading(confirmBtn, true, 'Deleting...');
    confirmInput.disabled = true;
    cancelBtn.disabled = true;

    try {
      const resp = await api.deleteData();
      resultEl.innerHTML = `
        <span class="badge badge-green">${escapeHtml(resp.message || 'Data deleted successfully.')}</span>
        <p class="action-note">Restart the node to complete the reset.</p>
      `;
      // Disable all buttons after success
      confirmBtn.style.display = 'none';
      cancelBtn.textContent = 'Close';
      cancelBtn.disabled = false;
    } catch (err) {
      resultEl.innerHTML = `<span class="badge badge-red">Error: ${escapeHtml(err.message)}</span>`;
      setLoading(confirmBtn, false, `${icon('trash', 16)} Delete Everything`);
      confirmInput.disabled = false;
      cancelBtn.disabled = false;
    }
  });
}

// ---- Resource Limits ----

async function loadLimits() {
  const body = document.getElementById('limits-body');
  if (!body) return;
  try {
    const lim = await api.limits();
    renderLimitsUI(body, lim);
  } catch {
    body.innerHTML = '<span class="badge badge-red">Failed to load limits</span>';
  }
}

function renderLimitsUI(body, lim) {
  const pctStorage = lim.max_storage_bytes > 0 ? Math.min(100, (lim.used_storage / lim.max_storage_bytes) * 100) : 0;
  const pctDocs = lim.max_documents > 0 ? Math.min(100, (lim.used_documents / lim.max_documents) * 100) : 0;
  const pctQueue = lim.max_queue_size > 0 ? Math.min(100, (lim.used_queue / lim.max_queue_size) * 100) : 0;

  const pausedBadge = lim.crawler_paused
    ? '<span class="badge badge-red" style="margin-bottom:12px">Crawler paused (limit reached)</span>'
    : '';

  body.innerHTML = `
    ${pausedBadge}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
      <div>
        <label style="font-size:0.82em;color:var(--text-secondary);display:block;margin-bottom:4px">
          Storage: ${formatBytesLimits(lim.used_storage)} / ${lim.max_storage_bytes > 0 ? formatBytesLimits(lim.max_storage_bytes) : 'unlimited'}
        </label>
        <div style="background:var(--bg-secondary);border-radius:4px;height:8px;overflow:hidden">
          <div style="background:${barColor(pctStorage)};height:100%;width:${pctStorage}%;transition:width 0.3s"></div>
        </div>
      </div>
      <div>
        <label style="font-size:0.82em;color:var(--text-secondary);display:block;margin-bottom:4px">
          Documents: ${lim.used_documents.toLocaleString()} / ${lim.max_documents > 0 ? lim.max_documents.toLocaleString() : 'unlimited'}
        </label>
        <div style="background:var(--bg-secondary);border-radius:4px;height:8px;overflow:hidden">
          <div style="background:${barColor(pctDocs)};height:100%;width:${pctDocs}%;transition:width 0.3s"></div>
        </div>
      </div>
      <div>
        <label style="font-size:0.82em;color:var(--text-secondary);display:block;margin-bottom:4px">
          Queue: ${lim.used_queue.toLocaleString()} / ${lim.max_queue_size > 0 ? lim.max_queue_size.toLocaleString() : 'unlimited'}
        </label>
        <div style="background:var(--bg-secondary);border-radius:4px;height:8px;overflow:hidden">
          <div style="background:${barColor(pctQueue)};height:100%;width:${pctQueue}%;transition:width 0.3s"></div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:end">
      <div>
        <label style="font-size:0.82em;color:var(--text-secondary);display:block;margin-bottom:4px">Max Storage (GB)</label>
        <input type="number" id="limit-storage-input" class="action-input" min="0" step="0.5"
          value="${lim.max_storage_bytes > 0 ? (lim.max_storage_bytes / (1024*1024*1024)).toFixed(1) : 0}"
          style="width:100%">
      </div>
      <div>
        <label style="font-size:0.82em;color:var(--text-secondary);display:block;margin-bottom:4px">Max Documents</label>
        <input type="number" id="limit-docs-input" class="action-input" min="0" step="1000"
          value="${lim.max_documents}" style="width:100%">
      </div>
      <div>
        <label style="font-size:0.82em;color:var(--text-secondary);display:block;margin-bottom:4px">Max Queue Size</label>
        <input type="number" id="limit-queue-input" class="action-input" min="0" step="1000"
          value="${lim.max_queue_size}" style="width:100%">
      </div>
    </div>
    <div style="margin-top:12px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" id="save-limits-btn">
        <span class="btn-label">Save Limits</span>
      </button>
    </div>
    <div id="limits-result" class="action-result"></div>
  `;

  document.getElementById('save-limits-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-limits-btn');
    const result = document.getElementById('limits-result');
    const storageGB = parseFloat(document.getElementById('limit-storage-input').value) || 0;
    const maxDocs = parseInt(document.getElementById('limit-docs-input').value) || 0;
    const maxQueue = parseInt(document.getElementById('limit-queue-input').value) || 0;

    setLoading(btn, true, 'Saving...');
    try {
      const updated = await api.setLimits({
        max_storage_bytes: Math.round(storageGB * 1024 * 1024 * 1024),
        max_documents: maxDocs,
        max_queue_size: maxQueue,
      });
      result.innerHTML = '<span class="badge badge-green">Limits saved</span>';
      setTimeout(() => { result.innerHTML = ''; }, 3000);
      // Re-render with updated data
      renderLimitsUI(body, updated);
    } catch (err) {
      result.innerHTML = `<span class="badge badge-red">Error: ${escapeHtml(err.message)}</span>`;
    }
    setLoading(btn, false, 'Save Limits');
  });
}

function formatBytesLimits(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function barColor(pct) {
  if (pct >= 90) return 'var(--red)';
  if (pct >= 70) return 'var(--amber, var(--yellow, orange))';
  return 'var(--green)';
}

// ---- Helpers ----

function setLoading(btn, loading, text) {
  const label = btn.querySelector('.btn-label');
  if (loading) {
    btn.disabled = true;
    btn.classList.add('btn-loading');
    if (label) label.innerHTML = `<span class="spinner"></span> ${text}`;
  } else {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    if (label) label.innerHTML = text;
  }
}

function parseUrls(text) {
  return text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && (line.startsWith('http://') || line.startsWith('https://')));
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function copyField(inputId, resultId) {
  const el = document.getElementById(inputId);
  const result = document.getElementById(resultId);
  const text = el?.value || el?.textContent || '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    result.innerHTML = '<span class="badge badge-green">Copied</span>';
    setTimeout(() => { result.innerHTML = ''; }, 2000);
  }).catch(() => {
    result.innerHTML = '<span class="badge badge-green">Copied</span>';
    setTimeout(() => { result.innerHTML = ''; }, 2000);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ---- Performance (Eco Mode + Lite Mode) ----

async function loadPerformance() {
  const body = document.getElementById('performance-body');
  if (!body) return;

  let sysinfo = null;
  try {
    sysinfo = await api.sysinfo();
  } catch {
    body.innerHTML = '<p style="color:var(--text-secondary)">Could not load system info.</p>';
    return;
  }

  const cpuCores = sysinfo.cpu_cores || '?';
  const ramMB = sysinfo.total_memory_mb || 0;
  const ramLabel = ramMB >= 1024 ? (ramMB / 1024).toFixed(1) + ' GB' : ramMB + ' MB';
  const freeMB = sysinfo.free_space_mb || 0;
  const freeLabel = freeMB >= 1024 ? (freeMB / 1024).toFixed(1) + ' GB' : freeMB + ' MB';
  const recommended = sysinfo.recommended === 'low-resource';
  const ecoOn = sysinfo.low_resource || false;
  const liteOn = isLiteMode();

  body.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:16px">
      <div style="flex:1;min-width:120px;padding:10px;border:1px solid var(--border);border-radius:6px;text-align:center">
        <div style="font-size:0.78em;color:var(--text-secondary)">CPU Cores</div>
        <div style="font-size:1.4em;font-weight:700;color:var(--accent)">${cpuCores}</div>
      </div>
      <div style="flex:1;min-width:120px;padding:10px;border:1px solid var(--border);border-radius:6px;text-align:center">
        <div style="font-size:0.78em;color:var(--text-secondary)">Total RAM</div>
        <div style="font-size:1.4em;font-weight:700;color:var(--accent)">${ramLabel}</div>
      </div>
      <div style="flex:1;min-width:120px;padding:10px;border:1px solid var(--border);border-radius:6px;text-align:center">
        <div style="font-size:0.78em;color:var(--text-secondary)">Free Disk</div>
        <div style="font-size:1.4em;font-weight:700;color:var(--accent)">${freeLabel}</div>
      </div>
    </div>

    ${recommended ? `<div style="margin-bottom:12px"><span style="padding:3px 10px;border-radius:4px;background:var(--amber);color:var(--bg);font-size:0.82em;font-weight:600">Recommended: Eco Mode</span></div>` : ''}

    <div style="display:flex;flex-direction:column;gap:12px">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="checkbox" id="actions-eco-mode" ${ecoOn ? 'checked' : ''} style="accent-color:var(--accent);width:18px;height:18px">
        <span><strong>Eco Mode</strong> — Reduced memory (~6MB vs ~48MB), slower maintenance, capped workers</span>
      </label>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="checkbox" id="actions-lite-mode" ${liteOn ? 'checked' : ''} style="accent-color:var(--accent);width:18px;height:18px">
        <span><strong>Lite Mode</strong> — Disable animations and visual effects</span>
      </label>
    </div>
    <div id="perf-result" class="action-result" style="margin-top:8px"></div>
  `;

  document.getElementById('actions-eco-mode').addEventListener('change', async (e) => {
    const result = document.getElementById('perf-result');
    try {
      await api.setLowResource(e.target.checked);
      result.innerHTML = '<span class="badge badge-green">Eco Mode ' + (e.target.checked ? 'enabled' : 'disabled') + ' (some changes require restart)</span>';
    } catch (err) {
      result.innerHTML = '<span class="badge badge-red">Error: ' + escapeHtml(err.message) + '</span>';
    }
    setTimeout(() => { result.innerHTML = ''; }, 4000);
  });

  document.getElementById('actions-lite-mode').addEventListener('change', (e) => {
    setLiteMode(e.target.checked);
    const result = document.getElementById('perf-result');
    result.innerHTML = '<span class="badge badge-green">Lite Mode ' + (e.target.checked ? 'enabled' : 'disabled') + '</span>';
    setTimeout(() => { result.innerHTML = ''; }, 3000);
  });
}
