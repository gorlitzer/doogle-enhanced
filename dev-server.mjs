#!/usr/bin/env node
/**
 * Doogle v2 — Development server with hot reload.
 *
 * Features:
 *   - Serves static files from web/static/ with live reload
 *   - Proxies /api/* requests to the Go backend (Docker or native)
 *   - Watches for file changes and triggers browser reload via SSE
 *
 * Usage:
 *   node dev-server.mjs                                # frontend only (API calls will 502)
 *   node dev-server.mjs --api http://localhost:8080     # proxy API to running backend
 *
 * Or via Makefile:
 *   make dev-fe       # frontend only
 *   make dev          # full stack (Docker backend + frontend hot reload)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { watch } from 'node:fs';

const PORT = parseInt(process.env.PORT || '3000');
const STATIC_DIR = path.resolve(import.meta.dirname, 'web', 'static');
const API_TARGET = process.argv.find(a => a.startsWith('--api='))?.split('=')[1]
  || process.argv[process.argv.indexOf('--api') + 1]
  || 'http://localhost:8080';

// SSE clients for live reload
const clients = new Set();

// MIME types
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getMime(filePath) {
  return MIME[path.extname(filePath)] || 'application/octet-stream';
}

// Inject live-reload script into HTML responses.
// Uses a reconnecting EventSource — only reloads when the server
// explicitly sends a "reload" event, never on connection error.
const RELOAD_SNIPPET = `
<script>
(function(){
  var es;
  function connect() {
    es = new EventSource('/__reload');
    es.addEventListener('reload', function() {
      location.reload();
    });
    es.onerror = function() {
      es.close();
      setTimeout(connect, 2000);
    };
  }
  connect();
})();
</script>
`;

function injectReload(html) {
  if (html.includes('</body>')) {
    return html.replace('</body>', RELOAD_SNIPPET + '</body>');
  }
  return html + RELOAD_SNIPPET;
}

// Proxy API requests to the backend
async function proxyRequest(req, res) {
  const url = new URL(req.url, API_TARGET);
  try {
    const proxyRes = await fetch(url.toString(), {
      method: req.method,
      headers: { ...req.headers, host: url.host },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req : undefined,
      duplex: 'half',
    });
    res.writeHead(proxyRes.status, {
      'Content-Type': proxyRes.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    const body = await proxyRes.text();
    res.end(body);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Backend unavailable: ${err.message}` }));
  }
}

// Serve static files
function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0]; // strip query params
  let filePath = path.join(STATIC_DIR, urlPath === '/' ? 'index.html' : urlPath);

  // SPA fallback: if file doesn't exist, serve index.html
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  try {
    let content = fs.readFileSync(filePath);
    const mime = getMime(filePath);

    if (mime === 'text/html') {
      content = injectReload(content.toString());
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

// SSE endpoint for live reload
function handleReloadSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(':ok\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

function notifyReload() {
  for (const client of clients) {
    client.write('event: reload\ndata: reload\n\n');
  }
}

// File watcher
let debounceTimer = null;
function watchFiles(dir) {
  watch(dir, { recursive: true }, (event, filename) => {
    if (!filename) return;
    if (filename.startsWith('.') || filename.includes('node_modules')) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`  \x1b[33m[reload]\x1b[0m ${filename}`);
      notifyReload();
    }, 150);
  });
}

// Server
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.url === '/__reload') {
    handleReloadSSE(req, res);
    return;
  }

  if (req.url.startsWith('/api/')) {
    proxyRequest(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`
  Doogle v2 — Dev Server
  ──────────────────────────
  Frontend:    http://localhost:${PORT}
  API proxy:   ${API_TARGET}
  Hot reload:  enabled
  Static dir:  ${STATIC_DIR}
  ──────────────────────────
  Watching for changes...
`);
});

watchFiles(STATIC_DIR);
