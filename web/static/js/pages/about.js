// Doogle v2 — About Page: Interactive, visual, simple explanations (tabbed layout)
import { api } from '../api.js';
import { icon, getCSS, hexToRgba, showModal } from '../components.js';

let activeTab = 'overview';

// ---- Data ----
const pipelineSteps = [
  {
    icon: 'globe', title: 'Seed URL', color: 'var(--accent)',
    eli5: 'You give Doogle a website address, like telling a puppy "go fetch!"',
    detail: 'A URL is added to the frontier via seed, peer gossip, or discovery. Domain ownership is checked — the URL is routed to the shard owner or crawled locally.',
    modal: `<p>URLs enter the system from three sources:</p>
      <ul>
        <li><strong>Seed URLs</strong> — manually provided via CLI flag, API, or wizard</li>
        <li><strong>Peer Gossip</strong> — discovered URLs broadcast via <a href="https://docs.libp2p.io/concepts/pubsub/overview/" target="_blank">GossipSub</a></li>
        <li><strong>Link Discovery</strong> — extracted from crawled pages</li>
      </ul>
      <p>Before scheduling, each URL goes through a <strong>domain ownership check</strong>: if this node owns the domain in the shard ring, it schedules locally; otherwise, the task is forwarded to the owner via <code>/doogle/crawl/1.0.0</code>. If the owner is offline, the node falls back to crawling locally.</p>
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
      <p>Extracted content — title, meta tags, headings, links, images — is passed to the quality scoring pipeline before indexing.</p>`,
  },
  {
    icon: 'cpu', title: 'Analyze', color: 'var(--purple)',
    eli5: 'Doogle figures out what the page is about — is it about cats? Coding? Pizza recipes?',
    detail: 'Readability-style content extraction (Arc90 algorithm) pulls clean body text. Duplicate detection, link graph, and URL quality analysis.',
    modal: `<p>Every crawled document goes through content analysis:</p>
      <ul>
        <li><strong>Readability Extraction</strong> — Arc90-style algorithm scores block elements (div, article, section) by paragraph count, text length, and class/ID signals to find the main content area, stripping boilerplate</li>
        <li><strong>Content Extraction</strong> — title, meta description, headings (H1-H6), links, images, OG tags, canonical URLs</li>
        <li><strong>URL Quality Analysis</strong> — path depth, slug readability, tracking parameter detection</li>
        <li><strong>Content Dedup</strong> — SHA-256 content hash to detect near-identical pages</li>
        <li><strong>Link Graph</strong> — internal and external links are recorded for PageRank and domain authority computation</li>
        <li><strong>Word Count &amp; Structure</strong> — used by the quality scorer to evaluate content depth</li>
      </ul>`,
  },
  {
    icon: 'star', title: 'Score', color: 'var(--amber)',
    eli5: 'Doogle gives the page a report card — is it well-written? Trustworthy? Useful?',
    detail: '12-signal scoring: E-E-A-T, quality, PageRank, domain authority, URL quality, readability, citation, link, SEO, author credibility, relevance, and freshness.',
    modal: `<p>Quality scoring combines 12 signals into a weighted score:</p>
      <ul>
        <li><strong>E-E-A-T</strong> (15%) — expertise, experience, authority, trust</li>
        <li><strong>Quality</strong> (10%) — content depth, heading structure, media richness</li>
        <li><strong>PageRank</strong> (15%) — graph-based link authority (<a href="https://en.wikipedia.org/wiki/PageRank" target="_blank">Wikipedia</a>)</li>
        <li><strong>Domain Authority</strong> (10%) — site-level reputation: avg PageRank, avg quality, backlink domains</li>
        <li><strong>Readability</strong> (8%) — Flesch-Kincaid score</li>
        <li><strong>Citation</strong> (8%) — references to/from other sources</li>
        <li><strong>Freshness</strong> (8%) — graduated decay with time-sensitive vs evergreen half-lives</li>
        <li><strong>Relevance</strong> (6%) — composite of other signals</li>
        <li><strong>URL Quality</strong> (5%) — path depth, readability, tracking param detection</li>
        <li><strong>SEO</strong> (5%) — meta tags, heading structure</li>
        <li><strong>Link</strong> (5%) — inbound/outbound link structure</li>
        <li><strong>Author Credibility</strong> (5%) — author expertise signals</li>
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
    detail: 'Batch-indexed into Bleve (100 docs/flush) with pre-computed StaticScore. BM25 field boosts: title 5x, URL text 3x, headings 2x, desc 1.5x, content 1x.',
    modal: `<p>Documents are buffered and flushed to <a href="https://blevesearch.com/" target="_blank">Bleve</a> in batches of 100 (or every 5 seconds). Batch writes are 10-50x faster than single-doc indexing.</p>
      <p>Each document stores a pre-computed <strong>StaticScore</strong> so search only needs: <code>BM25 * StaticScore * freshnessDecay * intentMultiplier</code> — no per-query recomputation of quality signals.</p>
      <p>Field boosts: title (5x), URL text (3x), headings (2x), description (1.5x), content (1x). Additional indexed fields: <code>url_text</code> (readable URL path words) and <code>headings_text</code> (concatenated h1-h3 text). All metadata stored in <a href="https://dgraph.io/badger" target="_blank">BadgerDB</a>.</p>`,
  },
  {
    icon: 'search', title: 'Search', color: 'var(--accent)',
    eli5: 'You ask a question, and Doogle looks through its filing cabinet super fast to find the best answers.',
    detail: 'Queries are parsed, intent is classified, synonyms expanded, matched against Bleve, then ranked by 12 signals with domain diversity and spelling suggestions.',
    modal: `<p>The search pipeline parses your query into structured components:</p>
      <ul>
        <li><strong>Intent Classification</strong> — navigational, informational, transactional, or local — adjusts ranking weights per query</li>
        <li><strong>Synonym Expansion</strong> — 100+ bidirectional pairs (e.g., "js" → "javascript", "k8s" → "kubernetes") added as low-boost clauses</li>
        <li><strong>Spelling Correction</strong> — "Did you mean?" suggestions via Damerau-Levenshtein against the index dictionary</li>
        <li><strong>Phrases</strong> — <code>"exact match"</code> terms</li>
        <li><strong>Boolean operators</strong> — <code>-exclude</code>, <code>OR</code> disjunctions</li>
        <li><strong>Site filter</strong> — <code>site:example.com</code></li>
        <li><strong>Language filter</strong> — <code>lang:de</code> with language-specific stemmers (15 languages)</li>
        <li><strong>Search dorks</strong> — <code>intitle:</code>, <code>inurl:</code>, <code>intext:</code>, <code>filetype:</code>, <code>before:/after:</code>, <code>has:https</code></li>
        <li><strong>Fuzzy matching</strong> — typo tolerance for short queries</li>
      </ul>
      <p>Results are ranked: <code>final = BM25 * StaticScore * freshnessDecay * intentMultiplier</code></p>
      <p><strong>Domain diversity:</strong> max 2 results per domain in top 10 — prevents one site from monopolizing results.</p>
      <p><strong>Passage snippets:</strong> sentence-level extraction with term highlight positions for rich rendering.</p>
      <p>BM25 is the text relevance engine inside <a href="https://blevesearch.com/" target="_blank">Bleve</a>. StaticScore is pre-computed at index time. Freshness uses graduated exponential decay with configurable half-lives (7 days for time-sensitive, 365 days for evergreen).</p>`,
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
  { icon: 'globe', title: 'Domain-Aware Crawl Routing', desc: 'The shard ring assigns each domain to a specific node. Before crawling, ownership is checked — non-owners forward tasks to the responsible peer automatically.',
    modal: `<p>Every URL is routed through domain ownership checks before crawling:</p>
      <ul>
        <li><strong>Own domain?</strong> Schedule locally in the crawl pipeline</li>
        <li><strong>Not owned?</strong> Forward the CrawlTask to the shard owner via <code>/doogle/crawl/1.0.0</code></li>
        <li><strong>Owner offline?</strong> Fall back to local crawl (graceful degradation)</li>
      </ul>
      <p>This prevents two nodes from crawling the same domain even if they both select the same seed categories. The consistent hash ring handles domain assignment with 64 virtual nodes per peer for even distribution.</p>
      <p>Monitoring: the admin dashboard shows forwarded/received task counts per node, owned domains, and a full domain ownership map at <code>/api/admin/domains</code>.</p>` },
  { icon: 'search', title: 'Full-Text Search (BM25)', desc: 'Bleve-powered search with intent classification, synonym expansion, spelling correction, boolean operators, search dorks, 15 language stemmers, domain diversity, and passage snippets.',
    modal: `<p><a href="https://blevesearch.com/" target="_blank">Bleve</a> provides BM25-based full-text search. The pipeline: parse query → classify intent (navigational/informational/transactional/local) → expand synonyms (100+ pairs) → build Bleve query tree → match → intent-aware re-rank → domain diversity (max 2 per domain in top 10) → passage-based snippets with highlights → spelling suggestion ("Did you mean?").</p><p>Field boosts: title (5x), URL text (3x), headings (2x), description (1.5x), content (1x). Boolean operators, search dorks, phrase matching, fuzzy matching, <code>site:</code> and <code>lang:</code> filters (15 language stemmers).</p><p>Reference: <a href="https://en.wikipedia.org/wiki/Okapi_BM25" target="_blank">BM25 algorithm (Wikipedia)</a></p>` },
  { icon: 'star', title: 'Quality Scoring (12 Signals)', desc: '12 weighted scoring signals: E-E-A-T, quality, PageRank, domain authority, URL quality, readability, citation, link, SEO, author credibility, relevance, and freshness.',
    modal: `<p>12-signal scoring evaluates pages across multiple dimensions, mirroring Google's quality rater guidelines and insights from the Yandex ranking factor leak. Signals include E-E-A-T (15%), quality (10%), PageRank (15%), domain authority (10%), URL quality (5%), readability (8%), citation (8%), freshness (8%), relevance (6%), SEO (5%), link structure (5%), and author credibility (5%). Domain authority aggregates site-level reputation from avg PageRank, avg quality, and backlink domains.</p>` },
  { icon: 'cpu', title: 'Content Analysis', desc: 'Readability-style main content extraction (Arc90 algorithm) plus rich metadata: headings, links, images, OG tags, canonical URLs.',
    modal: `<p>Every crawled document goes through Readability-style content extraction: block elements (div, article, section) are scored by paragraph count, text length, comma density, and class/ID signals to isolate the main content area. Boilerplate (sidebars, navs, footers, ads) is stripped. Also extracts: title, meta description, headings (H1-H6), outbound links (internal/external, nofollow), images with alt text, Open Graph tags, and canonical URLs. URL quality signals score path depth, slug readability, and tracking parameter presence.</p>` },
  { icon: 'shield', title: 'Spam Detection', desc: 'Keyword stuffing detection, cloaking analysis, and quality threshold filtering to keep the index clean.',
    modal: `<p>Spam detection catches keyword stuffing, cloaking patterns, thin content, and link farms. Documents with spam score &gt; 0.7 are rejected before indexing. Below that threshold, spam scores are baked into the StaticScore penalty.</p>` },
  { icon: 'monitor', title: 'Headless JS Rendering', desc: 'go-rod powered headless Chromium fallback for React, Next.js, Angular, and Vue single-page applications.',
    modal: `<p>When a page has 3+ <code>&lt;script&gt;</code> tags, the crawler falls back to headless Chromium via <a href="https://github.com/go-rod/rod" target="_blank">go-rod</a>. This renders React, Vue, Angular, and Next.js SPAs that would otherwise return empty HTML. Chromium is downloaded automatically on first use (~300MB).</p>` },
  { icon: 'network', title: 'P2P Network (Kademlia)', desc: 'libp2p-based peer discovery via Kademlia DHT, IPFS public DHT auto-discovery, and mDNS. Zero config — every node is equal.',
    modal: `<p>Peer discovery uses three mechanisms: (1) <a href="https://docs.libp2p.io/concepts/discovery-routing/kaddht/" target="_blank">Kademlia DHT</a> for internet-wide routing, (2) <strong>IPFS public DHT routing discovery</strong> for automatic zero-config peer finding — nodes connect to IPFS bootstrap peers and advertise under the rendezvous namespace <code>doogle/network/v2</code>, discovering each other within 30–60 seconds with no manual bootstrap needed, and (3) mDNS for local LAN discovery. Every node is a full peer — no central coordinators. Built on <a href="https://docs.libp2p.io/" target="_blank">libp2p</a>.</p>` },
  { icon: 'megaphone', title: 'GossipSub Frontier', desc: 'Discovered URLs are broadcast to peers via pub/sub. Each peer checks domain ownership before crawling — non-owners forward tasks to the responsible node.',
    modal: `<p>Newly discovered URLs are broadcast to all connected peers via <a href="https://docs.libp2p.io/concepts/pubsub/overview/" target="_blank">GossipSub</a> pub/sub. On receipt, each peer checks domain ownership via the shard ring — only the assigned owner crawls the URL. Non-owners forward the task to the owner via <code>/doogle/crawl/1.0.0</code>, preventing duplicate crawl work across the network.</p>` },
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
  { icon: 'network', title: 'Fleet Management', desc: 'Coordinator/worker architecture with secure proxy tunnel, HMAC-SHA256 auth, heartbeat monitoring, and fleet dashboard.',
    modal: `<p>Fleet management enables multi-node orchestration:</p><ul><li><strong>Coordinator/Worker Architecture</strong> — one coordinator manages multiple workers via libp2p stream protocols</li><li><strong>Secure Proxy Tunnel</strong> — workers bind API to localhost; remote access only through encrypted libp2p proxy (<code>/doogle/fleet/proxy/1.0.0</code>)</li><li><strong>HMAC-SHA256 Auth</strong> — all fleet messages signed with a shared 256-bit secret</li><li><strong>Heartbeat Monitoring</strong> — workers send heartbeats every 15s; stale after 60s, offline after 180s</li><li><strong>Fleet Dashboard</strong> — Admin → Fleet shows real-time worker status, stats, and proxy access</li></ul>` },
  { icon: 'shield', title: 'Trust & Safety', desc: 'Peer reputation, spam reporting, auto-quarantine, domain flagging, and gossip-level filtering for network integrity.',
    modal: `<p>Trust & safety features protect the network from abuse:</p><ul><li><strong>Peer Reputation</strong> — trust scores track peer behavior over time</li><li><strong>Spam Reporting</strong> — users can report spam URLs, triggering review and potential auto-quarantine</li><li><strong>Auto-Quarantine</strong> — domains exceeding spam thresholds are automatically quarantined from search results</li><li><strong>Domain Flagging</strong> — admins can flag domains for manual review or permanent blocking</li><li><strong>Gossip-Level Filtering</strong> — spam signals propagate to peers via GossipSub for network-wide protection</li></ul>` },
  { icon: 'zap', title: 'Search Intelligence', desc: 'Intent classification, spelling correction, synonym expansion, domain diversity, and passage snippets with highlights.',
    modal: `<p>Search intelligence features improve query understanding and result quality:</p><ul><li><strong>Intent Classification</strong> — queries classified as navigational, informational, transactional, or local, with intent-specific ranking weight adjustments</li><li><strong>Spelling Correction</strong> — "Did you mean?" suggestions via Damerau-Levenshtein distance against the index dictionary</li><li><strong>Synonym Expansion</strong> — 100+ bidirectional pairs (e.g., "js" ↔ "javascript") added as low-boost query clauses</li><li><strong>Domain Diversity</strong> — max 2 results per domain in top 10, preventing single-site monopolization</li><li><strong>Passage Snippets</strong> — sentence-level extraction with term highlight positions for rich result rendering</li></ul>` },
  { icon: 'globe', title: 'Onboarding Wizard', desc: 'Guided 5-step setup that auto-triggers on new nodes. Pick from 16 topic categories, see your node identity, and launch crawling.',
    modal: `<p>When a fresh node starts with 0 indexed documents, the <a href="#/wizard">setup wizard</a> auto-triggers. It walks users through 5 steps:</p><ol><li><strong>Welcome</strong> — intro and context</li><li><strong>Node Identity</strong> — Peer ID, addresses, connected peers</li><li><strong>Choose Focus</strong> — 16 topic categories across 4 groups (Knowledge, Lifestyle, Creative, Technology) plus custom URLs. Each group has a select-all toggle.</li><li><strong>Settings Preview</strong> — crawl depth and workers overview with growth estimate</li><li><strong>Launch</strong> — submit seeds via batch API, live polling of crawl/index counters</li></ol><p>Seeds are submitted via <code>POST /api/crawl/batch</code> (up to 200 URLs). The wizard can be re-accessed anytime from the admin sidebar.</p>` },
  { icon: 'eye', title: 'Theme Animations', desc: '6 themes with unique background animations and animated logo text. Matrix rain, bats, storm rain, particle mesh, aurora, and dust motes.',
    modal: `<p>Each of the 6 themes has a unique background canvas animation and animated "DOOGLE" logo text:</p><table style="width:100%;font-size:0.9em;margin-top:8px"><tr style="border-bottom:1px solid var(--border)"><td style="padding:6px"><strong>CRT</strong></td><td style="padding:6px">Matrix character rain</td><td style="padding:6px">Glitch text with chromatic aberration</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:6px"><strong>Dracula</strong></td><td style="padding:6px">Drifting bats + mist particles</td><td style="padding:6px">Vampiric pulse letters</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:6px"><strong>Storm</strong></td><td style="padding:6px">Rain with lightning strikes</td><td style="padding:6px">Electric crackle letters</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:6px"><strong>Modern</strong></td><td style="padding:6px">Connected particle mesh</td><td style="padding:6px">Block-build assembly</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:6px"><strong>Light</strong></td><td style="padding:6px">Floating dust motes</td><td style="padding:6px">Ink quill write-in</td></tr><tr><td style="padding:6px"><strong>Pride</strong></td><td style="padding:6px">Aurora borealis rainbow</td><td style="padding:6px">Rainbow shimmer wave</td></tr></table><p style="margin-top:8px">All animations are rendered on a fixed canvas at z-index 0 — subtle, non-invasive, and auto-switch when you change themes.</p>` },
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
  { title: 'Single-node storage limits', desc: 'Index size is bounded by local disk. Sharding distributes load but each node stores its own shard. Light nodes (planned) will bypass this by proxying to full nodes.', badge: 'by design' },
  { title: 'No PDF/doc extraction', desc: 'Binary document formats like PDF, DOCX, and PPTX are not yet parsed or indexed.', badge: 'planned' },
  { title: 'No login-gated content', desc: 'Pages behind authentication walls cannot be crawled. Only publicly accessible content is indexed.', badge: 'by design' },
  { title: 'Rate-limited by politeness', desc: 'Strict per-domain rate limiting and robots.txt compliance means some sites crawl slowly. This is intentional.', badge: 'by design' },
  { title: 'Full nodes only (for now)', desc: 'Every node currently runs all subsystems (~1-2 GB RAM). Light node mode for edge devices is planned — relay-only, ~50 MB.', badge: 'planned' },
  { title: 'No dark web crawling (yet)', desc: '.onion and I2P crawling is on the roadmap (Phase 3). Requires Tor/I2P integration, SOCKS5 proxy support, and content safety layers.', badge: 'planned' },
  { title: 'No P2P anonymity layer', desc: 'Peers currently see each other\'s IPs. Optional libp2p-over-Tor transport is planned to hide peer identities.', badge: 'planned' },
  { title: 'Language coverage varies', desc: '15 language stemmers are available via lang: filter, but stemmer quality varies. English has the best results; other languages are functional but less tuned.', badge: 'by design' },
];

// ---- Main Render ----
export function renderAbout(container) {
  // Clear any leftover intervals
  if (window._pageInterval) { clearInterval(window._pageInterval); window._pageInterval = null; }

  container.innerHTML = `
    <div class="about-page">
      <section class="about-hero">
        <div class="about-hero-bg"></div>
        <h1 class="about-title">DOOGLE</h1>
        <div class="about-tagline-wrap">
          <p class="about-tagline" aria-label="The search engine for the entire web — surface, deep, and dark."><span class="about-tagline-text"></span><span class="about-cursor">|</span></p>
        </div>
        <p class="about-subtitle">Open source. Zero tracking. Censorship-resistant. Every corner of the internet, indexed by the people.</p>
      </section>

      <section class="about-stats-bar">
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

      <div class="docs-nav" id="about-tabs">
        <button class="docs-nav-btn active" data-tab="overview">
          ${icon('globe', 16)} Overview
        </button>
        <button class="docs-nav-btn" data-tab="howitworks">
          ${icon('cpu', 16)} How It Works
        </button>
        <button class="docs-nav-btn" data-tab="features">
          ${icon('zap', 16)} Features
        </button>
        <button class="docs-nav-btn" data-tab="roadmap">
          ${icon('trendingUp', 16)} Roadmap
        </button>
        <button class="docs-nav-btn" data-tab="getstarted">
          ${icon('code', 16)} Get Started
        </button>
      </div>
      <div class="about-tab-body" id="about-content"></div>

      <footer class="about-footer">
        <p>Built for information freedom. Open source forever.</p>
      </footer>
    </div>
  `;

  typewriter('The search engine for the entire web — surface, deep, and dark.');
  loadStats();

  document.querySelectorAll('#about-tabs .docs-nav-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('#about-tabs .docs-nav-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTab();
    });
  });

  renderTab();
}

function renderTab() {
  const el = document.getElementById('about-content');
  if (!el) return;

  if (window._pageInterval) { clearInterval(window._pageInterval); window._pageInterval = null; }

  const tabs = {
    overview: renderOverview,
    howitworks: renderHowItWorks,
    features: renderFeatures,
    roadmap: renderRoadmap,
    getstarted: renderGetStarted,
  };

  const fn = tabs[activeTab] || renderOverview;
  fn(el);
  setupScrollReveal();
}

// ─── Tab: Overview ────────────────────────────────────
function renderOverview(el) {
  el.innerHTML = `
    <section class="about-section about-reveal">
      <h2 class="about-section-title">Our Vision</h2>
      <p class="about-section-desc">Google indexes 5% of the web and decides what you see. We're building infrastructure to index the other 95%.</p>
      <div class="about-vision-grid">
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--accent)">${icon('globe', 24)}</div>
          <h3>The Entire Web</h3>
          <p>Surface web, .onion hidden services, I2P eepsites, academic archives, government datasets — every corner of the internet.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--green)">${icon('shield', 24)}</div>
          <h3>Privacy-First</h3>
          <p>Your searches never leave your machine. No cookies, no tracking, no user profiles. Your node, your rules.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--purple)">${icon('lock', 24)}</div>
          <h3>Censorship-Resistant</h3>
          <p>No single entity can remove results or block access. Decentralized by architecture, not just by promise.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--blue)">${icon('users', 24)}</div>
          <h3>Community-Owned</h3>
          <p>Open source forever. No company, no investors, no strings. Governed by the people who run it.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--amber)">${icon('zap', 24)}</div>
          <h3>Zero Dependencies</h3>
          <p>One binary, no external databases, no cloud accounts. Download, run, done. Works offline, on a Raspberry Pi, anywhere.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--red, #ef4444)">${icon('eye', 24)}</div>
          <h3>Transparent Ranking</h3>
          <p>No secret algorithm. Every scoring signal is visible, auditable, and tweakable. You know exactly why a result appears.</p>
        </div>
      </div>
    </section>

    <section class="about-section about-reveal" id="about-your-role">
      <h2 class="about-section-title">Your Mastery</h2>
      <p class="about-section-desc">You are the master of your node. Every search you run, every seed you plant, every spam report you file shapes your corner of the web. These are the facets of your mastery — they emerge naturally from how you use your node.</p>
      <div class="about-vision-grid">
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--accent)">${icon('globe', 28)}</div>
          <h3>Explorer Mastery</h3>
          <div class="about-role-affinity" data-role="Explorer"></div>
          <p>You pick topics in the wizard that interest you — cooking, science, gaming, whatever. Your node crawls those corners of the web and shares what it finds. You're building a specialized index just by browsing what you love.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--green)">${icon('shield', 28)}</div>
          <h3>Guardian Mastery</h3>
          <div class="about-role-affinity" data-role="Guardian"></div>
          <p>You flag spam, phishing, and garbage when you see it. Reports spread across the network and bad actors get quarantined. The more people who flag, the cleaner the index gets for everyone.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--blue)">${icon('network', 28)}</div>
          <h3>Connector Mastery</h3>
          <div class="about-role-affinity" data-role="Connector"></div>
          <p>You keep your node running and connected. The longer your node is online, the more peers it serves, the more resilient the network becomes. Just leave it on — that's the whole contribution.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--purple)">${icon('search', 28)}</div>
          <h3>Specialist Mastery</h3>
          <div class="about-role-affinity" data-role="Specialist"></div>
          <p>Over time your node becomes an expert in your topics. Other nodes route queries your way when they need answers in your domain. Nodes naturally specialize — some cover science, others cover local news, others cover niche hobbies.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--amber)">${icon('eye', 28)}</div>
          <h3>Curator Mastery</h3>
          <div class="about-role-affinity" data-role="Curator"></div>
          <p>You notice what's good and what's noise. Your browsing patterns, flags, and topic choices train the network's quality signals. The pages you keep coming back to rise; the junk you skip fades. You shape relevance without writing a single rule.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--red, #ef4444)">${icon('megaphone', 28)}</div>
          <h3>Amplifier Mastery</h3>
          <div class="about-role-affinity" data-role="Amplifier"></div>
          <p>You share seeds with friends, tell communities about Doogle, and help people set up their first node. Every person you bring in adds new topics, new perspectives, and new corners of the web to the collective index.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--green)">${icon('trendingUp', 28)}</div>
          <h3>Archivist Mastery</h3>
          <div class="about-role-affinity" data-role="Archivist"></div>
          <p>You keep your node running for months, years. Pages that disappear from the live web still live in your index. Your long-running node becomes a time capsule — preserving knowledge that would otherwise be lost.</p>
        </div>
        <div class="about-vision-card">
          <div class="about-vision-icon" style="color:var(--accent)">${icon('code', 28)}</div>
          <h3>Builder Mastery</h3>
          <div class="about-role-affinity" data-role="Builder"></div>
          <p>You see what's missing and build it. A better crawler for a specific content type, a new ranking signal, a browser extension. Doogle is open source — the people who use it are the same people who improve it.</p>
        </div>
      </div>
      <p class="about-section-desc" style="margin-top:16px;font-size:0.88em;color:var(--text-secondary)">These facets aren't assigned — they emerge. The more you use your node, the clearer your mastery profile becomes. <a href="#/admin/profile">Visit your Master Profile</a> to see how your behavior shapes your identity.</p>
    </section>
  `;

  // Async: inject affinity badges from profile data
  api.profile().then(profile => {
    const affinities = profile.role_affinities || {};
    document.querySelectorAll('.about-role-affinity[data-role]').forEach(el => {
      const role = el.dataset.role;
      const val = affinities[role] || 0;
      if (val > 0) {
        const pct = Math.round(val * 100);
        el.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin:4px 0 8px">
          <div style="flex:1;height:5px;border-radius:3px;background:var(--border);overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px"></div>
          </div>
          <span style="font-size:0.75em;color:var(--text-muted);font-weight:600">${pct}%</span>
        </div>`;
      }
    });
  }).catch(() => {}); // non-critical
}

// ─── Tab: How It Works ────────────────────────────────
function renderHowItWorks(el) {
  el.innerHTML = `
    <section class="about-section about-reveal" id="about-pipeline">
      <h2 class="about-section-title">The Pipeline</h2>
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

    <section class="about-section about-reveal" id="about-search-demo">
      <h2 class="about-section-title">Smart Search: Understanding You</h2>
      <p class="about-section-desc">Doogle doesn't just match words — it understands what you mean.</p>
      <div class="about-search-demo-wrap">
        <div class="about-search-demo-input">
          <input type="text" id="demo-query" placeholder='Try: intitle:golang -tutorial site:go.dev OR filetype:pdf' value="intitle:go -tutorial site:go.dev">
          <button class="btn btn-primary" id="demo-parse-btn">Parse</button>
        </div>
        <div class="about-search-demo-result" id="demo-parse-result"></div>
      </div>
      <div class="about-search-features">
        <div class="about-search-feature">
          <div class="about-sf-icon" style="color:var(--accent)">${icon('search', 20)}</div>
          <div>
            <strong>Boolean Operators</strong>
            <p>-exclude terms, OR disjunctions, phrase "exact match"</p>
          </div>
        </div>
        <div class="about-search-feature">
          <div class="about-sf-icon" style="color:var(--purple)">${icon('fileText', 20)}</div>
          <div>
            <strong>Search Dorks</strong>
            <p>intitle:, inurl:, intext:, filetype:, before:/after:, has:https</p>
          </div>
        </div>
        <div class="about-search-feature">
          <div class="about-sf-icon" style="color:var(--green)">${icon('globe', 20)}</div>
          <div>
            <strong>Filters</strong>
            <p>site:domain, lang:xx (15 stemmers)</p>
          </div>
        </div>
        <div class="about-search-feature">
          <div class="about-sf-icon" style="color:var(--amber)">${icon('zap', 20)}</div>
          <div>
            <strong>Smart Matching</strong>
            <p>Fuzzy typo tolerance, auto phrase boost</p>
          </div>
        </div>
      </div>
    </section>

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
            <span>StaticScore<br><small style="opacity:0.7">12 signals</small></span>
          </div>
          <span class="about-rank-op">x</span>
          <div class="about-rank-block" style="--color:var(--amber)">
            <div class="about-rank-bar" style="height:80%"></div>
            <span>Freshness<br>Decay</span>
          </div>
          <span class="about-rank-op">x</span>
          <div class="about-rank-block" style="--color:var(--blue)">
            <div class="about-rank-bar" style="height:55%"></div>
            <span>Intent<br>Multiplier</span>
          </div>
          <span class="about-rank-op">=</span>
          <div class="about-rank-block about-rank-result" style="--color:var(--purple)">
            <div class="about-rank-bar" style="height:65%"></div>
            <span>Final<br>Score</span>
          </div>
        </div>
        <div class="about-rank-weights">
          <div style="grid-column:1/-1;margin-bottom:4px;color:var(--text-secondary);font-size:0.85em"><strong>StaticScore</strong> = (0.5 + weightedSignals * 2.0) * (1.0 - spamScore * 0.8) &nbsp; <em>range [0.1, 2.5] — computed once at index time</em></div>
          <div><span class="about-dot" style="background:var(--accent)"></span> E-E-A-T: 15%</div>
          <div><span class="about-dot" style="background:var(--blue)"></span> PageRank: 15%</div>
          <div><span class="about-dot" style="background:var(--green)"></span> Quality: 10%</div>
          <div><span class="about-dot" style="background:var(--purple)"></span> Domain Authority: 10%</div>
          <div><span class="about-dot" style="background:var(--amber)"></span> Readability: 8%</div>
          <div><span class="about-dot" style="background:var(--red)"></span> Citation: 8%</div>
          <div><span class="about-dot" style="background:var(--accent)"></span> Freshness: 8%</div>
          <div><span class="about-dot" style="background:var(--green)"></span> Relevance: 6%</div>
          <div><span class="about-dot" style="background:var(--blue)"></span> URL Quality: 5%</div>
          <div><span class="about-dot" style="background:var(--amber)"></span> SEO: 5%</div>
          <div><span class="about-dot" style="background:var(--purple)"></span> Link: 5%</div>
          <div><span class="about-dot" style="background:var(--red)"></span> Author: 5%</div>
        </div>
      </div>
    </section>
  `;

  startPipelineAnimation();
  setupPageRankDemo();
  setupSearchDemo();
}

// ─── Tab: Features ────────────────────────────────────
function renderFeatures(el) {
  el.innerHTML = `
    <section class="about-section about-reveal">
      <h2 class="about-section-title">Architecture</h2>
      <p class="about-section-desc">A single binary. No microservices. No external dependencies at runtime. Hover any node to see data flow.</p>
      <div class="about-arch-canvas-wrap">
        <canvas id="arch-diagram" width="900" height="520"></canvas>
        <div class="about-arch-tooltip" id="arch-tooltip"></div>
      </div>
      <div class="about-arch-legend">
        <span class="about-arch-legend-item"><span class="about-arch-legend-dot" style="background:var(--accent)"></span>Application</span>
        <span class="about-arch-legend-item"><span class="about-arch-legend-dot" style="background:var(--blue)"></span>P2P Network</span>
        <span class="about-arch-legend-item"><span class="about-arch-legend-dot" style="background:var(--green)"></span>Storage</span>
        <span class="about-arch-legend-item"><span class="about-arch-legend-dot" style="background:var(--purple)"></span>Trust</span>
      </div>
      <div class="about-tech-badges">
        ${techStack.map(t => `<span class="about-tech-badge" style="border-color:${t.color};color:${t.color}">${t.name}</span>`).join('')}
      </div>
    </section>

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
  `;

  setupCapabilityModals();
  setupArchDiagram();
}

// ─── Tab: Roadmap ─────────────────────────────────────
function renderRoadmap(el) {
  const phases = [
    {
      name: 'Phase 1 — Foundation',
      status: 'complete', cls: 'about-roadmap-done', badge: 'badge-green',
      progress: 100,
      items: [
        'P2P networking (libp2p TCP+QUIC, Kademlia DHT, IPFS DHT auto-discovery, mDNS, GossipSub, NAT traversal)',
        'Crawler with rate limiting, robots.txt, headless browser, live feed',
        'Indexer with 10+ quality signals, E-E-A-T, spam, PageRank',
        'BM25 search with boolean operators, search dorks, 15 language stemmers, phrases, fuzzy, site:/lang: filters',
        'Admin dashboard with 6 themes, wizard, network graph',
        'Docker + Compose support',
      ],
    },
    {
      name: 'Phase 2 — Quality & Scale',
      status: 'next', cls: 'about-roadmap-next', badge: 'badge-blue',
      progress: 56,
      items: [
        '<strong>Done:</strong> boolean operators, multi-language search, search result caching, CLI search tool, spam reporting, domain flagging, backup & restore, production builds, fleet management',
        '<strong>Done:</strong> domain-aware crawl coordination (shard ring gates crawl decisions, auto-forwarding to owners)',
        '<strong>Remaining:</strong> hash ring rebalancing, persistent dedup improvements, structured data extraction, PDF/doc indexing, content verification, image search',
      ],
    },
    {
      name: 'Phase 2.5 — Trust & Safety',
      status: 'next', cls: 'about-roadmap-next', badge: 'badge-blue',
      progress: 12,
      items: [
        '<strong>Done:</strong> admin trust UI',
        '<strong>Remaining:</strong> sybil resistance, consensus-based blocklists, trust decay model, reputation-weighted search ranking, malicious crawl defense, report audit trail, admin allowlist/denylist',
      ],
    },
    {
      name: 'Phase 3 — Dark Web & Privacy',
      status: 'planned', cls: 'about-roadmap-dark', badge: 'badge-purple',
      progress: 0,
      items: [
        'Tor integration & .onion crawling via SOCKS5 proxy',
        'I2P support via SAM bridge for eepsite crawling',
        'Privacy-preserving P2P (libp2p-over-Tor, encrypted queries)',
        'Content safety layer (CSAM hash matching, configurable blocklists)',
      ],
    },
    {
      name: 'Phase 4 — Intelligence',
      status: 'next', cls: 'about-roadmap-next', badge: 'badge-blue',
      progress: 59,
      items: [
        '<strong>Done:</strong> intent classification, spelling correction, synonym expansion, domain diversity, passage snippets, domain authority, URL quality signals, readability extraction (Arc90), graduated freshness scoring, 12-signal ranking model',
        '<strong>Remaining:</strong> semantic search (sentence embeddings, hybrid BM25 + vector), knowledge graph with entity cards, ML-based ranking, automatic summarization, topic clustering, trend detection, multilingual semantic search',
      ],
    },
    {
      name: 'Phase 5 — Ecosystem',
      status: 'planned', cls: 'about-roadmap-next', badge: 'badge-blue',
      progress: 0,
      items: [
        'Browser extension, mobile client',
        'Light nodes (~50 MB RAM, relay-only)',
        'Plugin system, multi-platform releases',
        'Public Doogle-specific bootstrap network, community governance',
      ],
    },
  ];

  const total = phases.length;
  const done = phases.filter(p => p.progress === 100).length;

  el.innerHTML = `
    <section class="about-section about-reveal">
      <h2 class="about-section-title">Roadmap</h2>
      <p class="about-section-desc">${done} of ${total} phases complete. Building the search engine the internet deserves.</p>
      <div class="about-roadmap-timeline">
        ${phases.map(p => `
          <div class="about-roadmap-phase ${p.cls}">
            <h3><span class="badge ${p.badge}">${p.status}</span> ${p.name}</h3>
            <ul>${p.items.map(item => `<li>${item}</li>`).join('')}</ul>
            <div class="roadmap-progress">
              <div class="roadmap-progress-bar"><div class="roadmap-progress-fill" style="width:${p.progress}%"></div></div>
              <span>${p.progress}%</span>
            </div>
          </div>
        `).join('')}
      </div>
    </section>

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
  `;
}

// ─── Tab: Get Started ─────────────────────────────────
function renderGetStarted(el) {
  el.innerHTML = `
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
            <li><strong>Port 7001</strong> — P2P (TCP + UDP/QUIC)</li>
            <li><strong>Port 7002</strong> — HTTP API &amp; Web UI</li>
            <li>Auto NAT traversal (UPnP / hole punching)</li>
            <li>Auto peer discovery via IPFS public DHT</li>
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

    <section class="about-section about-reveal">
      <h2 class="about-section-title">Quick Start</h2>
      <p class="about-section-desc">Three ways to run your own Doogle node.</p>
      <div class="about-getstarted-grid">
        <div class="about-terminal">
          <div class="about-terminal-header">
            <span class="about-terminal-dot" style="background:var(--red)"></span>
            <span class="about-terminal-dot" style="background:var(--amber)"></span>
            <span class="about-terminal-dot" style="background:var(--green)"></span>
            <span class="about-terminal-title">Quick Start</span>
          </div>
          <pre class="about-terminal-body"><code>git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
make run

# Open http://localhost:7002</code></pre>
        </div>
        <div class="about-terminal">
          <div class="about-terminal-header">
            <span class="about-terminal-dot" style="background:var(--red)"></span>
            <span class="about-terminal-dot" style="background:var(--amber)"></span>
            <span class="about-terminal-dot" style="background:var(--green)"></span>
            <span class="about-terminal-title">Docker</span>
          </div>
          <pre class="about-terminal-body"><code># Single node
docker compose up -d node1

# Full 3-node cluster
docker compose up -d</code></pre>
        </div>
        <div class="about-terminal">
          <div class="about-terminal-header">
            <span class="about-terminal-dot" style="background:var(--red)"></span>
            <span class="about-terminal-dot" style="background:var(--amber)"></span>
            <span class="about-terminal-dot" style="background:var(--green)"></span>
            <span class="about-terminal-title">Second Node</span>
          </div>
          <pre class="about-terminal-body"><code># No --bootstrap needed — auto-discovers via DHT
./bin/doogle --port 7003 --api-port 7004 \\
  --data-dir ./data/node2

# Check Admin → Network to see connected peers</code></pre>
        </div>
        <div class="about-terminal">
          <div class="about-terminal-header">
            <span class="about-terminal-dot" style="background:var(--red)"></span>
            <span class="about-terminal-dot" style="background:var(--amber)"></span>
            <span class="about-terminal-dot" style="background:var(--green)"></span>
            <span class="about-terminal-title">Fleet Mode</span>
          </div>
          <pre class="about-terminal-body"><code># On worker node — joins the fleet
./bin/doogle --fleet-role worker \\
  --fleet-coordinator /ip4/&lt;COORD_IP&gt;/tcp/7001/p2p/&lt;PEER_ID&gt; \\
  --fleet-secret &lt;SHARED_SECRET&gt; \\
  --data-dir ./data/worker1</code></pre>
        </div>
      </div>
      <div class="about-getstarted-info" style="margin-top:20px;display:flex;flex-direction:column;gap:12px">
        <p style="color:var(--text-secondary);line-height:1.6"><strong>Peer discovery:</strong> Nodes connect to the IPFS public DHT and advertise under <code>doogle/network/v2</code> — peers find each other automatically within 30–60 seconds. mDNS handles LAN discovery. Manual <code>--bootstrap</code> is available but rarely needed. Check <strong>Admin → Network</strong> to see connected peers.</p>
        <p style="color:var(--text-secondary);line-height:1.6"><strong>Fleet mode:</strong> Run one coordinator and multiple workers for managed deployments. Workers report via heartbeat, and the coordinator proxies requests through secure libp2p tunnels (HMAC-SHA256 signed). All workers share the same <code>--fleet-secret</code>. Monitor everything in <strong>Admin → Fleet</strong>.</p>
      </div>
    </section>

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
  `;
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
  const el = document.querySelector('.about-tagline-text');
  if (!el) return;
  let i = 0;
  function tick() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      i++;
      setTimeout(tick, 35);
    } else {
      // Hide cursor after typing finishes
      const cursor = document.querySelector('.about-cursor');
      if (cursor) setTimeout(() => { cursor.style.opacity = '0'; cursor.style.transition = 'opacity 0.5s'; }, 1200);
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
const stopWords = new Set(['a','an','the','is','are','was','were','be','been','to','of','in','for','on','with','at','by','from','as','and','but','or','not','this','that','it','i','you','he','she','we','they','my','your','his','her','its','our','their','how','what','which','who']);

function parseQueryDemo(raw) {
  const result = { raw, terms: [], phrases: [], site: '', lang: '', excludes: [], orGroups: [],
    inTitle: '', inURL: '', inText: '', fileTypes: [], before: '', after: '', hasHTTPS: false,
    fuzzy: false };
  let remaining = raw.trim();

  // Phrases
  const phraseRe = /"([^"]+)"/g;
  let m;
  while ((m = phraseRe.exec(remaining)) !== null) result.phrases.push(m[1]);
  remaining = remaining.replace(phraseRe, ' ');

  // Operator extraction
  const extract = (re) => { const m = remaining.match(re); if (m) { remaining = remaining.replace(re, ' '); return m[1]; } return ''; };
  result.site = extract(/site:(\S+)/i).toLowerCase();
  result.lang = extract(/lang:(\S+)/i).toLowerCase();
  result.inTitle = extract(/intitle:(\S+)/i).toLowerCase();
  result.inURL = extract(/inurl:(\S+)/i).toLowerCase();
  result.inText = extract(/(?:intext|inbody):(\S+)/i).toLowerCase();
  result.before = extract(/before:(\S+)/i);
  result.after = extract(/after:(\S+)/i);
  const hasVal = extract(/has:(\S+)/i).toLowerCase();
  if (hasVal === 'https') result.hasHTTPS = true;

  // Filetypes (multiple)
  const ftRe = /(?:filetype|ext):(\S+)/gi;
  let ftm;
  while ((ftm = ftRe.exec(remaining)) !== null) result.fileTypes.push(ftm[1].toLowerCase());
  remaining = remaining.replace(/(?:filetype|ext):\S+/gi, ' ');

  // Tokenize with -excludes and OR groups
  const words = remaining.split(/\s+/).filter(Boolean);
  let pendingOR = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length > 1 && w[0] === '-') { result.excludes.push(w.slice(1).toLowerCase()); continue; }
    if (w === 'OR' && i > 0 && i < words.length - 1) {
      if (pendingOR.length === 0 && result.terms.length > 0) pendingOR.push(result.terms.pop());
      continue;
    }
    const lower = w.toLowerCase();
    if (pendingOR.length > 0) {
      pendingOR.push(lower);
      if (i + 1 < words.length && words[i + 1] === 'OR') continue;
      result.orGroups.push([...pendingOR]);
      pendingOR = [];
      continue;
    }
    if (lower && !stopWords.has(lower)) result.terms.push(lower);
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
        ${pq.phrases.length ? `<div class="about-parse-item">
          <span class="about-parse-label">Phrases</span>
          <span class="about-parse-value">${pq.phrases.map(p => `<span class="badge badge-accent">"${p}"</span>`).join(' ')}</span>
        </div>` : ''}
        ${pq.site ? `<div class="about-parse-item">
          <span class="about-parse-label">Site Filter</span>
          <span class="about-parse-value"><span class="badge badge-green">${pq.site}</span></span>
        </div>` : ''}
        ${pq.excludes.length ? `<div class="about-parse-item">
          <span class="about-parse-label">Excludes</span>
          <span class="about-parse-value">${pq.excludes.map(e => `<span class="badge badge-red">-${e}</span>`).join(' ')}</span>
        </div>` : ''}
        ${pq.orGroups.length ? `<div class="about-parse-item">
          <span class="about-parse-label">OR Groups</span>
          <span class="about-parse-value">${pq.orGroups.map(g => `<span class="badge badge-purple">${g.join(' OR ')}</span>`).join(' ')}</span>
        </div>` : ''}
        ${pq.lang ? `<div class="about-parse-item">
          <span class="about-parse-label">Language</span>
          <span class="about-parse-value"><span class="badge badge-green">${pq.lang}</span></span>
        </div>` : ''}
        ${pq.inTitle ? `<div class="about-parse-item">
          <span class="about-parse-label">In Title</span>
          <span class="about-parse-value"><span class="badge badge-blue">${pq.inTitle}</span></span>
        </div>` : ''}
        ${pq.inURL ? `<div class="about-parse-item">
          <span class="about-parse-label">In URL</span>
          <span class="about-parse-value"><span class="badge badge-blue">${pq.inURL}</span></span>
        </div>` : ''}
        ${pq.inText ? `<div class="about-parse-item">
          <span class="about-parse-label">In Body</span>
          <span class="about-parse-value"><span class="badge badge-blue">${pq.inText}</span></span>
        </div>` : ''}
        ${pq.fileTypes.length ? `<div class="about-parse-item">
          <span class="about-parse-label">File Type</span>
          <span class="about-parse-value">${pq.fileTypes.map(f => `<span class="badge badge-amber">.${f}</span>`).join(' ')}</span>
        </div>` : ''}
        ${pq.after || pq.before ? `<div class="about-parse-item">
          <span class="about-parse-label">Date Range</span>
          <span class="about-parse-value">${pq.after ? `<span class="badge badge-amber">after: ${pq.after}</span>` : ''}${pq.before ? ` <span class="badge badge-amber">before: ${pq.before}</span>` : ''}</span>
        </div>` : ''}
        ${pq.hasHTTPS ? `<div class="about-parse-item">
          <span class="about-parse-label">HTTPS</span>
          <span class="about-parse-value"><span class="badge badge-green">required</span></span>
        </div>` : ''}
        <div class="about-parse-item">
          <span class="about-parse-label">Terms</span>
          <span class="about-parse-value">${pq.terms.map(t => `<span class="badge badge-accent">${t}</span>`).join(' ') || '<span class="about-parse-empty">none</span>'}</span>
        </div>
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

// ---- Interactive Architecture Diagram ----
function setupArchDiagram() {
  const canvas = document.getElementById('arch-diagram');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W = Math.min(wrap.offsetWidth || 900, 900);
  const H = 520;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const tooltip = document.getElementById('arch-tooltip');

  // Color helpers
  const accent = () => getCSS('--accent');
  const blue = () => getCSS('--blue');
  const green = () => getCSS('--green');
  const purple = () => getCSS('--purple');
  const textPri = () => getCSS('--text-primary');
  const textSec = () => getCSS('--text-secondary');
  const bgCard = () => getCSS('--bg-card');
  const border = () => getCSS('--border');

  // Node definitions — x/y as fractions of canvas
  const archNodes = [
    // Application layer (y ~ 0.12)
    { id: 'api',     label: 'HTTP API',      sub: 'Chi Router',           x: 0.14, y: 0.10, color: accent, layer: 'app',
      desc: 'REST API serving search, crawl, admin endpoints + embedded SPA. Rate-limited, CORS-locked.' },
    { id: 'crawler', label: 'Crawler',        sub: '4 workers',            x: 0.38, y: 0.10, color: accent, layer: 'app',
      desc: 'Goroutine worker pool with per-domain rate limiting, robots.txt, headless JS rendering fallback.' },
    { id: 'indexer', label: 'Indexer',         sub: 'Batch pipeline',       x: 0.62, y: 0.10, color: accent, layer: 'app',
      desc: 'Quality scoring (E-E-A-T, spam, readability), dedup via 4-gram shingling, batch flush to Bleve.' },
    { id: 'search',  label: 'Search',          sub: 'BM25 + reranking',    x: 0.86, y: 0.10, color: accent, layer: 'app',
      desc: 'Query parsing (phrases, operators, fuzzy), BM25 retrieval, StaticScore reranking, distributed fanout.' },

    // P2P layer (y ~ 0.42)
    { id: 'dht',     label: 'Kademlia DHT',   sub: 'Peer routing + IPFS discovery',  x: 0.10, y: 0.40, color: blue, layer: 'p2p',
      desc: 'Distributed hash table for peer discovery. Auto-discovers peers via IPFS public DHT, plus mDNS for LAN.' },
    { id: 'gossip',  label: 'GossipSub',      sub: '3 topics',             x: 0.30, y: 0.40, color: blue, layer: 'p2p',
      desc: 'Pub/sub broadcast: URL frontier, shard catalog, spam reports. Mesh overlay with fanout.' },
    { id: 'streams', label: 'Streams',         sub: 'req/reply',            x: 0.50, y: 0.40, color: blue, layer: 'p2p',
      desc: '/doogle/search, /doogle/crawl, /doogle/index — request-reply protocols over libp2p streams.' },
    { id: 'shard',   label: 'Sharding',        sub: 'Consistent hash',     x: 0.70, y: 0.40, color: blue, layer: 'p2p',
      desc: 'Domain-based consistent hashing assigns URLs to shard owners for both storage and crawl coordination. Non-owners forward crawl tasks to the responsible peer.' },
    { id: 'replica',  label: 'Replication',     sub: 'N=3 replicas',        x: 0.90, y: 0.40, color: blue, layer: 'p2p',
      desc: 'Documents replicated to N closest peers. Anti-entropy via Merkle root reconciliation.' },

    // Storage layer (y ~ 0.72)
    { id: 'badger',  label: 'BadgerDB',        sub: 'Key-value store',     x: 0.14, y: 0.72, color: green, layer: 'store',
      desc: 'LSM-tree KV store. URL frontier, crawl metadata, dedup hashes, link graph edges, content hashes.' },
    { id: 'bleve',   label: 'Bleve Index',     sub: 'Full-text search',    x: 0.38, y: 0.72, color: green, layer: 'store',
      desc: 'BM25-weighted full-text index. Field boosts: title 3x, description 1.5x, anchor 2x. StaticScore per doc.' },
    { id: 'links',   label: 'Link Graph',      sub: 'PageRank edges',      x: 0.62, y: 0.72, color: green, layer: 'store',
      desc: 'Directed edge store for PageRank. Inbound/outbound counts. Cross-domain links weighted 1.5x.' },
    { id: 'trust',   label: 'Trust Store',      sub: 'Reputation DB',       x: 0.86, y: 0.72, color: purple, layer: 'trust',
      desc: 'Peer reputation scores, spam reports, domain flags. Auto-quarantine below 0.15 trust score.' },
  ];

  // Edges — data flows between nodes
  const archEdges = [
    // App -> Storage
    { from: 'crawler', to: 'badger',  label: 'URLs' },
    { from: 'indexer', to: 'bleve',   label: 'docs' },
    { from: 'indexer', to: 'links',   label: 'edges' },
    { from: 'search',  to: 'bleve',   label: 'query' },
    { from: 'api',     to: 'trust',   label: 'reports' },

    // App <-> App
    { from: 'crawler', to: 'indexer', label: 'pages' },
    { from: 'api',     to: 'search',  label: 'req' },
    { from: 'api',     to: 'crawler', label: 'seeds' },

    // App <-> P2P
    { from: 'crawler', to: 'gossip',  label: 'URLs' },
    { from: 'search',  to: 'streams', label: 'fanout' },
    { from: 'indexer', to: 'shard',   label: 'assign' },
    { from: 'indexer', to: 'replica', label: 'push' },

    // P2P internal
    { from: 'dht',     to: 'gossip',  label: 'peers' },
    { from: 'gossip',  to: 'streams', label: 'discover' },
    { from: 'shard',   to: 'replica', label: 'catalog' },

    // P2P -> Storage
    { from: 'gossip',  to: 'trust',   label: 'spam' },
    { from: 'replica', to: 'badger',  label: 'sync' },
  ];

  // Compute pixel positions
  const nodeW = 100, nodeH = 50, nodeR = 8;
  const nodes = archNodes.map(n => ({
    ...n,
    px: n.x * W - nodeW / 2,
    py: n.y * H - nodeH / 2,
    cx: n.x * W,
    cy: n.y * H,
  }));

  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });

  // Particles for data flow animation
  let particles = [];
  let hoveredNode = null;
  let time = 0;

  function spawnParticles(fromId, toId, color) {
    const a = nodeMap[fromId], b = nodeMap[toId];
    if (!a || !b) return;
    particles.push({
      x: a.cx, y: a.cy,
      tx: b.cx, ty: b.cy,
      progress: 0,
      speed: 0.012 + Math.random() * 0.008,
      color: color,
      size: 3 + Math.random() * 2,
    });
  }

  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    time++;

    // Layer bands
    const layers = [
      { y: 0, h: H * 0.26, label: 'APPLICATION', color: accent() },
      { y: H * 0.27, h: H * 0.26, label: 'P2P NETWORK', color: blue() },
      { y: H * 0.58, h: H * 0.30, label: 'STORAGE', color: green() },
    ];
    for (const layer of layers) {
      ctx.fillStyle = hexToRgba(layer.color, 0.03);
      ctx.fillRect(0, layer.y, W, layer.h);
      ctx.fillStyle = hexToRgba(layer.color, 0.15);
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(layer.label, 8, layer.y + 16);
    }

    // Draw edges
    for (const edge of archEdges) {
      const a = nodeMap[edge.from], b = nodeMap[edge.to];
      if (!a || !b) continue;

      const isHighlighted = hoveredNode && (hoveredNode.id === edge.from || hoveredNode.id === edge.to);
      const alpha = hoveredNode ? (isHighlighted ? 0.6 : 0.06) : 0.15;

      ctx.strokeStyle = hexToRgba(isHighlighted ? accent() : border(), alpha);
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.setLineDash(isHighlighted ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(a.cx, a.cy);
      ctx.lineTo(b.cx, b.cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Edge label on hover
      if (isHighlighted && edge.label) {
        const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
        ctx.fillStyle = hexToRgba(accent(), 0.7);
        ctx.font = '9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(edge.label, mx, my - 5);
      }
    }

    // Draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.progress += p.speed;
      if (p.progress >= 1) { particles.splice(i, 1); continue; }
      p.x = p.x + (p.tx - p.x) * p.speed * 2;
      p.y = p.y + (p.ty - p.y) * p.speed * 2;

      const alpha = p.progress < 0.1 ? p.progress * 10 : p.progress > 0.8 ? (1 - p.progress) * 5 : 1;
      ctx.fillStyle = hexToRgba(p.color, alpha * 0.8);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw nodes
    for (const node of nodes) {
      const isHovered = hoveredNode && hoveredNode.id === node.id;
      const isConnected = hoveredNode && archEdges.some(e =>
        (e.from === hoveredNode.id && e.to === node.id) ||
        (e.to === hoveredNode.id && e.from === node.id)
      );
      const isDimmed = hoveredNode && !isHovered && !isConnected;

      const alpha = isDimmed ? 0.25 : 1;

      // Shadow on hover
      if (isHovered) {
        ctx.shadowColor = hexToRgba(node.color(), 0.4);
        ctx.shadowBlur = 16;
      }

      // Node body
      drawRoundedRect(node.px, node.py, nodeW, nodeH, nodeR);
      ctx.fillStyle = hexToRgba(bgCard(), alpha);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(node.color(), isHovered ? 0.9 : isDimmed ? 0.15 : 0.5);
      ctx.lineWidth = isHovered ? 2.5 : 1.5;
      ctx.stroke();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Top accent line
      ctx.fillStyle = hexToRgba(node.color(), isHovered ? 0.9 : isDimmed ? 0.15 : 0.6);
      drawRoundedRect(node.px, node.py, nodeW, 3, nodeR);
      ctx.fill();

      // Label
      ctx.fillStyle = hexToRgba(textPri(), alpha);
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.cx, node.cy - 2);

      // Sub-label
      ctx.fillStyle = hexToRgba(textSec(), alpha * 0.7);
      ctx.font = '9px system-ui';
      ctx.fillText(node.sub, node.cx, node.cy + 12);
    }

    // Spawn ambient particles periodically
    if (time % 40 === 0) {
      const edge = archEdges[Math.floor(Math.random() * archEdges.length)];
      const a = nodeMap[edge.from];
      if (a) spawnParticles(edge.from, edge.to, a.color());
    }

    // Spawn burst on hover
    if (hoveredNode && time % 12 === 0) {
      const connected = archEdges.filter(e => e.from === hoveredNode.id || e.to === hoveredNode.id);
      for (const e of connected) {
        spawnParticles(e.from, e.to, hoveredNode.color());
      }
    }

    requestAnimationFrame(draw);
  }

  // Hit testing
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);

    let found = null;
    for (const node of nodes) {
      if (mx >= node.px && mx <= node.px + nodeW && my >= node.py && my <= node.py + nodeH) {
        found = node;
        break;
      }
    }

    if (found !== hoveredNode) {
      hoveredNode = found;
      canvas.style.cursor = found ? 'pointer' : 'default';

      if (found && tooltip) {
        tooltip.innerHTML = `<strong>${found.label}</strong><span>${found.desc}</span>`;
        tooltip.style.display = 'block';
        tooltip.style.left = Math.min(e.clientX - rect.left + 12, W - 260) + 'px';
        tooltip.style.top = (e.clientY - rect.top + 12) + 'px';
      } else if (tooltip) {
        tooltip.style.display = 'none';
      }
    } else if (found && tooltip) {
      tooltip.style.left = Math.min(e.clientX - rect.left + 12, W - 260) + 'px';
      tooltip.style.top = (e.clientY - rect.top + 12) + 'px';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoveredNode = null;
    if (tooltip) tooltip.style.display = 'none';
  });

  // Click to show modal detail
  canvas.addEventListener('click', () => {
    if (!hoveredNode) return;
    const n = hoveredNode;
    const connected = archEdges
      .filter(e => e.from === n.id || e.to === n.id)
      .map(e => {
        const other = e.from === n.id ? nodeMap[e.to] : nodeMap[e.from];
        const dir = e.from === n.id ? '\u2192' : '\u2190';
        return `<li>${dir} <strong>${other.label}</strong> <span style="color:var(--text-muted)">(${e.label})</span></li>`;
      }).join('');

    showModal(n.label, `
      <p>${n.desc}</p>
      <h4 style="margin-top:16px">Connections</h4>
      <ul style="list-style:none;padding:0;margin:8px 0">${connected}</ul>
    `);
  });

  draw();
  window.addEventListener('themechange', () => {});
}
