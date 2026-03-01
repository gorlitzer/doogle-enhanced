// Doogle v2 — About Page: Interactive, visual, simple explanations
import { api } from '../api.js';
import { icon, getCSS, hexToRgba, showModal } from '../components.js';

// ---- Data ----
const pipelineSteps = [
  {
    icon: 'globe', title: 'Seed URL', color: 'var(--accent)',
    eli5: 'You give Doogle a website address, like telling a puppy "go fetch!"',
    detail: 'A URL is added to the frontier via seed, peer gossip, or discovery. The scheduler deduplicates and prioritizes by domain.',
    modal: `<p>URLs enter the system from three sources:</p>
      <ul>
        <li><strong>Seed URLs</strong> — manually provided via CLI flag or API</li>
        <li><strong>Peer Gossip</strong> — discovered URLs broadcast via <a href="https://docs.libp2p.io/concepts/pubsub/overview/" target="_blank">GossipSub</a></li>
        <li><strong>Link Discovery</strong> — extracted from crawled pages</li>
      </ul>
      <p>The frontier scheduler uses persistent URL deduplication (SHA-256 keyed, backed by <a href="https://dgraph.io/badger" target="_blank">BadgerDB</a>) to avoid re-crawling. URLs are prioritized by domain freshness and crawl depth.</p>`,
  },
  {
    icon: 'download', title: 'Crawl', color: 'var(--blue)',
    eli5: 'Doogle visits the webpage and reads everything on it, like reading a book.',
    detail: 'Workers fetch pages via HTTP (or headless Chromium for JS-heavy SPAs). Respects robots.txt and per-domain rate limits.',
    modal: `<p>The crawler runs a configurable goroutine worker pool (default: 4 workers). Each worker:</p>
      <ul>
        <li>Checks <code>robots.txt</code> compliance before fetching</li>
        <li>Respects per-domain rate limits (default: 10 req/min/domain)</li>
        <li>Follows redirects up to 5 hops</li>
        <li>Falls back to headless Chromium (via <a href="https://github.com/go-rod/rod" target="_blank">go-rod</a>) for JS-heavy SPAs</li>
      </ul>
      <p>Extracted content is passed to the NLP enrichment pipeline before indexing.</p>`,
  },
  {
    icon: 'cpu', title: 'Understand', color: 'var(--purple)',
    eli5: 'Doogle figures out what the page is about — is it about cats? Coding? Pizza recipes?',
    detail: 'NLP pipeline: language detection, keyword extraction, readability scoring, category classification, and content enrichment.',
    modal: `<p>The NLP enrichment pipeline analyzes every crawled document:</p>
      <ul>
        <li><strong>Language Detection</strong> — identifies 14+ languages</li>
        <li><strong>Keyword Extraction</strong> — TF-IDF based term importance</li>
        <li><strong>Readability Scoring</strong> — Flesch-Kincaid readability grade</li>
        <li><strong>Category Classification</strong> — assigns topic categories</li>
        <li><strong>Content Dedup</strong> — 4-gram shingling + Jaccard similarity (&gt;80% = duplicate)</li>
      </ul>`,
  },
  {
    icon: 'star', title: 'Score', color: 'var(--amber)',
    eli5: 'Doogle gives the page a report card — is it well-written? Trustworthy? Useful?',
    detail: 'E-E-A-T scoring evaluates expertise, authority, trustworthiness, link structure, freshness, and 10+ quality signals.',
    modal: `<p>Quality scoring combines 10+ signals into a weighted score:</p>
      <ul>
        <li><strong>E-E-A-T</strong> (20%) — expertise, experience, authority, trust</li>
        <li><strong>Quality</strong> (20%) — content depth, heading structure, media richness</li>
        <li><strong>PageRank</strong> (20%) — graph-based link authority (<a href="https://en.wikipedia.org/wiki/PageRank" target="_blank">Wikipedia</a>)</li>
        <li><strong>Readability</strong> (8%) — Flesch-Kincaid score</li>
        <li><strong>Citation</strong> (8%) — references to/from other sources</li>
        <li><strong>SEO</strong> (8%) — meta tags, heading structure</li>
      </ul>
      <p>These signals are combined into a <strong>StaticScore</strong> at index time: <code>(0.5 + weightedSignals * 2.0) * (1.0 - spamScore * 0.8)</code></p>`,
  },
  {
    icon: 'shield', title: 'Filter Spam', color: 'var(--red)',
    eli5: 'Doogle throws away the junk — pages that are fake or trying to trick you.',
    detail: 'Keyword stuffing, cloaking patterns, and low-quality signals are detected. Spam score > 0.7 = rejected before indexing.',
    modal: `<p>The spam filter catches manipulative content:</p>
      <ul>
        <li><strong>Keyword Stuffing</strong> — abnormal term frequency patterns</li>
        <li><strong>Cloaking</strong> — different content for bots vs. users</li>
        <li><strong>Thin Content</strong> — pages with very little substance</li>
        <li><strong>Link Farms</strong> — excessive low-quality outbound links</li>
      </ul>
      <p>Pages with spam score &gt; 0.7 are rejected entirely. Below that threshold, the spam score is baked into the <strong>StaticScore</strong> as a penalty factor: <code>(1.0 - spamScore * 0.8)</code>.</p>`,
  },
  {
    icon: 'database', title: 'Index', color: 'var(--green)',
    eli5: 'Doogle puts the good pages in a giant filing cabinet so it can find them fast later.',
    detail: 'Batch-indexed into Bleve (100 docs/flush) with pre-computed StaticScore. BM25 weighting: title x3, desc x1.5, content x1, anchor x2.',
    modal: `<p>Documents are buffered and flushed to <a href="https://blevesearch.com/" target="_blank">Bleve</a> in batches of 100 (or every 5 seconds). Batch writes are 10-50x faster than single-doc indexing.</p>
      <p>Each document stores a pre-computed <strong>StaticScore</strong> so search only needs: <code>BM25 * StaticScore * freshnessDecay</code> — no per-query recomputation of quality signals.</p>
      <p>Field boosts: title (3x), description (1.5x), content (1x), anchor text (2x). All stored in <a href="https://dgraph.io/badger" target="_blank">BadgerDB</a>.</p>`,
  },
  {
    icon: 'search', title: 'Search', color: 'var(--accent)',
    eli5: 'You ask a question, and Doogle looks through its filing cabinet super fast to find the best answers.',
    detail: 'Queries are parsed (phrases, synonyms, fuzzy matching), matched against Bleve, then ranked by BM25 x StaticScore x freshness.',
    modal: `<p>The search pipeline parses your query into structured components:</p>
      <ul>
        <li><strong>Phrases</strong> — <code>"exact match"</code> terms</li>
        <li><strong>Site filter</strong> — <code>site:example.com</code></li>
        <li><strong>Synonym expansion</strong> — "js" also searches "javascript"</li>
        <li><strong>Fuzzy matching</strong> — typo tolerance for short queries</li>
      </ul>
      <p>Results are ranked: <code>final = BM25 * StaticScore * freshnessDecay</code></p>
      <p>BM25 is the text relevance engine inside <a href="https://blevesearch.com/" target="_blank">Bleve</a>. StaticScore is pre-computed at index time. Freshness decay uses exponential decay with configurable half-lives.</p>`,
  },
  {
    icon: 'radio', title: 'Share', color: 'var(--purple)',
    eli5: 'Doogle asks its friends (other computers) if they found anything good too, and combines all the answers.',
    detail: 'Queries route to shard owners via consistent hashing. Results are merged, deduplicated, and re-ranked. Documents replicated to 3 nodes.',
    modal: `<p>Queries are routed intelligently using shard-aware routing:</p>
      <ul>
        <li><strong>site: queries</strong> — only the shard owner(s) are contacted</li>
        <li><strong>General queries</strong> — a CoveringSet of peers that covers all shards (O(sqrt(N)) instead of O(N) fan-out)</li>
      </ul>
      <p>Results from multiple peers are merged, deduplicated by URL, and re-ranked.</p>
      <p>Every document is replicated to 3 nodes (configurable). Merkle root anti-entropy ensures consistency across replicas. Built on <a href="https://docs.libp2p.io/" target="_blank">libp2p</a> stream protocols.</p>`,
  },
];

const capabilities = [
  { icon: 'download', title: 'Distributed Crawling', desc: 'Multi-worker crawl engine with per-domain rate limiting, robots.txt respect, and configurable depth.',
    modal: `<p>The crawler uses a goroutine worker pool (default 4) with per-domain rate limiting. Each domain gets its own crawl queue with configurable max depth. Respects robots.txt exclusion rules and supports custom User-Agent strings.</p><p>Reference: Go's <code>net/http</code> + <a href="https://github.com/PuerkitoBio/goquery" target="_blank">goquery</a> for HTML parsing.</p>` },
  { icon: 'search', title: 'Full-Text Search (BM25)', desc: 'Bleve-powered full-text search with field boosting, phrase matching, synonym expansion, and fuzzy queries.',
    modal: `<p><a href="https://blevesearch.com/" target="_blank">Bleve</a> provides BM25-based full-text search. Queries support phrase matching, synonym expansion (20+ mappings), fuzzy matching for typo tolerance, and site: filters. Field boosts: title (3x), description (1.5x), content (1x), anchor text (2x).</p><p>Reference: <a href="https://en.wikipedia.org/wiki/Okapi_BM25" target="_blank">BM25 algorithm (Wikipedia)</a></p>` },
  { icon: 'star', title: 'Quality Scoring (E-E-A-T)', desc: '10+ scoring signals including expertise, authority, trustworthiness, readability, freshness, and citation analysis.',
    modal: `<p>E-E-A-T scoring evaluates pages across 10+ dimensions, mirroring Google's quality rater guidelines. Signals include expertise, authority, trustworthiness, content depth, heading structure, media richness, citation count, and readability (Flesch-Kincaid).</p>` },
  { icon: 'cpu', title: 'NLP Analysis Pipeline', desc: 'Language detection, keyword extraction, category classification, and readability scoring for every crawled document.',
    modal: `<p>Every crawled document passes through language detection (14+ languages), TF-IDF keyword extraction, category classification, and Flesch-Kincaid readability scoring. Results feed into the quality scoring pipeline.</p>` },
  { icon: 'shield', title: 'Spam Detection', desc: 'Keyword stuffing detection, cloaking analysis, and quality threshold filtering to keep the index clean.',
    modal: `<p>Spam detection catches keyword stuffing, cloaking patterns, thin content, and link farms. Documents with spam score &gt; 0.7 are rejected before indexing. Below that threshold, spam scores are baked into the StaticScore penalty.</p>` },
  { icon: 'monitor', title: 'Headless JS Rendering', desc: 'go-rod powered headless Chromium fallback for React, Next.js, Angular, and Vue single-page applications.',
    modal: `<p>When a page has 3+ <code>&lt;script&gt;</code> tags, the crawler falls back to headless Chromium via <a href="https://github.com/go-rod/rod" target="_blank">go-rod</a>. This renders React, Vue, Angular, and Next.js SPAs that would otherwise return empty HTML. Chromium is downloaded automatically on first use (~300MB).</p>` },
  { icon: 'network', title: 'P2P Network (Kademlia)', desc: 'libp2p-based peer discovery via Kademlia DHT and mDNS. No central server — every node is equal.',
    modal: `<p>Peer discovery uses <a href="https://docs.libp2p.io/concepts/discovery-routing/kaddht/" target="_blank">Kademlia DHT</a> for internet-wide routing and mDNS for local network discovery. Every node is a full peer — no central coordinators. Built on <a href="https://docs.libp2p.io/" target="_blank">libp2p</a>.</p>` },
  { icon: 'megaphone', title: 'GossipSub Frontier', desc: 'Discovered URLs are broadcast to peers via pub/sub, creating a shared crawl frontier across the network.',
    modal: `<p>Newly discovered URLs are broadcast to all connected peers via <a href="https://docs.libp2p.io/concepts/pubsub/overview/" target="_blank">GossipSub</a> pub/sub. Nodes check if a URL falls in their shard range before scheduling a crawl, preventing duplicate work.</p>` },
  { icon: 'trendingUp', title: 'PageRank Authority', desc: 'Graph-based link analysis computes authority scores. Cross-domain links get 1.5x weight. Updated every 5 minutes.',
    modal: `<p>PageRank computes page authority from the link graph using iterative power method (damping factor = 0.85, 15 iterations). Cross-domain links receive 1.5x weight. Recomputed every 5 minutes. Reference: <a href="https://en.wikipedia.org/wiki/PageRank" target="_blank">PageRank (Wikipedia)</a></p>` },
  { icon: 'link', title: 'Anchor Text Signals', desc: 'Inbound anchor text is aggregated and indexed, boosting pages for terms used to link to them.',
    modal: `<p>When page A links to page B with anchor text "golang tutorial", that text is stored and indexed for page B. This means pages rank for terms other sites use to describe them — a powerful relevance signal. Anchor text gets 2x boost in BM25 scoring.</p>` },
  { icon: 'zap', title: 'Batch Indexing (10-50x throughput)', desc: 'Documents are buffered and flushed to Bleve in configurable batches. Default: 100 docs or every 5 seconds.',
    modal: `<p>Instead of indexing documents one-at-a-time, the batch indexer buffers them and flushes in batches of 100 (or every 5 seconds). This leverages <a href="https://blevesearch.com/" target="_blank">Bleve's batch API</a> for 10-50x faster write throughput.</p><p>Configurable via <code>--batch-size</code> and <code>--batch-flush-interval</code> flags.</p>` },
  { icon: 'shield', title: 'Persistent URL Dedup', desc: 'SHA-256 keyed deduplication backed by BadgerDB. Survives node restarts — no re-crawling the entire frontier.',
    modal: `<p>URL deduplication is backed by <a href="https://dgraph.io/badger" target="_blank">BadgerDB</a> with SHA-256 keys. Unlike in-memory sets, this persists across node restarts — the crawl frontier survives reboots without re-crawling everything.</p>` },
  { icon: 'cpu', title: 'Incremental Reindexing', desc: 'Background re-scorer updates stale documents every 10 minutes. Freshness decay, PageRank changes, and score drift handled automatically.',
    modal: `<p>A background process runs every 10 minutes (configurable via <code>--incremental-interval</code>) to re-score stale documents. It uses generation tracking to only touch documents whose scores have drifted — freshness decay updates, PageRank changes, and quality signal updates are applied without re-crawling.</p>` },
  { icon: 'radio', title: 'Shard-Aware Routing', desc: 'Queries route to shard owners via consistent hashing (64 virtual nodes per peer). CoveringSet reduces fan-out from O(N) to O(sqrt(N)).',
    modal: `<p>Documents are assigned to shard owners via consistent hashing (64 virtual nodes per peer) based on domain. Queries are routed intelligently:</p>
      <ul>
        <li><strong>site: queries</strong> — only contact the shard owner</li>
        <li><strong>General queries</strong> — compute a CoveringSet of peers covering all shards</li>
      </ul>
      <p>This reduces per-query fan-out from O(N) to O(sqrt(N)). Reference: <a href="https://en.wikipedia.org/wiki/Consistent_hashing" target="_blank">Consistent Hashing (Wikipedia)</a></p>` },
  { icon: 'database', title: 'Document Replication (N=3)', desc: 'Every document is replicated to 3 nodes. Merkle root anti-entropy ensures consistency. Network survives node failures.',
    modal: `<p>Every document is replicated to N nodes (default 3) using consistent hashing. When a peer joins or leaves, the replication protocol automatically rebalances.</p><p>Consistency is maintained via Merkle root anti-entropy: every 2 minutes, nodes compare Merkle roots per domain and sync missing documents. Protocols: <code>/doogle/replicate/1.0.0</code> (push) and <code>/doogle/antientropy/1.0.0</code> (reconciliation).</p>` },
];

const capabilityModalData = capabilities.map(c => ({ title: c.title, html: c.modal }));

const techStack = [
  { name: 'Go', color: 'var(--accent)' },
  { name: 'libp2p', color: 'var(--blue)' },
  { name: 'Bleve', color: 'var(--green)' },
  { name: 'BadgerDB', color: 'var(--amber)' },
  { name: 'GossipSub', color: 'var(--purple)' },
  { name: 'Kademlia', color: 'var(--red)' },
  { name: 'goquery', color: 'var(--accent)' },
  { name: 'go-rod', color: 'var(--green)' },
  { name: 'chi', color: 'var(--blue)' },
];

const limitations = [
  { title: 'Single-node storage limits', desc: 'Index size is bounded by local disk. Sharding distributes load but each node stores its own shard.', badge: 'by design' },
  { title: 'No PDF/doc extraction', desc: 'Binary document formats like PDF, DOCX, and PPTX are not yet parsed or indexed.', badge: 'planned' },
  { title: 'No login-gated content', desc: 'Pages behind authentication walls cannot be crawled. Only publicly accessible content is indexed.', badge: 'by design' },
  { title: 'Rate-limited by politeness', desc: 'Strict per-domain rate limiting and robots.txt compliance means some sites crawl slowly. This is intentional.', badge: 'by design' },
];

// ---- Main Render ----
export function renderAbout(container) {
  container.innerHTML = `
    <div class="about-page">
      <section class="about-hero">
        <div class="about-hero-bg"></div>
        <h1 class="about-title">DOOGLE</h1>
        <div class="about-tagline-wrap">
          <p class="about-tagline"></p>
          <span class="about-cursor">|</span>
        </div>
        <p class="about-subtitle">Open source. Zero tracking. Every node is a search engine.</p>
        <button class="btn btn-primary about-explore-btn" onclick="document.getElementById('about-pipeline').scrollIntoView({behavior:'smooth'})">
          Explore How It Works
        </button>
      </section>

      <section class="about-stats-bar about-reveal">
        <div class="about-stat-item">
          <span class="about-stat-value" id="about-stat-docs">--</span>
          <span class="about-stat-label">Indexed Docs</span>
        </div>
        <div class="about-stat-item">
          <span class="about-stat-value" id="about-stat-crawled">--</span>
          <span class="about-stat-label">Crawled URLs</span>
        </div>
        <div class="about-stat-item">
          <span class="about-stat-value" id="about-stat-peers">--</span>
          <span class="about-stat-label">Connected Peers</span>
        </div>
        <div class="about-stat-item">
          <span class="about-stat-value" id="about-stat-uptime">--</span>
          <span class="about-stat-label">Uptime</span>
        </div>
      </section>

      <!-- Pipeline: How It Works -->
      <section class="about-section about-reveal" id="about-pipeline">
        <h2 class="about-section-title">How It Works</h2>
        <p class="about-section-desc">From a website address to a search result — explained simply. Click any step for a deep dive.</p>
        <div class="about-pipeline">
          ${pipelineSteps.map((step, i) => `
            <div class="about-pipeline-step" data-step="${i}">
              <div class="about-pipeline-icon" style="color:${step.color}">${icon(step.icon, 28)}</div>
              <div class="about-pipeline-label">${step.title}</div>
            </div>
            ${i < pipelineSteps.length - 1 ? `<div class="about-pipeline-arrow">${icon('arrowRight', 16, 'var(--text-muted)')}</div>` : ''}
          `).join('')}
        </div>
        <div class="about-pipeline-detail" id="pipeline-detail">
          <p class="about-eli5-hint">Click a step above to learn more</p>
        </div>
      </section>

      <!-- Interactive PageRank Demo -->
      <section class="about-section about-reveal" id="about-pagerank">
        <h2 class="about-section-title">PageRank: The Popularity Contest</h2>
        <p class="about-section-desc">Pages that lots of other pages link to are probably more important — just like the popular kid at school.</p>
        <div class="about-interactive-demo">
          <canvas id="pagerank-demo" width="600" height="360"></canvas>
          <div class="about-demo-controls">
            <button class="btn btn-primary" id="pr-add-link">Add a Link</button>
            <button class="btn" id="pr-reset">Reset</button>
          </div>
          <p class="about-demo-caption">Click "Add a Link" to see how linking to a page increases its score. The bigger the circle, the higher the PageRank.</p>
        </div>
      </section>

      <!-- Search Pipeline Demo -->
      <section class="about-section about-reveal" id="about-search-demo">
        <h2 class="about-section-title">Smart Search: Understanding You</h2>
        <p class="about-section-desc">Doogle doesn't just match words — it understands what you mean.</p>
        <div class="about-search-demo-wrap">
          <div class="about-search-demo-input">
            <input type="text" id="demo-query" placeholder='Try: "js tutorial" or site:go.dev golang' value="js tutorial">
            <button class="btn btn-primary" id="demo-parse-btn">Parse</button>
          </div>
          <div class="about-search-demo-result" id="demo-parse-result"></div>
        </div>
        <div class="about-search-features">
          <div class="about-search-feature">
            <div class="about-sf-icon" style="color:var(--accent)">${icon('search', 20)}</div>
            <div>
              <strong>Synonym Expansion</strong>
              <p>"js" also searches for "javascript"</p>
            </div>
          </div>
          <div class="about-search-feature">
            <div class="about-sf-icon" style="color:var(--purple)">${icon('fileText', 20)}</div>
            <div>
              <strong>Phrase Matching</strong>
              <p>"exact phrase" matches those exact words together</p>
            </div>
          </div>
          <div class="about-search-feature">
            <div class="about-sf-icon" style="color:var(--green)">${icon('globe', 20)}</div>
            <div>
              <strong>Site Filter</strong>
              <p>site:example.com restricts results to one domain</p>
            </div>
          </div>
          <div class="about-search-feature">
            <div class="about-sf-icon" style="color:var(--amber)">${icon('zap', 20)}</div>
            <div>
              <strong>Fuzzy Matching</strong>
              <p>Typos like "pythn" still find "python"</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Ranking Formula Visual -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">How Results Are Ranked</h2>
        <p class="about-section-desc">Like a recipe — mix the right ingredients in the right amounts.</p>
        <div class="about-ranking-visual">
          <div class="about-rank-formula">
            <div class="about-rank-block" style="--color:var(--accent)">
              <div class="about-rank-bar" style="height:70%"></div>
              <span>BM25<br>Text Match</span>
            </div>
            <span class="about-rank-op">x</span>
            <div class="about-rank-block" style="--color:var(--green)">
              <div class="about-rank-bar" style="height:65%"></div>
              <span>StaticScore<br><small style="opacity:0.7">pre-computed</small></span>
            </div>
            <span class="about-rank-op">x</span>
            <div class="about-rank-block" style="--color:var(--amber)">
              <div class="about-rank-bar" style="height:80%"></div>
              <span>Freshness<br>Decay</span>
            </div>
            <span class="about-rank-op">=</span>
            <div class="about-rank-block about-rank-result" style="--color:var(--purple)">
              <div class="about-rank-bar" style="height:65%"></div>
              <span>Final<br>Score</span>
            </div>
          </div>
          <div class="about-rank-weights">
            <div style="grid-column:1/-1;margin-bottom:4px;color:var(--text-secondary);font-size:0.85em"><strong>StaticScore</strong> = (0.5 + weightedSignals * 2.0) * (1.0 - spamScore * 0.8) &nbsp; <em>range [0.1, 2.5] — computed once at index time</em></div>
            <div><span class="about-dot" style="background:var(--accent)"></span> E-E-A-T: 20%</div>
            <div><span class="about-dot" style="background:var(--green)"></span> Quality: 20%</div>
            <div><span class="about-dot" style="background:var(--blue)"></span> PageRank: 20%</div>
            <div><span class="about-dot" style="background:var(--amber)"></span> Readability: 8%</div>
            <div><span class="about-dot" style="background:var(--purple)"></span> Citation: 8%</div>
            <div><span class="about-dot" style="background:var(--red)"></span> SEO: 8%</div>
          </div>
        </div>
      </section>

      <!-- Capabilities -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Capabilities</h2>
        <p class="about-section-desc">Everything packed into a single Go binary. Click any card for details.</p>
        <div class="about-capabilities-grid">
          ${capabilities.map((cap, i) => `
            <div class="about-cap-card" data-cap-idx="${i}" style="cursor:pointer">
              <div class="about-cap-icon" style="color:var(--accent)">${icon(cap.icon, 28)}</div>
              <h3>${cap.title}</h3>
              <p>${cap.desc}</p>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Architecture -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Architecture</h2>
        <p class="about-section-desc">A single binary. No microservices. No external dependencies at runtime.</p>
        <div class="about-arch-layers">
          <div class="about-arch-layer" style="--layer-color:var(--accent)">
            <div class="about-arch-layer-label">Application Layer</div>
            <div class="about-arch-layer-items">
              <span>${icon('download', 16)} Crawler</span>
              <span>${icon('cpu', 16)} Indexer</span>
              <span>${icon('search', 16)} Search Engine</span>
              <span>${icon('code', 16)} HTTP API</span>
            </div>
          </div>
          <div class="about-arch-layer" style="--layer-color:var(--blue)">
            <div class="about-arch-layer-label">P2P Layer</div>
            <div class="about-arch-layer-items">
              <span>${icon('network', 16)} Kademlia DHT</span>
              <span>${icon('megaphone', 16)} GossipSub</span>
              <span>${icon('radio', 16)} Stream Protocols</span>
              <span>${icon('database', 16)} Shard Protocol</span>
              <span>${icon('shield', 16)} Replication</span>
            </div>
          </div>
          <div class="about-arch-layer" style="--layer-color:var(--green)">
            <div class="about-arch-layer-label">Storage Layer</div>
            <div class="about-arch-layer-items">
              <span>${icon('database', 16)} BadgerDB</span>
              <span>${icon('fileText', 16)} Bleve Index</span>
              <span>${icon('link', 16)} Link Graph</span>
              <span>${icon('shield', 16)} DedupStore</span>
              <span>${icon('cpu', 16)} ContentStore</span>
              <span>${icon('trendingUp', 16)} GenerationStore</span>
            </div>
          </div>
        </div>
        <div class="about-tech-badges">
          ${techStack.map(t => `<span class="about-tech-badge" style="border-color:${t.color};color:${t.color}">${t.name}</span>`).join('')}
        </div>
      </section>

      <!-- Limitations -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Limitations &amp; Trade-offs</h2>
        <p class="about-section-desc">Honest disclosure — what Doogle can't do (yet), and why.</p>
        <div class="about-limitations-grid">
          ${limitations.map(lim => `
            <div class="about-limit-card">
              <div class="about-limit-header">
                <h3>${lim.title}</h3>
                <span class="badge ${lim.badge === 'planned' ? 'badge-amber' : 'badge-blue'}">${lim.badge}</span>
              </div>
              <p>${lim.desc}</p>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Node Requirements -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Run a Node</h2>
        <p class="about-section-desc">Everything you need to run your own Doogle node. It's a single binary — no databases, no external services.</p>
        <div class="about-requirements-grid">
          <div class="about-req-card">
            <div class="about-req-icon" style="color:var(--green)">${icon('cpu', 24)}</div>
            <h3>System</h3>
            <ul class="about-req-list">
              <li><strong>OS:</strong> Linux, macOS, or Windows</li>
              <li><strong>CPU:</strong> 1 core min, 2-4 recommended</li>
              <li><strong>RAM:</strong> 256 MB min, 512 MB-1 GB recommended</li>
              <li><strong>Disk:</strong> ~50 MB per 1K indexed pages</li>
            </ul>
          </div>
          <div class="about-req-card">
            <div class="about-req-icon" style="color:var(--blue)">${icon('radio', 24)}</div>
            <h3>Network</h3>
            <ul class="about-req-list">
              <li><strong>Port 4001</strong> — P2P (TCP + UDP/QUIC)</li>
              <li><strong>Port 8080</strong> — HTTP API &amp; Web UI</li>
              <li>Auto NAT traversal (UPnP / hole punching)</li>
              <li>mDNS for local peer discovery</li>
            </ul>
          </div>
          <div class="about-req-card">
            <div class="about-req-icon" style="color:var(--amber)">${icon('code', 24)}</div>
            <h3>Build</h3>
            <ul class="about-req-list">
              <li><strong>Go 1.22+</strong> to compile from source</li>
              <li>Or use the <strong>Docker image</strong> (Alpine-based)</li>
              <li>Zero runtime dependencies</li>
              <li>Optional: Chromium for headless JS rendering</li>
            </ul>
          </div>
          <div class="about-req-card">
            <div class="about-req-icon" style="color:var(--purple)">${icon('database', 24)}</div>
            <h3>Storage</h3>
            <ul class="about-req-list">
              <li><strong>BadgerDB</strong> — URL queue, metadata, link graph, dedup</li>
              <li><strong>Bleve</strong> — full-text search index</li>
              <li>All stored in <code>--data-dir</code> (default: <code>./data/doogle/</code>)</li>
              <li>Peer identity key persisted across restarts</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Get Started -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">Get Started</h2>
        <p class="about-section-desc">Three ways to run your own Doogle node.</p>
        <div class="about-getstarted-grid">
          <div class="about-terminal">
            <div class="about-terminal-header">
              <span class="about-terminal-dot" style="background:var(--red)"></span>
              <span class="about-terminal-dot" style="background:var(--amber)"></span>
              <span class="about-terminal-dot" style="background:var(--green)"></span>
              <span class="about-terminal-title">Native Go</span>
            </div>
            <pre class="about-terminal-body"><code>cd doogle-v2
make build
./bin/doogle --seed "https://example.com"

# Open http://localhost:8080</code></pre>
          </div>
          <div class="about-terminal">
            <div class="about-terminal-header">
              <span class="about-terminal-dot" style="background:var(--red)"></span>
              <span class="about-terminal-dot" style="background:var(--amber)"></span>
              <span class="about-terminal-dot" style="background:var(--green)"></span>
              <span class="about-terminal-title">Docker</span>
            </div>
            <pre class="about-terminal-body"><code>docker build -t doogle .
docker run -p 8080:8080 -p 4001:4001 \\
  doogle --seed "https://example.com"</code></pre>
          </div>
          <div class="about-terminal">
            <div class="about-terminal-header">
              <span class="about-terminal-dot" style="background:var(--red)"></span>
              <span class="about-terminal-dot" style="background:var(--amber)"></span>
              <span class="about-terminal-dot" style="background:var(--green)"></span>
              <span class="about-terminal-title">Cluster</span>
            </div>
            <pre class="about-terminal-body"><code>cd doogle-v2
make docker-up

# Scales to N nodes:
docker compose up --scale node=3</code></pre>
          </div>
        </div>
      </section>

      <!-- References -->
      <section class="about-section about-reveal">
        <h2 class="about-section-title">References &amp; Further Reading</h2>
        <p class="about-section-desc">The standards, papers, and libraries that power Doogle.</p>
        <div class="about-references-grid">
          <a href="https://blevesearch.com/" target="_blank" class="about-ref-card">
            <strong>Bleve Full-Text Search</strong>
            <p>Go-native full-text search and indexing library</p>
            <span class="badge badge-green">blevesearch.com</span>
          </a>
          <a href="https://docs.libp2p.io/" target="_blank" class="about-ref-card">
            <strong>libp2p Networking</strong>
            <p>Modular peer-to-peer networking stack</p>
            <span class="badge badge-blue">docs.libp2p.io</span>
          </a>
          <a href="https://dgraph.io/badger" target="_blank" class="about-ref-card">
            <strong>BadgerDB</strong>
            <p>Fast key-value store written in pure Go</p>
            <span class="badge badge-amber">dgraph.io/badger</span>
          </a>
          <a href="https://en.wikipedia.org/wiki/Consistent_hashing" target="_blank" class="about-ref-card">
            <strong>Consistent Hashing</strong>
            <p>Karger et al. — distributed hash table routing</p>
            <span class="badge badge-purple">Wikipedia</span>
          </a>
          <a href="https://docs.libp2p.io/concepts/pubsub/overview/" target="_blank" class="about-ref-card">
            <strong>GossipSub Protocol</strong>
            <p>libp2p publish/subscribe messaging</p>
            <span class="badge badge-blue">docs.libp2p.io</span>
          </a>
          <a href="https://en.wikipedia.org/wiki/Okapi_BM25" target="_blank" class="about-ref-card">
            <strong>BM25 Scoring</strong>
            <p>Okapi BM25 probabilistic relevance ranking</p>
            <span class="badge badge-accent">Wikipedia</span>
          </a>
        </div>
      </section>

      <footer class="about-footer">
        <p>Built with purpose. Coming soon to GitHub.</p>
      </footer>
    </div>
  `;

  typewriter('A decentralized, peer-to-peer search engine where every node crawls, indexes, and searches together.');
  loadStats();
  startPipelineAnimation();
  setupScrollReveal();
  setupPageRankDemo();
  setupSearchDemo();
  setupCapabilityModals();
}

// ---- Capability Card Modals ----
function setupCapabilityModals() {
  document.querySelectorAll('.about-cap-card[data-cap-idx]').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.capIdx, 10);
      const data = capabilityModalData[idx];
      if (data) showModal(data.title, data.html);
    });
  });
}

// ---- Typewriter ----
function typewriter(text) {
  const el = document.querySelector('.about-tagline');
  if (!el) return;
  let i = 0;
  function tick() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      i++;
      setTimeout(tick, 35);
    }
  }
  tick();
}

// ---- Live Stats ----
async function loadStats() {
  try {
    const s = await api.status();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('about-stat-docs', s.indexed_docs?.toLocaleString() ?? '0');
    set('about-stat-crawled', s.crawled_urls?.toLocaleString() ?? '0');
    set('about-stat-peers', s.connected_peers ?? '0');
    set('about-stat-uptime', s.uptime ?? '--');
  } catch { /* decorative */ }
}

// ---- Pipeline Animation ----
function startPipelineAnimation() {
  const steps = document.querySelectorAll('.about-pipeline-step');
  const detail = document.getElementById('pipeline-detail');
  const pipeline = document.querySelector('.about-pipeline');
  if (!steps.length || !detail) return;

  let current = 0;
  let autoPlay = true;
  let hovered = false;
  let clickTimer = null;

  function highlight(index) {
    steps.forEach((s, i) => s.classList.toggle('active', i === index));
    const step = pipelineSteps[index];
    detail.innerHTML = `
      <div class="about-pipeline-detail-inner">
        <div class="about-pipeline-detail-icon" style="color:${step.color}">${icon(step.icon, 32)}</div>
        <div>
          <h4>${step.title}</h4>
          <p class="about-eli5">${step.eli5}</p>
          <p class="about-technical">${step.detail}</p>
          <button class="btn btn-primary" style="margin-top:8px;font-size:0.8em;padding:4px 12px" data-modal-step="${index}">Deep Dive</button>
        </div>
      </div>
    `;
    detail.querySelector(`[data-modal-step="${index}"]`)?.addEventListener('click', () => {
      showModal(step.title, step.modal);
    });
  }

  // Click/tap — pause until another step is tapped or 12s timeout
  steps.forEach((s, i) => {
    s.addEventListener('click', () => {
      autoPlay = false;
      current = i;
      highlight(i);
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { autoPlay = true; }, 12000);
    });
  });

  // Hover pause (desktop) — pause on enter, resume on leave
  if (pipeline) {
    pipeline.addEventListener('mouseenter', () => { hovered = true; });
    pipeline.addEventListener('mouseleave', () => { hovered = false; });
  }
  if (detail) {
    detail.addEventListener('mouseenter', () => { hovered = true; });
    detail.addEventListener('mouseleave', () => { hovered = false; });
  }

  highlight(0);
  window._pageInterval = setInterval(() => {
    if (!autoPlay || hovered) return;
    current = (current + 1) % pipelineSteps.length;
    highlight(current);
  }, 6000);
}

// ---- PageRank Interactive Demo ----
function setupPageRankDemo() {
  const canvas = document.getElementById('pagerank-demo');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.offsetWidth || 600;
  const H = 360;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const pages = [
    { id: 'A', x: W * 0.5, y: 60, score: 0.2, label: 'Your Page' },
    { id: 'B', x: W * 0.2, y: 180, score: 0.2, label: 'Blog' },
    { id: 'C', x: W * 0.8, y: 180, score: 0.2, label: 'News Site' },
    { id: 'D', x: W * 0.35, y: 300, score: 0.2, label: 'Wiki' },
    { id: 'E', x: W * 0.65, y: 300, score: 0.2, label: 'Forum' },
  ];
  let links = [];
  let linkCount = 0;

  const possibleLinks = [
    { from: 1, to: 0 }, { from: 2, to: 0 }, { from: 3, to: 0 },
    { from: 4, to: 0 }, { from: 3, to: 1 }, { from: 4, to: 2 },
    { from: 1, to: 3 }, { from: 2, to: 4 },
  ];

  function recalcScores() {
    const n = pages.length;
    const scores = new Array(n).fill(1 / n);
    for (let iter = 0; iter < 15; iter++) {
      const next = new Array(n).fill((1 - 0.85) / n);
      for (const lnk of links) {
        const outDeg = links.filter(l => l.from === lnk.from).length || 1;
        next[lnk.to] += 0.85 * scores[lnk.from] / outDeg;
      }
      for (let i = 0; i < n; i++) scores[i] = next[i];
    }
    const max = Math.max(...scores, 0.01);
    pages.forEach((p, i) => { p.score = scores[i] / max; });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw links
    for (const lnk of links) {
      const from = pages[lnk.from];
      const to = pages[lnk.to];
      ctx.strokeStyle = hexToRgba(getCSS('--accent'), 0.3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const r = 12 + to.score * 25;
      const ax = to.x - Math.cos(angle) * r;
      const ay = to.y - Math.sin(angle) * r;
      ctx.fillStyle = hexToRgba(getCSS('--accent'), 0.5);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 8 * Math.cos(angle - 0.4), ay - 8 * Math.sin(angle - 0.4));
      ctx.lineTo(ax - 8 * Math.cos(angle + 0.4), ay - 8 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }

    // Draw pages
    for (const p of pages) {
      const r = 12 + p.score * 25;
      ctx.fillStyle = p.id === 'A'
        ? hexToRgba(getCSS('--accent'), 0.3 + p.score * 0.5)
        : hexToRgba(getCSS('--purple'), 0.2 + p.score * 0.4);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = p.id === 'A' ? 'var(--accent)' : 'var(--purple)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = getCSS('--canvas-text');
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, p.x, p.y - r - 8);

      ctx.fillStyle = getCSS('--canvas-text-bold');
      ctx.font = '10px system-ui';
      ctx.fillText((p.score * 100).toFixed(0) + '%', p.x, p.y + 4);
    }
  }

  recalcScores();
  draw();

  document.getElementById('pr-add-link')?.addEventListener('click', () => {
    if (linkCount >= possibleLinks.length) return;
    links.push(possibleLinks[linkCount]);
    linkCount++;
    recalcScores();
    draw();
  });

  document.getElementById('pr-reset')?.addEventListener('click', () => {
    links = [];
    linkCount = 0;
    recalcScores();
    draw();
  });

  // Redraw on theme change
  window.addEventListener('themechange', draw);
}

// ---- Search Demo ----
const synonymMap = {
  js: ['javascript'], javascript: ['js'], ts: ['typescript'], typescript: ['ts'],
  py: ['python'], python: ['py'], k8s: ['kubernetes'], kubernetes: ['k8s'],
  docs: ['documentation'], doc: ['documentation'], db: ['database'], database: ['db'],
  golang: ['go'], go: ['golang'], rust: ['rustlang'], tutorial: ['guide', 'howto'],
  fix: ['repair', 'resolve'], error: ['bug', 'issue'], ml: ['machine learning'],
};

const stopWords = new Set(['a','an','the','is','are','was','were','be','been','to','of','in','for','on','with','at','by','from','as','and','but','or','not','this','that','it','i','you','he','she','we','they','my','your','his','her','its','our','their','how','what','which','who']);

function parseQueryDemo(raw) {
  const result = { raw, terms: [], phrases: [], site: '', synonyms: {}, fuzzy: false };
  let remaining = raw.trim();

  // Phrases
  const phraseRe = /"([^"]+)"/g;
  let m;
  while ((m = phraseRe.exec(remaining)) !== null) result.phrases.push(m[1]);
  remaining = remaining.replace(phraseRe, ' ');

  // Site
  const siteRe = /site:(\S+)/i;
  const siteMatch = remaining.match(siteRe);
  if (siteMatch) result.site = siteMatch[1].toLowerCase();
  remaining = remaining.replace(siteRe, ' ');

  // Terms
  for (const w of remaining.split(/\s+/)) {
    const lower = w.toLowerCase();
    if (lower && !stopWords.has(lower)) result.terms.push(lower);
  }

  // Synonyms
  for (const t of result.terms) {
    if (synonymMap[t]) result.synonyms[t] = synonymMap[t];
  }

  result.fuzzy = result.terms.length <= 3;
  return result;
}

function setupSearchDemo() {
  const btn = document.getElementById('demo-parse-btn');
  const input = document.getElementById('demo-query');
  if (!btn || !input) return;

  function runDemo() {
    const pq = parseQueryDemo(input.value);
    const el = document.getElementById('demo-parse-result');
    if (!el) return;

    el.innerHTML = `
      <div class="about-parse-grid">
        <div class="about-parse-item">
          <span class="about-parse-label">Terms</span>
          <span class="about-parse-value">${pq.terms.map(t => `<span class="badge badge-accent">${t}</span>`).join(' ') || '<span class="about-parse-empty">none</span>'}</span>
        </div>
        ${pq.phrases.length ? `<div class="about-parse-item">
          <span class="about-parse-label">Phrases</span>
          <span class="about-parse-value">${pq.phrases.map(p => `<span class="badge badge-purple">"${p}"</span>`).join(' ')}</span>
        </div>` : ''}
        ${pq.site ? `<div class="about-parse-item">
          <span class="about-parse-label">Site Filter</span>
          <span class="about-parse-value"><span class="badge badge-green">${pq.site}</span></span>
        </div>` : ''}
        ${Object.keys(pq.synonyms).length ? `<div class="about-parse-item">
          <span class="about-parse-label">Synonyms</span>
          <span class="about-parse-value">${Object.entries(pq.synonyms).map(([k, v]) => `<span class="badge badge-blue">${k} \u2192 ${v.join(', ')}</span>`).join(' ')}</span>
        </div>` : ''}
        <div class="about-parse-item">
          <span class="about-parse-label">Fuzzy</span>
          <span class="about-parse-value"><span class="badge ${pq.fuzzy ? 'badge-amber' : 'badge-default'}">${pq.fuzzy ? 'enabled (short query)' : 'disabled'}</span></span>
        </div>
      </div>
    `;
  }

  btn.addEventListener('click', runDemo);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') runDemo(); });
  runDemo();
}

// ---- Scroll Reveal ----
function setupScrollReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.about-reveal').forEach(el => observer.observe(el));
}
