// Doogle v2 — P2P Network with interactive graph visualization
import { api } from '../api.js';
import { navGen } from '../nav-gen.js';
import { NetworkGraph, cardSkeleton, escapeHtml, getCSS, hexToRgba } from '../components.js';

let graph = null;

function peerTier(score, quarantineCount, strikes = 0) {
  // Strike-based tiers take priority (the "bounty board")
  if (strikes >= 15) return 'excommunicado';
  if (strikes >= 8) return 'quarantined';
  if (strikes >= 5) return 'throttled';
  if (strikes >= 3) return 'warning';
  // Fall back to trust score
  if (score >= 0.3) return 'trusted';
  if (score >= 0.2) return 'warning';
  if (score >= 0.1) return 'throttled';
  return 'quarantined';
}

export function renderNetwork(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>P2P Network</h2>
      <p>Peer connections, DHT routing, and network visualization</p>
    </div>
    <div id="network-content">${cardSkeleton(4)}</div>
  `;
  loadNetwork();
  window._pageInterval = setInterval(loadNetwork, 8000);
  window._pageCleanup = () => {
    if (graph) { graph.stop(); graph = null; }
  };
}

async function loadNetwork() {
  const gen = navGen();
  try {
    const [status, peers, trustData] = await Promise.all([
      api.status(),
      api.peers().catch(() => []),
      api.trust().catch(() => ({})),
    ]);
    if (gen !== navGen()) return; // navigated away

    // Build trust lookup: peer_id → reputation
    const trustMap = new Map();
    for (const p of (trustData.all_peers || [])) {
      trustMap.set(p.peer_id, p);
    }

    const peerList = Array.isArray(peers) && peers.length > 0 ? peers : (status.peer_list || []).map(id => ({ peer_id: id, addrs: [] }));

    const content = document.getElementById('network-content');
    if (!content) return;

    content.innerHTML = `
      <div class="card-grid">
        <div class="card">
          <div class="card-label">This Node</div>
          <div class="card-value">${escapeHtml(status.node_name || 'Anonymous Node')}</div>
        </div>
        <div class="card">
          <div class="card-label">Connected Peers</div>
          <div class="card-value">${status.connected_peers}</div>
        </div>
        <div class="card">
          <div class="card-label">Network Health</div>
          <div class="card-value">
            <span class="badge badge-${status.connected_peers >= 3 ? 'green' : status.connected_peers >= 1 ? 'amber' : 'red'}">
              ${status.connected_peers >= 3 ? 'Healthy' : status.connected_peers >= 1 ? 'Degraded' : 'Isolated'}
            </span>
          </div>
        </div>
        <div class="card">
          <div class="card-label">Shared Docs</div>
          <div class="card-value">${status.indexed_docs.toLocaleString()}</div>
        </div>
      </div>

      <div class="section">
        <h3>Network Topology</h3>
        <div class="graph-container" style="position:relative">
          <canvas id="network-graph"></canvas>
          <div class="graph-controls">
            <button id="graph-reset">Reset</button>
          </div>
          <div class="graph-legend">
            <span><span class="dot" style="background:var(--accent)"></span> This node</span>
            <span><span class="dot" style="background:var(--green)"></span> Trusted</span>
            <span><span class="dot" style="background:var(--amber)"></span> Warning</span>
            <span><span class="dot" style="background:var(--red)"></span> Quarantined</span>
            <span><span class="dot" style="background:var(--purple)"></span> Excommunicado</span>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>P2P Protocols</h3>
        <div class="card-grid">
          <div class="card card-sm">
            <div class="card-label"><span class="badge badge-accent">/doogle/search/1.0.0</span></div>
            <div class="card-sub" style="margin-top:4px">Distributed query fan-out. Search queries are sent to peers and results are merged and re-ranked locally.</div>
          </div>
          <div class="card card-sm">
            <div class="card-label"><span class="badge badge-blue">/doogle/crawl/1.0.0</span></div>
            <div class="card-sub" style="margin-top:4px">Crawl task delegation. Nodes can offload URLs to the appropriate shard owner based on consistent hashing.</div>
          </div>
          <div class="card card-sm">
            <div class="card-label"><span class="badge badge-purple">/doogle/index/1.0.0</span></div>
            <div class="card-sub" style="margin-top:4px">Document forwarding. Crawled documents are sent to the shard owner for indexing in their local Bleve store.</div>
          </div>
          <div class="card card-sm">
            <div class="card-label"><span class="badge badge-green">GossipSub: doogle/url-frontier</span></div>
            <div class="card-sub" style="margin-top:4px">Pub/sub broadcast of discovered URLs. All nodes hear about new URLs and claim those in their hash range.</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Peer Discovery</h3>
        <div class="card-grid">
          <div class="card card-sm">
            <div class="card-label"><span class="badge badge-blue">IPFS DHT Discovery</span> Automatic</div>
            <div class="card-sub" style="margin-top:4px">Connects to the IPFS public DHT and advertises under <code>doogle/network/v2</code>. Finds other Doogle nodes anywhere on the internet within 30–60 seconds. Zero configuration needed.</div>
          </div>
          <div class="card card-sm">
            <div class="card-label"><span class="badge badge-green">mDNS</span> Local Network</div>
            <div class="card-sub" style="margin-top:4px">Automatically finds peers on the same LAN. Service name: <code>doogle-p2p</code>. Zero configuration needed.</div>
          </div>
          <div class="card card-sm">
            <div class="card-label"><span class="badge badge-blue">Kademlia DHT</span> Peer Routing</div>
            <div class="card-sub" style="margin-top:4px">Distributed hash table for peer routing across the internet. Used for both routing and IPFS-based auto-discovery.</div>
          </div>
          <div class="card card-sm">
            <div class="card-label"><span class="badge badge-green">NAT Traversal</span> Automatic</div>
            <div class="card-sub" style="margin-top:4px">UPnP/NAT-PMP port mapping and hole punching allow peers behind home routers to accept inbound connections without manual port-forwarding.</div>
          </div>
          <div class="card card-sm">
            <div class="card-label"><span class="badge badge-amber">VPN / Proxy</span> Limited</div>
            <div class="card-sub" style="margin-top:4px">Behind a VPN, mDNS and NAT mapping are bypassed, but DHT discovery and outbound connections still work. Your node becomes unreachable for inbound P2P. See <a href="#/docs" style="color:var(--accent)">Docs → Troubleshooting</a> for details.</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Connected Peers (${peerList.length})</h3>
        ${peerList.length === 0
          ? '<div class="empty-state"><p>No peers connected yet. DHT discovery is searching for other Doogle nodes — peers usually appear within 30–60 seconds. You can also use <code>--bootstrap /ip4/HOST/tcp/PORT/p2p/PEER_ID</code> for manual connection.</p></div>'
          : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Peer ID</th>
                    <th>Trust</th>
                    <th>Addresses</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${peerList.map(p => {
                    const id = typeof p === 'string' ? p : p.peer_id;
                    const addrs = typeof p === 'string' ? [] : (p.addrs || []);
                    const name = typeof p === 'string' ? '' : (p.node_name || '');
                    const rep = trustMap.get(id);
                    const trustScore = rep ? rep.trust_score : null;
                    const qCount = rep ? (rep.quarantine_count || 0) : 0;
                    const tier = trustScore !== null ? peerTier(trustScore, qCount, rep.strikes || 0) : 'new';
                    const tierColors = { trusted: 'green', warning: 'amber', throttled: 'amber', quarantined: 'red', excommunicado: 'purple', new: 'default' };
                    return `
                      <tr>
                        <td>${escapeHtml(name || 'Anonymous Node')}</td>
                        <td class="mono" style="font-size:0.8em">${escapeHtml(id).slice(0, 24)}...</td>
                        <td>
                          ${trustScore !== null
                            ? `<span class="badge badge-${tierColors[tier]}">${tier}</span> <span style="font-size:0.8em;color:var(--text-muted)">${trustScore.toFixed(2)}</span>`
                            : '<span class="badge badge-default">new</span>'}
                        </td>
                        <td class="mono" style="font-size:0.75em;color:var(--text-muted)">${addrs.length > 0 ? addrs.map(a => escapeHtml(a)).join('<br>') : '—'}</td>
                        <td><span class="badge badge-green">connected</span></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `
        }
      </div>

      <div class="section">
        <h3>Listen Addresses</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Multiaddr</th></tr></thead>
            <tbody>
              ${(status.addrs || []).map(a => `<tr><td class="mono" style="font-size:0.85em">${escapeHtml(a)}</td></tr>`).join('')
                || '<tr><td>No addresses</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Build and render network graph
    buildGraph(status, peerList, trustMap);

    document.getElementById('graph-reset')?.addEventListener('click', () => {
      if (graph) { graph.stop(); graph = null; }
      buildGraph(status, peerList, trustMap);
    });

  } catch (err) {
    const content = document.getElementById('network-content');
    if (content) {
      content.innerHTML = `<div class="empty-state"><p>Failed to load network data: ${err.message}</p></div>`;
    }
  }
}

const TIER_COLORS = () => ({
  trusted:        getCSS('--green'),
  warning:        getCSS('--amber') || '#f59e0b',
  throttled:      getCSS('--amber') || '#f59e0b',
  quarantined:    getCSS('--red') || '#ef4444',
  excommunicado:  getCSS('--purple') || '#a855f7',
});

function buildGraph(status, peerList, trustMap) {
  // Stop previous graph
  if (graph) graph.stop();

  graph = new NetworkGraph('network-graph', { height: 350 });

  const nodes = [];
  const edges = [];
  const connectedIds = new Set();
  const colors = TIER_COLORS();

  // This node (center, larger)
  nodes.push({
    id: status.peer_id,
    label: status.node_name || 'Anonymous Node',
    tooltip: (status.node_name ? status.node_name + ' — ' : '') + status.peer_id.slice(0, 24) + '...',
    type: 'self',
    color: getCSS('--accent'),
    radius: 20,
  });

  // Connected peers (colored by trust tier)
  peerList.forEach(p => {
    const id = typeof p === 'string' ? p : p.peer_id;
    connectedIds.add(id);
    const peerName = (typeof p !== 'string' && p.node_name) ? p.node_name : 'Anonymous Node';
    const rep = trustMap?.get(id);
    const tier = rep ? peerTier(rep.trust_score || 0, rep.quarantine_count || 0, rep.strikes || 0) : 'trusted';
    const edgeColor = tier === 'quarantined' ? hexToRgba(colors.quarantined, 0.4)
                    : tier === 'excommunicado'      ? hexToRgba(colors.banned, 0.25)
                    : tier === 'warning'     ? hexToRgba(colors.warning, 0.4)
                    : hexToRgba(getCSS('--green'), 0.4);
    nodes.push({
      id,
      label: peerName,
      tooltip: peerName + ' — ' + id.slice(0, 20) + '... [' + tier + ']',
      type: tier === 'quarantined' ? 'quarantined' : tier === 'excommunicado' ? 'banned' : 'peer',
      color: colors[tier] || colors.trusted,
      radius: tier === 'excommunicado' ? 10 : 14,
    });
    edges.push({
      from: status.peer_id,
      to: id,
      color: edgeColor,
      width: (tier === 'quarantined' || tier === 'excommunicado') ? 1 : 2,
      dashed: tier === 'quarantined' || tier === 'excommunicado',
    });
  });

  // Add quarantined/banned peers from trust data that aren't currently connected
  for (const [peerId, rep] of trustMap) {
    if (connectedIds.has(peerId) || peerId === status.peer_id) continue;
    const tier = peerTier(rep.trust_score || 0, rep.quarantine_count || 0, rep.strikes || 0);
    if (tier !== 'quarantined' && tier !== 'banned') continue;

    nodes.push({
      id: peerId,
      label: 'Anonymous Node',
      tooltip: peerId.slice(0, 20) + '... [' + tier + ' — disconnected]',
      type: tier,
      color: colors[tier],
      radius: tier === 'excommunicado' ? 8 : 11,
    });
    edges.push({
      from: status.peer_id,
      to: peerId,
      color: hexToRgba(colors[tier], 0.15),
      width: 1,
      dashed: true,
    });
  }

  // If no peers at all, add ghost nodes for visual appeal
  if (peerList.length === 0 && trustMap.size === 0) {
    for (let i = 0; i < 3; i++) {
      const id = `ghost-${i}`;
      nodes.push({
        id,
        label: '?',
        tooltip: 'Undiscovered peer',
        type: 'ghost',
        color: getCSS('--border'),
        radius: 10,
      });
      edges.push({
        from: status.peer_id,
        to: id,
        color: hexToRgba(getCSS('--border'), 0.2),
        width: 1,
        dashed: true,
      });
    }
  }

  graph.setData(nodes, edges);
}


