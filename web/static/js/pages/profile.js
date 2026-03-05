// Doogle v2 — Master Profile Page
import { api } from '../api.js';
import { navGen } from '../nav-gen.js';
import { icon, cardSkeleton, escapeHtml } from '../components.js';

const roleDescriptions = {
  Explorer:   'Breadth of interests — how many topics you explore',
  Guardian:   'Vigilance — spam reports filed to keep the index clean',
  Connector:  'Uptime and peer connections sustaining the network',
  Specialist: 'Depth — how concentrated your index is in specific domains',
  Curator:    'Quality eye — reports and diverse search patterns',
  Amplifier:  'Community growth (coming soon)',
  Archivist:  'Long-running preservation of knowledge',
  Builder:    'Contributing code and new features (coming soon)',
};

const roleIcons = {
  Explorer:   'globe',
  Guardian:   'shield',
  Connector:  'network',
  Specialist: 'search',
  Curator:    'eye',
  Amplifier:  'megaphone',
  Archivist:  'trendingUp',
  Builder:    'code',
};

const roleColors = {
  Explorer:   'var(--accent)',
  Guardian:   'var(--green)',
  Connector:  'var(--blue)',
  Specialist: 'var(--purple)',
  Curator:    'var(--amber)',
  Amplifier:  'var(--red, #ef4444)',
  Archivist:  'var(--green)',
  Builder:    'var(--accent)',
};

export async function renderProfile(el) {
  el.innerHTML = `
    <div class="page-header">
      <h2>Master Profile</h2>
      <p>Your node's behavioral profile — interests, search habits, role affinities. Never leaves your machine.</p>
    </div>
    <div id="profile-content">${cardSkeleton(4)}</div>
  `;

  const gen = navGen();
  let profile;
  try {
    profile = await api.profile();
  } catch {
    document.getElementById('profile-content').innerHTML =
      '<div class="empty-state"><p>Could not load profile data.</p></div>';
    return;
  }
  if (gen !== navGen()) return;

  const interests = Object.entries(profile.interests || {}).sort((a, b) => b[1] - a[1]);
  const roles = Object.entries(profile.role_affinities || {}).sort((a, b) => b[1] - a[1]);
  const searchTopics = Object.entries(profile.search_topics || {}).sort((a, b) => b[1] - a[1]);
  const topDomains = Object.entries(profile.top_domains || {}).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const topRole = roles.length > 0 && roles[0][1] > 0 ? roles[0][0] : null;

  const content = document.getElementById('profile-content');
  if (!content) return;

  content.innerHTML = `
    ${topRole ? renderHeroBanner(topRole, roles[0][1]) : ''}

    <div class="card-grid">
      <div class="card">
        <div class="card-label">Reports Filed</div>
        <div class="card-value">${profile.reports_made || 0}</div>
      </div>
      <div class="card">
        <div class="card-label">Interests</div>
        <div class="card-value">${interests.length}</div>
      </div>
      <div class="card">
        <div class="card-label">Search Topics</div>
        <div class="card-value">${searchTopics.length}</div>
      </div>
      <div class="card">
        <div class="card-label">Indexed Domains</div>
        <div class="card-value">${Object.keys(profile.top_domains || {}).length}</div>
      </div>
    </div>

    <div class="section">
      <h3>Role Mastery</h3>
      <div class="prof-roles">${roles.map(([name, value]) => renderRoleCard(name, value)).join('')}</div>
    </div>

    <div class="prof-two-col">
      <div class="section">
        <h3>Interests</h3>
        ${interests.length > 0
          ? `<div class="prof-tags">${interests.map(([id]) =>
              `<span class="badge badge-accent">${escapeHtml(formatInterestId(id))}</span>`
            ).join('')}</div>`
          : '<div class="empty-state"><p>No interests recorded yet. Complete the Setup Wizard to pick your topics.</p></div>'
        }
      </div>

      ${searchTopics.length > 0 ? `
      <div class="section">
        <h3>Search Topics</h3>
        ${renderBarChart(searchTopics.slice(0, 10), 'var(--accent)')}
      </div>
      ` : ''}
    </div>

    ${topDomains.length > 0 ? `
    <div class="section">
      <h3>Top Domains</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Domain</th><th style="text-align:right">Documents</th></tr></thead>
          <tbody>
            ${topDomains.map(([domain, count]) => `
              <tr>
                <td>${escapeHtml(domain)}</td>
                <td style="text-align:right">${count.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}
  `;
}

function renderHeroBanner(role, value) {
  const pct = Math.round(value * 100);
  const color = roleColors[role] || 'var(--accent)';
  return `
    <div class="prof-hero">
      <div class="prof-hero-icon" style="color:${color}">${icon(roleIcons[role], 40)}</div>
      <div class="prof-hero-info">
        <div class="prof-hero-title">Primary Facet: <strong>${role}</strong></div>
        <div class="prof-hero-desc">${roleDescriptions[role]}</div>
        <div class="prof-hero-bar">
          <div class="prof-hero-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
      <div class="prof-hero-pct" style="color:${color}">${pct}%</div>
    </div>
  `;
}

function renderRoleCard(name, value) {
  const pct = Math.round(value * 100);
  const color = roleColors[name] || 'var(--text-muted)';
  const iconName = roleIcons[name] || 'star';
  return `
    <div class="prof-role">
      <div class="prof-role-icon" style="color:${color}">${icon(iconName, 20)}</div>
      <div class="prof-role-body">
        <div class="prof-role-head">
          <span class="prof-role-name">${name}</span>
          <span class="prof-role-pct">${pct}%</span>
        </div>
        <div class="prof-bar">
          <div class="prof-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="prof-role-desc">${roleDescriptions[name]}</div>
      </div>
    </div>
  `;
}

function renderBarChart(entries, color) {
  const max = entries.length > 0 ? entries[0][1] : 1;
  return `
    <div class="prof-bars">
      ${entries.map(([label, count]) => {
        const pct = max > 0 ? Math.round((count / max) * 100) : 0;
        return `
          <div class="prof-bars-row">
            <div class="prof-bars-label">${escapeHtml(label)}</div>
            <div class="prof-bar">
              <div class="prof-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="prof-bars-count">${count}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function formatInterestId(id) {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
