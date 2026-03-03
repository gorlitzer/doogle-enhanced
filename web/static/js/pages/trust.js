// Doogle v2 — Trust & Safety Admin Page
import { api, peerNames } from '../api.js';
import { icon, cardSkeleton, escapeHtml, timeAgo } from '../components.js';

let activeTab = 'overview';

export function renderTrust(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Trust & Safety</h2>
      <p>Spam reports, quarantined peers, and content flagging</p>
    </div>
    <div class="tabs" id="trust-tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="quarantined">Quarantined Peers</button>
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
    if (activeTab === 'overview' || activeTab === 'quarantined') renderTab();
  }, 8000);
}

async function renderTab() {
  const content = document.getElementById('trust-content');
  if (!content) return;

  if (activeTab === 'overview') await renderOverview(content);
  else if (activeTab === 'quarantined') await renderQuarantined(content);
  else if (activeTab === 'report') renderReportForm(content);
}

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

async function renderOverview(el) {
  el.innerHTML = cardSkeleton(4);
  try {
    const data = await api.trust();

    const totalReports = data.total_reports || 0;
    const quarantinedPeers = data.quarantined_peers || 0;
    const trackedPeers = data.tracked_peers || 0;
    const flaggedDomains = data.flagged_domains || 0;
    const reports = data.recent_reports || [];

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
        <h3>Recent Reports</h3>
        ${reports.length === 0
          ? '<div class="empty-state"><p>No spam reports yet. Reports submitted by you or peers will appear here.</p></div>'
          : `<div class="table-wrap"><table>
              <thead><tr>
                <th>URL</th>
                <th>Domain</th>
                <th>Reason</th>
                <th>Reporter</th>
                <th>Time</th>
              </tr></thead>
              <tbody>
                ${reports.map(r => `<tr>
                  <td class="mono" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.url)}">${escapeHtml(r.url)}</td>
                  <td>${escapeHtml(r.domain || '')}</td>
                  <td><span class="badge badge-${reasonColor(r.reason)}">${escapeHtml(r.reason)}</span></td>
                  <td style="font-size:0.85em" title="${escapeHtml(r.reporter_id || '')}">${escapeHtml(peerNames.resolve(r.reporter_id))}</td>
                  <td>${timeAgo(r.timestamp)}</td>
                </tr>`).join('')}
              </tbody>
            </table></div>`
        }
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load trust data: ${err.message}</p></div>`;
  }
}

async function renderQuarantined(el) {
  el.innerHTML = cardSkeleton(4);
  try {
    const data = await api.trust();
    const peers = data.quarantined_list || [];

    if (peers.length === 0) {
      el.innerHTML = `<div class="empty-state"><p>No quarantined peers. Peers with very low trust scores will appear here.</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="section">
        <h3>Quarantined Peers</h3>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Peer ID</th>
            <th>Trust Score</th>
            <th>Good Docs</th>
            <th>Spam Docs</th>
            <th>Reports About</th>
            <th>First Seen</th>
            <th>Last Seen</th>
          </tr></thead>
          <tbody>
            ${peers.map(p => `<tr>
              <td style="font-size:0.85em" title="${escapeHtml(p.peer_id)}">${escapeHtml(peerNames.resolve(p.peer_id))}</td>
              <td><span class="badge badge-${trustColor(p.trust_score)}">${(p.trust_score || 0).toFixed(2)}</span></td>
              <td>${(p.good_docs || 0).toLocaleString()}</td>
              <td>${(p.spam_docs || 0).toLocaleString()}</td>
              <td>${(p.reports_about || 0).toLocaleString()}</td>
              <td>${timeAgo(p.first_seen)}</td>
              <td>${timeAgo(p.last_seen)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Failed to load quarantined peers: ${err.message}</p></div>`;
  }
}

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
