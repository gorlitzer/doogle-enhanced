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
};
