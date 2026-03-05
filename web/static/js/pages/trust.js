// Doogle v2 — Trust & Safety Admin Page
import { api, peerNames } from '../api.js';
import { icon, cardSkeleton, escapeHtml, timeAgo } from '../components.js';

let activeTab = 'overview';
let showDismissed = false;

export function renderTrust(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Trust & Safety</h2>
      <p>Spam reports, peer reputation, domain blocking, and admin controls</p>
    </div>
    <div class="tabs" id="trust-tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="peers">Peers</button>
      <button class="tab" data-tab="quarantined">Quarantined</button>
      <button class="tab" data-tab="domains">Domains</button>
      <button class="tab" data-tab="audit">Audit Trail</button>
      <button class="tab" data-tab="report">Submit Report</button>
    </div>
    <div id="trust-content"></div>
  `;

  document.querySelectorAll('#trust-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('#trust-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTab();
    });
  });

  renderTab();
  window._pageInterval = setInterval(() => {
    if (['overview', 'quarantined', 'peers', 'domains'].includes(activeTab)) renderTab();
  }, 8000);
}

async function renderTab() {
  const content = document.getElementById('trust-content');
  if (!content) return;

  switch (activeTab) {
    case 'overview': return renderOverview(content);
    case 'peers': return renderPeers(content);
    case 'quarantined': return renderQuarantined(content);
    case 'domains': return renderDomains(content);
    case 'audit': return renderAudit(content);
    case 'report': return renderReportForm(content);
  }
}

// ── Helpers ──

function reasonColor(reason) {
  switch (reason) {
    case 'spam': return 'amber';
    case 'malware': return 'red';
    case 'phishing': return 'red';
    case 'illegal': return 'purple';
    case 'low_quality': return 'default';
    default: return 'default';
  }
}

function trustColor(score) {
  if (score >= 0.7) return 'green';
  if (score >= 0.4) return 'amber';
  return 'red';
}

function tierBadge(score, quarantineCount) {
  const tier = computeTier(score, quarantineCount);
  const colors = {
    trusted: 'green', warning: 'amber', throttled: 'amber',
    quarantined: 'red', banned: 'purple'
  };
  return `<span class="badge badge-${colors[tier] || 'default'}">${tier}</span>`;
}

function computeTier(score, quarantineCount) {
  if (quarantineCount >= 3) return 'banned';
  if (score >= 0.3) return 'trusted';
  if (score >= 0.2) return 'warning';
  if (score >= 0.1) return 'throttled';
  return 'quarantined';
}

function statusBadge(status) {
  if (status === 'dismissed') return '<span class="badge badge-default">dismissed</span>';
  if (status === 'confirmed') return '<span class="badge badge-green">confirmed</span>';
  return '<span class="badge badge-amber">active</span>';
}

async function doAction(fn, successMsg) {
  try {
    await fn();
    renderTab();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ── Tab 1: Overview ──

async function renderOverview(el) {
  el.innerHTML = cardSkeleton(4);
  try {
    const data = await api.trust();

    const totalReports = data.total_reports || 0;
    const quarantinedPeers = data.quarantined_peers || 0;
    const trackedPeers = data.tracked_peers || 0;
    const flaggedDomains = data.flagged_domains || 0;
    const reports = (data.recent_reports || []).filter(r => showDismissed || r.status !== 'dismissed');

    el.innerHTML = `
      <div class="card-grid">
        <div class="card">
          <div class="card-label">Total Reports</div>
          <div class="card-value">${totalReports.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Quarantined Peers</div>
          <div class="card-value">${quarantinedPeers.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Tracked Peers</div>
          <div class="card-value">${trackedPeers.toLocaleString()}</div>
        </div>
        <div class="card">
          <div class="card-label">Flagged Domains</div>
          <div class="card-value">${flaggedDomains.toLocaleString()}</div>
        </div>
      </div>

      <div class="section">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <h3 style="margin:0">Recent Reports</h3>
          <label style="font-size:0.85em;color:var(--text-muted);cursor:pointer">
            <input type="checkbox" id="show-dismissed" ${showDismissed ? 'checked' : ''}> Show dismissed
          </label>
        </div>
        ${reports.length === 0
          ? '<div class="empty-state"><p>No spam reports yet.</p></div>'
          : `<div class="table-wrap"><table>
              <thead><tr>
                <th>URL</th>
                <th>Domain</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Reporter</th>
                <th>Time</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                ${reports.map(r => `<tr>
                  <td class="mono" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.url)}">${escapeHtml(r.url)}</td>
                  <td>${escapeHtml(r.domain || '')}</td>
                  <td><span class="badge badge-${reasonColor(r.reason)}">${escapeHtml(r.reason)}</span></td>
                  <td>${statusBadge(r.status)}</td>
                  <td style="font-size:0.85em" title="${escapeHtml(r.reporter_id || '')}">${escapeHtml(peerNames.resolve(r.reporter_id))}</td>
                  <td>${timeAgo(r.timestamp)}</td>
                  <td>
                    ${!r.status ? `
                      <button class="btn btn-sm" onclick="window._trustDismiss('${escapeHtml(r.id)}')">Dismiss</button>
                      <button class="btn btn-sm btn-primary" onclick="window._trustConfirm('${escapeHtml(r.id)}')">Confirm</button>
                    ` : ''}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table></div>`
        }
      </div>
    `;

    document.getElementById('show-dismissed')?.addEventListener('change', (e) => {
      showDismissed = e.target.checked;
      renderOverview(el);
    });

    window._trustDismiss = (id) => doAction(() => api.dismissReport(id));
    window._trustConfirm = (id) => doAction(() => api.confirmReport(id));
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load trust data: ${err.message}</p></div>`;
  }
}

// ── Tab 2: Peers ──

async function renderPeers(el) {
  el.innerHTML = cardSkeleton(4);
  try {
    const data = await api.trust();
    const peers = (data.all_peers || []).sort((a, b) => (a.trust_score || 0) - (b.trust_score || 0));

    if (peers.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No peers tracked yet.</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="section">
        <h3>All Tracked Peers (${peers.length})</h3>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Peer</th>
            <th>Trust Score</th>
            <th>Tier</th>
            <th>Good Docs</th>
            <th>Spam Docs</th>
            <th>Reports About</th>
            <th>Credibility</th>
            <th>First Seen</th>
            <th>Last Seen</th>
          </tr></thead>
          <tbody>
            ${peers.map(p => {
              const confirmed = p.reports_confirmed || 0;
              const rejected = p.reports_rejected || 0;
              const total = confirmed + rejected;
              const credibility = total > 0 ? `${confirmed}/${total}` : '-';
              return `<tr>
                <td style="font-size:0.85em" title="${escapeHtml(p.peer_id)}">${escapeHtml(peerNames.resolve(p.peer_id))}</td>
                <td><span class="badge badge-${trustColor(p.trust_score)}">${(p.trust_score || 0).toFixed(3)}</span></td>
                <td>${tierBadge(p.trust_score || 0, p.quarantine_count || 0)}</td>
                <td>${(p.good_docs || 0).toLocaleString()}</td>
                <td>${(p.spam_docs || 0).toLocaleString()}</td>
                <td>${(p.reports_about || 0).toLocaleString()}</td>
                <td>${credibility}</td>
                <td>${timeAgo(p.first_seen)}</td>
                <td>${timeAgo(p.last_seen)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load peers: ${err.message}</p></div>`;
  }
}

// ── Tab 3: Quarantined ──

async function renderQuarantined(el) {
  el.innerHTML = cardSkeleton(4);
  try {
    const data = await api.trust();
    const peers = data.quarantined_list || [];

    if (peers.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No quarantined peers.</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="section">
        <h3>Quarantined Peers (${peers.length})</h3>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Peer</th>
            <th>Trust Score</th>
            <th>Quarantine Count</th>
            <th>Quarantined At</th>
            <th>Spam Docs</th>
            <th>Reports About</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${peers.map(p => {
              const isBanned = (p.quarantine_count || 0) >= 3;
              return `<tr>
                <td style="font-size:0.85em" title="${escapeHtml(p.peer_id)}">${escapeHtml(peerNames.resolve(p.peer_id))}</td>
                <td><span class="badge badge-red">${(p.trust_score || 0).toFixed(3)}</span></td>
                <td>${p.quarantine_count || 0}</td>
                <td>${p.quarantined_at ? timeAgo(p.quarantined_at) : '-'}</td>
                <td>${(p.spam_docs || 0).toLocaleString()}</td>
                <td>${(p.reports_about || 0).toLocaleString()}</td>
                <td>
                  ${isBanned
                    ? '<span class="badge badge-purple">Permanently banned</span>'
                    : `<button class="btn btn-sm btn-primary" onclick="window._trustUnquarantine('${escapeHtml(p.peer_id)}')">Unquarantine</button>`
                  }
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    `;

    window._trustUnquarantine = (id) => doAction(() => api.unquarantine(id));
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load quarantined peers: ${err.message}</p></div>`;
  }
}

// ── Tab 4: Domains ──

async function renderDomains(el) {
  el.innerHTML = cardSkeleton(4);
  try {
    const data = await api.trust();
    const flagged = data.flagged_domain_list || [];
    const blocked = data.blocked_domain_list || [];

    // Merge into unified view
    const domainMap = new Map();
    for (const d of flagged) {
      domainMap.set(d.domain, { ...d });
    }
    for (const d of blocked) {
      const existing = domainMap.get(d.domain) || { domain: d.domain, report_count: 0 };
      existing.blocked = d.blocked;
      existing.voters = (d.voters || []).length;
      domainMap.set(d.domain, existing);
    }

    const domains = [...domainMap.values()].sort((a, b) => (b.report_count || 0) - (a.report_count || 0));

    if (domains.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No flagged or blocked domains.</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="section">
        <h3>Flagged & Blocked Domains (${domains.length})</h3>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Domain</th>
            <th>Report Count</th>
            <th>Voters</th>
            <th>Status</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${domains.map(d => `<tr>
              <td class="mono">${escapeHtml(d.domain)}</td>
              <td>${(d.report_count || 0).toLocaleString()}</td>
              <td>${d.voters || 0}</td>
              <td>${d.blocked
                ? '<span class="badge badge-red">blocked</span>'
                : '<span class="badge badge-amber">flagged</span>'
              }</td>
              <td>
                ${d.blocked
                  ? `<button class="btn btn-sm" onclick="window._trustUnblock('${escapeHtml(d.domain)}')">Unblock</button>`
                  : ''
                }
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
    `;

    window._trustUnblock = (domain) => doAction(() => api.unblockDomain(domain));
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load domains: ${err.message}</p></div>`;
  }
}

// ── Tab 5: Audit Trail ──

async function renderAudit(el) {
  el.innerHTML = cardSkeleton(4);
  try {
    const data = await api.auditTrail(50);
    const entries = data.entries || [];

    if (entries.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No audit entries yet. Reports will create hash-chained, signed entries.</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="section">
        <h3>Audit Trail (${entries.length} entries)</h3>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Report ID</th>
            <th>URL</th>
            <th>Reason</th>
            <th>Reporter</th>
            <th>Time</th>
            <th>Hash Chain</th>
            <th>Verification</th>
          </tr></thead>
          <tbody>
            ${entries.map(e => {
              const r = e.report || {};
              const isValid = !e.signer_id?.startsWith('INVALID');
              return `<tr>
                <td class="mono" style="font-size:0.8em">${escapeHtml((r.id || '').slice(0, 12))}...</td>
                <td class="mono" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.url || '')}">${escapeHtml(r.url || '')}</td>
                <td><span class="badge badge-${reasonColor(r.reason)}">${escapeHtml(r.reason || '')}</span></td>
                <td style="font-size:0.85em">${escapeHtml(peerNames.resolve(r.reporter_id))}</td>
                <td>${timeAgo(r.timestamp)}</td>
                <td class="mono" style="font-size:0.75em" title="${escapeHtml(e.entry_hash || '')}">${escapeHtml((e.entry_hash || '').slice(0, 16))}...</td>
                <td>${isValid
                  ? '<span class="badge badge-green">valid</span>'
                  : '<span class="badge badge-red">invalid</span>'
                }</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load audit trail: ${err.message}</p></div>`;
  }
}

// ── Tab 6: Submit Report ──

function renderReportForm(el) {
  el.innerHTML = `
    <div class="section">
      <h3>Submit Spam Report</h3>
      <p style="color:var(--text-muted);font-size:0.9em;margin-bottom:16px">
        Report a URL for spam, malware, phishing, or other policy violations. Reports are broadcast to the P2P network.
      </p>
      <div class="form-row" style="flex-direction:column;gap:12px;align-items:stretch">
        <input type="text" id="report-url" placeholder="https://example.com/spam-page" style="padding:10px 12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.95em">
        <select id="report-reason" style="padding:10px 12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.95em">
          <option value="">Select reason...</option>
          <option value="spam">Spam</option>
          <option value="malware">Malware</option>
          <option value="phishing">Phishing</option>
          <option value="illegal">Illegal Content</option>
          <option value="low_quality">Low Quality</option>
        </select>
        <textarea id="report-detail" rows="3" placeholder="Additional details (optional)..." style="padding:10px 12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.95em;resize:vertical;font-family:inherit"></textarea>
        <button class="btn btn-primary" id="report-submit-btn" style="align-self:flex-start">
          <span class="btn-label">${icon('flag', 16)} Submit Report</span>
        </button>
      </div>
      <div id="report-result" style="margin-top:12px"></div>
    </div>
  `;

  const submitBtn = document.getElementById('report-submit-btn');
  submitBtn.addEventListener('click', async () => {
    const url = document.getElementById('report-url').value.trim();
    const reason = document.getElementById('report-reason').value;
    const detail = document.getElementById('report-detail').value.trim();
    const result = document.getElementById('report-result');

    if (!url || !reason) {
      result.innerHTML = '<span class="badge badge-amber">Please enter a URL and select a reason</span>';
      return;
    }

    setLoading(submitBtn, true, 'Submitting...');
    try {
      await api.report(url, reason, detail);
      result.innerHTML = '<span class="badge badge-green">Report submitted successfully</span>';
      document.getElementById('report-url').value = '';
      document.getElementById('report-reason').value = '';
      document.getElementById('report-detail').value = '';
    } catch (err) {
      result.innerHTML = `<span class="badge badge-red">Error: ${escapeHtml(err.message)}</span>`;
    }
    setLoading(submitBtn, false, `${icon('flag', 16)} Submit Report`);
  });
}

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
