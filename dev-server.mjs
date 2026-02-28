#!/usr/bin/env node
/**
 * Doogle v2 — Development server with hot reload.
 *
 * Features:
 *   - Serves static files from web/static/ with live reload
 *   - Proxies /api/* requests to the Go backend (Docker or native)
 *   - Watches for file changes and injects reload script
 *
 * Usage:
 *   node dev-server.mjs                    # frontend only (API calls will 502)
 *   node dev-server.mjs --api http://localhost:8080  # proxy API to running backend
 *
 * Or via Makefile:
 *   make dev-fe                            # frontend only
 *   make dev                               # full stack (Docker backend + frontend hot reload)
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
};

function getMime(filePath) {
  return MIME[path.extname(filePath)] || 'application/octet-stream';
}

// Inject live-reload script into HTML responses
const RELOAD_SNIPPET = `
<script>
(function(){
  const es = new EventSource('/__reload');
  es.onmessage = () => location.reload();
  es.onerror = () => setTimeout(() => location.reload(), 1000);
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
  let filePath = path.join(STATIC_DIR, req.url === '/' ? 'index.html' : req.url);

  // SPA fallback: if file doesn't exist, serve index.html
  if (!fs.existsSync(filePath)) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  try {
    let content = fs.readFileSync(filePath);
    const mime = getMime(filePath);

    if (mime === 'text/html') {
      content = injectReload(content.toString());
    }

    res.writeHead(200, { 'Content-Type': mime });
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
  res.write('data: connected\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

function notifyReload() {
  for (const client of clients) {
    client.write('data: reload\n\n');
  }
}

// File watcher
let debounceTimer = null;
function watchFiles(dir) {
  watch(dir, { recursive: true }, (event, filename) => {
    if (!filename) return;
    // Skip hidden files and node_modules
    if (filename.startsWith('.') || filename.includes('node_modules')) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`  \x1b[33m[reload]\x1b[0m ${filename} changed`);
      notifyReload();
    }, 100);
  });
}

// Server
const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // SSE for live reload
  if (req.url === '/__reload') {
    handleReloadSSE(req, res);
    return;
  }

  // Proxy API requests
  if (req.url.startsWith('/api/')) {
    proxyRequest(req, res);
    return;
  }

  // Serve static files
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  \x1b[36m╔══════════════════════════════════════════╗\x1b[0m');
  console.log('  \x1b[36m║\x1b[0m  \x1b[1mDoogle v2 — Dev Server\x1b[0m                  \x1b[36m║\x1b[0m');
  console.log('  \x1b[36m╠══════════════════════════════════════════╣\x1b[0m');
  console.log(`  \x1b[36m║\x1b[0m  Frontend:  \x1b[32mhttp://localhost:${PORT}\x1b[0m        \x1b[36m║\x1b[0m`);
  console.log(`  \x1b[36m║\x1b[0m  API proxy: \x1b[33m${API_TARGET}\x1b[0m  \x1b[36m║\x1b[0m`);
  console.log('  \x1b[36m║\x1b[0m  Hot reload: \x1b[32menabled\x1b[0m                     \x1b[36m║\x1b[0m');
  console.log('  \x1b[36m╚══════════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log('  Watching web/static/ for changes...');
  console.log('');
});

watchFiles(STATIC_DIR);
