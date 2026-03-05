// Doogle v2 — API client

const BASE = '';

async function fetchJSON(url) {
  const resp = await fetch(BASE + url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function postJSON(url, body) {
  const resp = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ── Peer name cache ──
// Populated from /api/status peer_list. Any page can call
// peerNames.refresh() to update, then peerNames.resolve(id) to display.
const _nameMap = new Map();  // peer_id → node_name
let _localPeerID = '';
let _localNodeName = '';

export const peerNames = {
  /** Update cache from a status object (call after api.status()). */
  update(status) {
    if (!status) return;
    if (status.peer_id) _localPeerID = status.peer_id;
    if (status.node_name) _localNodeName = status.node_name;
    const list = status.peer_list || [];
    for (const p of list) {
      const entry = typeof p === 'string' ? { peer_id: p } : p;
      if (entry.node_name) _nameMap.set(entry.peer_id, entry.node_name);
    }
  },
  /** Fetch status and refresh the cache. */
  async refresh() {
    try { this.update(await fetchJSON('/api/status')); } catch { /* ignore */ }
  },
  /** Resolve a peer ID to a display label: node name → "local" → truncated hash. */
  resolve(id) {
    if (!id) return 'Unknown';
    if (id === _localPeerID) return _localNodeName || 'local';
    return _nameMap.get(id) || id.slice(0, 12) + '…';
  },
  /** Check if the given id is the local node. */
  isLocal(id) { return id && id === _localPeerID; },
  /** Return the local peer ID. */
  localID() { return _localPeerID; },
  /** Return the local node name. */
  localName() { return _localNodeName; },
};

export const api = {
  search(q, page = 1, size = 10) {
    return fetchJSON(`/api/search?q=${encodeURIComponent(q)}&page=${page}&size=${size}`);
  },
  status() {
    return fetchJSON('/api/status');
  },
  addSeed(url) {
    return postJSON('/api/crawl', { url });
  },
  crawlBatch(urls) {
    return postJSON('/api/crawl/batch', { urls });
  },
  crawlerStatus() {
    return fetchJSON('/api/admin/crawler');
  },
  crawlerFeed(afterSeq = 0) {
    return fetchJSON(`/api/admin/crawler/feed?after=${afterSeq}`);
  },
  indexerStats() {
    return fetchJSON('/api/admin/indexer');
  },
  peers() {
    return fetchJSON('/api/admin/peers');
  },
  documents(offset = 0, limit = 20, peer = '') {
    let url = `/api/admin/documents?offset=${offset}&limit=${limit}`;
    if (peer) url += `&peer=${encodeURIComponent(peer)}`;
    return fetchJSON(url);
  },
  document(id) {
    return fetchJSON(`/api/admin/documents/${encodeURIComponent(id)}`);
  },
  setNodeName(name) {
    return postJSON('/api/config/name', { name });
  },
  restore(file) {
    const form = new FormData();
    form.append('archive', file);
    return fetch(BASE + '/api/admin/restore', { method: 'POST', body: form })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  },
  deleteData() {
    return fetch(BASE + '/api/admin/data?confirm=yes', { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  },
  report(url, reason, detail) {
    return postJSON('/api/report', { url, reason, detail });
  },
  trust() {
    return fetchJSON('/api/admin/trust');
  },
  storage() {
    return fetchJSON('/api/admin/storage');
  },
  leaderboard() {
    return fetchJSON('/api/admin/leaderboard');
  },
  domainOwnership() {
    return fetchJSON('/api/admin/domains');
  },
  checkUpdate() {
    return fetchJSON('/api/admin/update-check');
  },
  applyUpdate() {
    return postJSON('/api/admin/update', {});
  },
  profile() {
    return fetchJSON('/api/admin/profile');
  },
  recordInterests(subcategoryIDs) {
    return postJSON('/api/profile/interests', { subcategory_ids: subcategoryIDs });
  },
  trends() {
    return fetchJSON('/api/trends');
  },
  click(query, url, position) {
    return postJSON('/api/click', { query, url, position });
  },
  unquarantine(peerID) {
    return postJSON('/api/admin/trust/unquarantine', { peer_id: peerID });
  },
  dismissReport(reportID) {
    return postJSON('/api/admin/trust/dismiss-report', { report_id: reportID });
  },
  confirmReport(reportID) {
    return postJSON('/api/admin/trust/confirm-report', { report_id: reportID });
  },
  unblockDomain(domain) {
    return postJSON('/api/admin/trust/unblock-domain', { domain });
  },
  auditTrail(limit = 50) {
    return fetchJSON(`/api/admin/trust/audit?limit=${limit}`);
  },
};
