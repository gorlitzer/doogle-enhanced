// Doogle v2 — Master Profile Page
import { api } from '../api.js';
import { icon, skeleton } from '../components.js';

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
  el.innerHTML = `<div class="admin-page">${skeleton(4)}</div>`;

  let profile;
  try {
    profile = await api.profile();
  } catch {
    el.innerHTML = `<div class="admin-page"><p class="text-muted">Could not load profile.</p></div>`;
    return;
  }

  const interests = Object.entries(profile.interests || {}).sort((a, b) => b[1] - a[1]);
  const roles = Object.entries(profile.role_affinities || {}).sort((a, b) => b[1] - a[1]);
  const searchTopics = Object.entries(profile.search_topics || {}).sort((a, b) => b[1] - a[1]);
  const topDomains = Object.entries(profile.top_domains || {}).sort((a, b) => b[1] - a[1]).slice(0, 20);

  // Determine dominant role
  const topRole = roles.length > 0 && roles[0][1] > 0 ? roles[0][0] : null;

  el.innerHTML = `
    <div class="admin-page">
      <div class="page-header">
        <h1>${icon('user', 28)} Master Profile</h1>
        <p class="text-muted">You are the master of your node. This profile tracks how you use Doogle and reveals the facets of your mastery. It never leaves your machine.</p>
      </div>

      ${topRole ? `
      <div class="profile-dominant-role" style="margin-bottom:24px;padding:16px 20px;border-radius:12px;background:var(--card-bg);border:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="color:${roleColors[topRole]}">${icon(roleIcons[topRole], 32)}</div>
          <div>
            <div style="font-size:1.1em;font-weight:600">Primary Facet: ${topRole} Mastery</div>
            <div class="text-muted" style="font-size:0.88em">${roleDescriptions[topRole]}</div>
          </div>
          <div style="margin-left:auto;font-size:1.5em;font-weight:700;color:${roleColors[topRole]}">${Math.round(roles[0][1] * 100)}%</div>
        </div>
      </div>
      ` : ''}

      <section style="margin-bottom:32px">
        <h2 style="font-size:1.1em;margin-bottom:16px">${icon('trendingUp', 20)} Role Mastery</h2>
        <div class="profile-roles-grid">
          ${roles.map(([name, value]) => `
            <div class="profile-role-card" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;background:var(--card-bg);border:1px solid var(--border)">
              <div style="color:${roleColors[name] || 'var(--text-muted)'}">${icon(roleIcons[name] || 'star', 22)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:0.92em">${name}</div>
                <div style="margin-top:4px;height:6px;border-radius:3px;background:var(--border);overflow:hidden">
                  <div style="height:100%;width:${Math.round(value * 100)}%;background:${roleColors[name] || 'var(--accent)'};border-radius:3px;transition:width 0.3s"></div>
                </div>
              </div>
              <div style="font-weight:700;font-size:0.92em;min-width:36px;text-align:right">${Math.round(value * 100)}%</div>
            </div>
          `).join('')}
        </div>
      </section>

      <div class="profile-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:32px">
        <section style="padding:16px 20px;border-radius:12px;background:var(--card-bg);border:1px solid var(--border)">
          <h3 style="font-size:1em;margin-bottom:12px">${icon('zap', 18)} Stats</h3>
          <div class="profile-stats-list">
            <div class="profile-stat"><span class="text-muted">Reports Filed</span><strong>${profile.reports_made || 0}</strong></div>
            <div class="profile-stat"><span class="text-muted">Interests</span><strong>${interests.length}</strong></div>
            <div class="profile-stat"><span class="text-muted">Search Topics</span><strong>${searchTopics.length}</strong></div>
            <div class="profile-stat"><span class="text-muted">Top Domains</span><strong>${Object.keys(profile.top_domains || {}).length}</strong></div>
          </div>
        </section>

        <section style="padding:16px 20px;border-radius:12px;background:var(--card-bg);border:1px solid var(--border)">
          <h3 style="font-size:1em;margin-bottom:12px">${icon('globe', 18)} Interests</h3>
          ${interests.length > 0 ? `
            <div class="profile-tags">
              ${interests.map(([id]) => `<span class="profile-tag">${id}</span>`).join('')}
            </div>
          ` : '<p class="text-muted" style="font-size:0.88em">No interests recorded yet. Complete the Setup Wizard to set your initial interests.</p>'}
        </section>
      </div>

      ${searchTopics.length > 0 ? `
      <section style="margin-bottom:32px;padding:16px 20px;border-radius:12px;background:var(--card-bg);border:1px solid var(--border)">
        <h3 style="font-size:1em;margin-bottom:12px">${icon('search', 18)} Search Topics</h3>
        <div class="profile-topic-bars">
          ${searchTopics.slice(0, 10).map(([cat, count]) => {
            const max = searchTopics[0][1];
            const pct = max > 0 ? Math.round((count / max) * 100) : 0;
            return `
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                <div style="width:100px;font-size:0.85em;text-align:right;color:var(--text-secondary)">${cat}</div>
                <div style="flex:1;height:8px;border-radius:4px;background:var(--border);overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px"></div>
                </div>
                <div style="min-width:30px;font-size:0.8em;color:var(--text-muted)">${count}</div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
      ` : ''}

      ${topDomains.length > 0 ? `
      <section style="margin-bottom:32px;padding:16px 20px;border-radius:12px;background:var(--card-bg);border:1px solid var(--border)">
        <h3 style="font-size:1em;margin-bottom:12px">${icon('database', 18)} Top Domains</h3>
        <div class="profile-domain-list">
          ${topDomains.map(([domain, count]) => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.88em;border-bottom:1px solid var(--border)">
              <span>${domain}</span>
              <span class="text-muted">${count} docs</span>
            </div>
          `).join('')}
        </div>
      </section>
      ` : ''}
    </div>
  `;
}
