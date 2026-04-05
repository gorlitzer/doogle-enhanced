package node

import (
	"context"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dgraph-io/badger/v4"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"

	"github.com/doogle/doogle-v2/internal/api"
	"github.com/doogle/doogle-v2/internal/crawler"
	"github.com/doogle/doogle-v2/internal/fleet"
	"github.com/doogle/doogle-v2/internal/geo"
	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/indexer"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/p2p"
	"github.com/doogle/doogle-v2/internal/search"
	"github.com/doogle/doogle-v2/internal/store"
	"github.com/doogle/doogle-v2/internal/updater"
	"github.com/doogle/doogle-v2/pkg/urlutil"
)

// Node is the main orchestrator — it wires together all subsystems.
type Node struct {
	cfg       *Config
	host      host.Host
	peerID    peer.ID
	discovery *p2p.Discovery
	gossip    *p2p.Gossip
	crawler   *crawler.Crawler
	indexer   *indexer.Indexer
	scheduler *crawler.Scheduler
	search    *search.DistributedSearch
	localEng  *search.Engine
	bleveIdx  *index.BleveStore
	badger    *store.BadgerStore
	urlStore  *store.URLStore
	linkStore *store.LinkStore
	pageRank  *indexer.PageRankComputer
	apiServer *api.Server
	shards    *index.ShardManager

	// New stores and subsystems
	dedupStore    *store.DedupStore
	contentStore  *store.ContentStore
	genStore      *store.GenerationStore
	batchIndexer  *index.BatchIndexer
	incremental   *indexer.IncrementalIndexer
	rebalancer    *index.Rebalancer

	// Intelligence (Phase 4)
	trendStore   *store.TrendStore
	entityStore  *store.EntityStore
	clickStore   *store.ClickStore
	clusterStore *store.ClusterStore

	// Trust & safety
	trustStore      *store.TrustStore
	trustManager    *TrustManager
	urlFilter       *URLFilter
	auditTrail      *AuditTrail
	gossipLimiter   *PeerRateLimiter
	reportLimiter   *PeerRateLimiter

	// Master profile
	profileStore    *store.ProfileStore
	profileComputer *ProfileComputer

	// Fleet management
	fleetStore    *store.FleetStore
	coordinator   *fleet.Coordinator
	worker        *fleet.Worker
	fleetAPIToken string

	// Peer name resolution
	peerNames   map[string]string // peer ID → node name
	peerNamesMu sync.RWMutex

	// Resource limit enforcement
	crawlerPausedForLimits atomic.Bool

	// Light node: queries served counter + peer relay info
	queriesServed atomic.Int64
	peerRelayInfo   map[string]relayInfo
	peerRelayInfoMu sync.RWMutex

	// Peer geolocation (GeoIP)
	geoService  *geo.Service
	peerGeo     map[string]string // peer ID → country code (ISO alpha-2)
	peerGeoMu   sync.RWMutex
	selfCountry string

	// Peer version tracking
	peerVersions   map[string]string // peer ID → version string
	peerVersionsMu sync.RWMutex
	updateNeeded   atomic.Bool // set when a peer requires a newer compat level than ours

	// Neural embedding management
	embeddingMu      sync.RWMutex
	activeEmbedder   index.TextEmbedder // currently active embedder
	fallbackEmbedder index.TextEmbedder // TF-IDF fallback (always available)

	// Crawl coordination counters
	forwardedTasks atomic.Int64
	receivedTasks  atomic.Int64

	startedAt time.Time
	ctx       context.Context
	cancel    context.CancelFunc
}

// relayInfo tracks light-node stats learned from ShardCatalog broadcasts.
type relayInfo struct {
	PeerID        string
	NodeName      string
	Country       string
	DocCount      int
	QueriesServed int64
	LastSeen      time.Time
}

// IsLight returns true if this node is running in light mode.
func (n *Node) IsLight() bool {
	return n.cfg.LightNode
}

// New creates and initializes a Doogle node.
func New(cfg *Config) (*Node, error) {
	// Check for persisted low-resource setting
	if saved := LoadLowResource(cfg.Storage.DataDir); saved {
		cfg.LowResource = true
	}

	if cfg.LowResource {
		ApplyLowResourceDefaults(cfg)
		slog.Info("node: running in low-resource (Eco) mode")
	}

	// Check for persisted light-node setting
	if saved := LoadLightNode(cfg.Storage.DataDir); saved {
		cfg.LightNode = true
	}
	if cfg.LightNode {
		ApplyLightNodeDefaults(cfg)
		slog.Info("node: running in light mode (search + relay only)")
	}

	ctx, cancel := context.WithCancel(context.Background())

	n := &Node{
		cfg:           cfg,
		peerNames:     make(map[string]string),
		peerRelayInfo: make(map[string]relayInfo),
		peerGeo:       make(map[string]string),
		peerVersions:  make(map[string]string),
		startedAt:     time.Now(),
		ctx:           ctx,
		cancel:        cancel,
	}

	if err := n.init(); err != nil {
		cancel()
		return nil, err
	}

	return n, nil
}

func (n *Node) init() error {
	dataDir := n.cfg.Storage.DataDir

	// 1. Identity
	privKey, peerID, err := LoadOrCreateIdentity(dataDir)
	if err != nil {
		return fmt.Errorf("identity: %w", err)
	}
	n.peerID = peerID
	slog.Info("node: peer ID", "peer_id", peerID)

	// 1b. Restore persisted node name (if not set via flag/config)
	if n.cfg.NodeName == "" {
		if saved := LoadNodeName(dataDir); saved != "" {
			n.cfg.NodeName = saved
			slog.Info("node: restored name", "name", saved)
		}
	}
	if n.cfg.NodeName == "" {
		n.cfg.NodeName = GenerateNodeName()
		_ = SaveNodeName(dataDir, n.cfg.NodeName)
		slog.Info("node: generated name", "name", n.cfg.NodeName)
	}

	// 1c. Restore persisted resource limits
	if saved := LoadLimits(dataDir); saved != nil {
		n.cfg.Storage.MaxStorageBytes = saved.MaxStorageBytes
		n.cfg.Storage.MaxDocuments = saved.MaxDocuments
		n.cfg.Storage.MaxQueueSize = saved.MaxQueueSize
		slog.Info("node: restored resource limits",
			"max_storage", saved.MaxStorageBytes,
			"max_docs", saved.MaxDocuments,
			"max_queue", saved.MaxQueueSize)
	}

	// 2. libp2p host
	h, err := p2p.NewHost(n.ctx, privKey, n.cfg.P2P.Port)
	if err != nil {
		return fmt.Errorf("p2p host: %w", err)
	}
	n.host = h

	// 3. Pre-init shard manager so discovery callbacks can use it immediately.
	n.shards = index.NewShardManager()

	// 4. Discovery (DHT + mDNS + IPFS routing discovery)
	disc, err := p2p.NewDiscovery(n.ctx, h, p2p.DiscoveryConfig{
		BootstrapPeers:       n.cfg.P2P.BootstrapPeers,
		EnableMDNS:           n.cfg.P2P.MDNS,
		EnableDHTDiscovery:   n.cfg.P2P.DHTDiscovery,
		DHTRendezvous:        n.cfg.P2P.DHTRendezvous,
		DHTDiscoveryInterval: n.cfg.P2P.DHTDiscoveryInterval,
		DHTMaxPeers:          n.cfg.P2P.DHTMaxPeers,
		OnDooglePeerConnected: func(pid peer.ID) {
			pidStr := pid.String()
			n.shards.AddNode(pidStr)
			h.ConnManager().Protect(pid, "doogle")
			slog.Debug("shard ring: added Doogle peer", "peer", pidStr[:12], "total", n.shards.NodeCount())
			// Send our catalog directly so the peer learns our name immediately.
			go n.sendCatalogToPeer(pid)
			// Geolocate the peer from their multiaddrs (first-seen semantics).
			if n.geoService != nil {
				go func() {
					if n.PeerGeo(pidStr) != "" {
						return
					}
					addrs := h.Peerstore().Addrs(pid)
					if country := n.geoService.CountryFromAddrs(addrs); country != "" {
						n.setPeerGeo(pidStr, country)
						slog.Debug("geo: peer geolocated", "peer", pidStr[:12], "country", country)
					}
				}()
			}
		},
	})
	if err != nil {
		return fmt.Errorf("discovery: %w", err)
	}
	n.discovery = disc

	// 4a. Detect this node's country from its public addresses.
	if n.geoService != nil {
		n.selfCountry = n.geoService.SelfCountry(n.host)
		if n.selfCountry != "" {
			slog.Info("geo: detected node country", "country", n.selfCountry)
		}
	}

	// 4. GossipSub (URL frontier + shard catalog)
	gossip, err := p2p.NewGossip(n.ctx, h)
	if err != nil {
		return fmt.Errorf("gossip: %w", err)
	}
	n.gossip = gossip

	// 5. Storage
	badgerPath := filepath.Join(dataDir, n.cfg.Storage.BadgerDir)
	bs, err := store.NewBadgerStore(badgerPath, n.cfg.LowResource)
	if err != nil {
		return fmt.Errorf("badger: %w", err)
	}
	n.badger = bs

	// 5-restore. Restore persisted peer names and geo from previous runs.
	n.loadPeerNames()
	n.loadPeerGeo()
	n.loadPeerVersions()

	// 5-geo. Load GeoLite2 database for peer geolocation.
	geoDBPath := filepath.Join(dataDir, "GeoLite2-Country.mmdb")
	if geoSvc, err := geo.Open(geoDBPath); err == nil {
		n.geoService = geoSvc
		slog.Info("geo: loaded GeoLite2 database", "path", geoDBPath)
	} else {
		slog.Warn("geo: GeoLite2 database not found — peer geolocation disabled", "path", geoDBPath)
	}

	// 5a. Foundation stores (crawl-only — skip for light nodes)
	isLight := n.cfg.LightNode
	if !isLight {
		n.dedupStore = store.NewDedupStore(bs)
		if n.cfg.Storage.SeenTTL > 0 {
			n.dedupStore.SeenTTL = n.cfg.Storage.SeenTTL
		}
		n.urlStore = store.NewURLStore(bs, n.dedupStore)
		n.linkStore = store.NewLinkStore(bs)
		n.contentStore = store.NewContentStore(bs)
	}

	genStore, err := store.NewGenerationStore(bs)
	if err != nil {
		return fmt.Errorf("generation store: %w", err)
	}
	n.genStore = genStore

	// 5b. Trust store and manager
	n.trustStore = store.NewTrustStore(bs)
	n.trustManager = NewTrustManager(n.trustStore, peerID.String())

	// 5b2. URL filter (operator-defined allowlist/denylist)
	n.urlFilter = NewURLFilter(n.cfg.Trust)

	// 5b3. Audit trail (Ed25519 signed, hash-chained reports)
	if rawKey, err := privKey.Raw(); err == nil {
		// libp2p Ed25519 raw key is 64 bytes (seed + public)
		if len(rawKey) == 64 {
			n.auditTrail = NewAuditTrail(bs, rawKey)
		}
	}

	// 5b4. Gossip rate limiter (malicious crawl defense)
	// Allow 100 messages per 30s window, block offenders for 5 minutes
	n.gossipLimiter = NewPeerRateLimiter(100, 30*time.Second, 5*time.Minute)

	// 5b5. Report rate limiter (flood defense)
	// Allow 10 reports per minute, block offenders for 5 minutes
	n.reportLimiter = NewPeerRateLimiter(10, 1*time.Minute, 5*time.Minute)

	// 5c. Profile store
	n.profileStore = store.NewProfileStore(bs)

	// 5d. Intelligence stores (Phase 4)
	n.trendStore = store.NewTrendStore(bs)
	n.entityStore = store.NewEntityStore(bs)
	n.clickStore = store.NewClickStore(bs)
	n.clusterStore = store.NewClusterStore(bs)

	// 6. Bleve index
	blevePath := filepath.Join(dataDir, n.cfg.Index.BleveDir)
	bleveIdx, err := index.NewBleveStore(blevePath)
	if err != nil {
		return fmt.Errorf("bleve: %w", err)
	}
	n.bleveIdx = bleveIdx

	// 7. Shard manager — add self (ring was pre-created before discovery)
	n.shards.AddNode(peerID.String())

	// 7a. Register network notifiee for peer connect/disconnect handling.
	// ConnectedF catches inbound connections from Doogle peers that this
	// node didn't initiate (e.g. the remote peer found us via mDNS/DHT
	// before our own discovery round ran). Without this, the shard ring
	// on the receiving side would miss the peer until the next DHT poll.
	h.Network().Notify(&network.NotifyBundle{
		ConnectedF: func(_ network.Network, conn network.Conn) {
			remotePeer := conn.RemotePeer()
			pid := remotePeer.String()
			if n.shards.HasNode(pid) {
				return // already known
			}
			// The identify protocol runs asynchronously after the
			// connection is established. Wait briefly, then check
			// whether the remote peer speaks any /doogle/* protocol.
			go func() {
				select {
				case <-time.After(3 * time.Second):
				case <-n.ctx.Done():
					return
				}
				protos, err := h.Peerstore().GetProtocols(remotePeer)
				if err != nil {
					return
				}
				for _, proto := range protos {
					if strings.HasPrefix(string(proto), "/doogle/") {
						n.shards.AddNode(pid)
						h.ConnManager().Protect(remotePeer, "doogle")
						slog.Debug("shard ring: added Doogle peer (inbound)", "peer", pid[:12], "total", n.shards.NodeCount())
						// Send our catalog so the peer learns our name immediately.
						n.sendCatalogToPeer(remotePeer)
						return
					}
				}
			}()
		},
		DisconnectedF: func(_ network.Network, conn network.Conn) {
			remotePeer := conn.RemotePeer()
			pid := remotePeer.String()
			if !n.shards.HasNode(pid) {
				return // not a Doogle peer, ignore
			}
			h.ConnManager().Unprotect(remotePeer, "doogle")
			n.shards.RemoveNode(pid)
			// Keep peer name in memory for leaderboard (persisted in badger too).
			slog.Debug("shard ring: removed Doogle peer", "peer", pid[:12], "total", n.shards.NodeCount())
		},
	})

	// 8. Batch indexer
	n.batchIndexer = index.NewBatchIndexer(
		bleveIdx,
		n.cfg.Index.BatchSize,
		n.cfg.Index.BatchFlushInterval,
	)

	// 9. Indexer + PageRank
	n.indexer = indexer.New(bleveIdx, n.batchIndexer, n.genStore, n.badger)
	if !isLight {
		n.pageRank = indexer.NewPageRankComputer(n.linkStore, bleveIdx, n.cfg.Index.PageRankInterval)
	}

	// 9a0. Wire intelligence subsystems into indexer
	n.indexer.SetEntityStore(n.entityStore)

	// 9a0b. Embedder + vector store for semantic search
	baseEmbedder := index.NewTFIDFEmbedder()
	multiEmbedder := index.NewMultilingualEmbedder(baseEmbedder)
	n.fallbackEmbedder = multiEmbedder
	n.activeEmbedder = multiEmbedder

	if n.cfg.Index.OllamaURL != "" {
		n.activeEmbedder = index.NewOllamaEmbedder(n.cfg.Index.OllamaURL, n.cfg.Index.OllamaModel, multiEmbedder)
	} else if n.cfg.Index.EmbeddingURL != "" {
		n.activeEmbedder = index.NewHTTPEmbedder(n.cfg.Index.EmbeddingURL, multiEmbedder)
	}

	vectorStore := index.NewBadgerVectorStore(n.badger.DB(), 384)
	n.indexer.SetEmbedder(n.activeEmbedder)
	n.indexer.SetVectorStore(vectorStore)

	// 9a. Content verification — sign documents with Ed25519
	if rawKey, err := privKey.Raw(); err == nil && len(rawKey) == 64 {
		n.indexer.SetContentVerifier(indexer.NewContentVerifier(rawKey))
	}

	// 9b. Profile computer
	n.profileComputer = NewProfileComputer(n.profileStore, bleveIdx, n.shards)
	n.profileComputer.UptimeHoursFn = func() float64 {
		return time.Since(n.startedAt).Hours()
	}
	n.profileComputer.ConnectedPeersFn = func() int {
		return n.shards.NodeCount() - 1 // exclude self
	}
	n.profileComputer.IndexedDocsFn = func() int {
		c, _ := bleveIdx.DocCount()
		return int(c)
	}

	// 10. Incremental indexer (crawl-only — skip for light nodes)
	if !isLight {
		n.incremental = indexer.NewIncrementalIndexer(
			bleveIdx,
			n.contentStore,
			n.genStore,
			n.batchIndexer,
			n.cfg.Index.IncrementalInterval,
		)
	}

	// 11. Crawler with callback (crawl-only — skip for light nodes)
	if !isLight {
		n.scheduler = crawler.NewScheduler(n.urlStore, 10000)
		if n.cfg.Storage.MaxQueueSize > 0 {
			n.scheduler.SetMaxQueueSize(n.cfg.Storage.MaxQueueSize)
		}
		n.crawler = crawler.New(crawler.Config{
			Workers:           n.cfg.Crawler.Workers,
			UserAgent:         n.cfg.Crawler.UserAgent,
			RequestTimeout:    n.cfg.Crawler.RequestTimeout,
			RateLimit:         n.cfg.Crawler.RateLimit,
			MaxDepth:          n.cfg.Crawler.MaxDepth,
			RespectRobots:     n.cfg.Crawler.RespectRobots,
			EnableHeadless:    n.cfg.Crawler.EnableHeadless,
			HeadlessThreshold: n.cfg.Crawler.HeadlessThreshold,
			HeadlessTimeout:   n.cfg.Crawler.HeadlessTimeout,
			MaxBodyBytes:      n.cfg.Crawler.MaxBodyBytes,
			StatsStore:        n.urlStore,
		}, n.scheduler, n.onDocumentCrawled)
	}

	// 11b. Wire reputation-weighted search ranking (graduated tiers)
	search.PeerTrustFn = n.trustManager.TrustScore
	search.PeerTierFn = func(peerID string) string {
		score := n.trustManager.TrustScore(peerID)
		rep, _ := n.trustStore.GetReputation(peerID)
		qCount, strikes := 0, 0
		if rep != nil {
			qCount = rep.QuarantineCount
			strikes = rep.Strikes
		}
		return ComputeTier(score, qCount, strikes)
	}

	// 12. Search engines (shard-aware distributed search)
	n.localEng = search.NewEngine(bleveIdx)
	n.localEng.QuarantinedPeersFn = func() []string {
		quarantined, err := n.trustStore.QuarantinedPeers()
		if err != nil {
			return nil
		}
		ids := make([]string, 0, len(quarantined))
		for _, rep := range quarantined {
			ids = append(ids, rep.PeerID)
		}
		return ids
	}
	n.localEng.DocQuarantineFn = func(docID string) (bool, string) {
		q := n.trustStore.GetDocQuarantine(docID)
		if q == nil || q.Resolved {
			return false, ""
		}
		return true, q.Reason
	}
	n.search = search.NewDistributedSearch(
		h, n.localEng, n.shards,
		n.cfg.Index.ReplicationFactor,
		n.cfg.Search.PeerTimeout,
		n.cfg.Search.MaxPeers,
		n.cfg.Search.CacheSize,
		n.cfg.Search.CacheTTL,
	)
	n.search.PeerNameFn = n.PeerName
	n.search.LocalName = n.cfg.NodeName
	n.search.LocalID = n.peerID.String()

	// 12-searxng. Load persisted SearXNG settings and initialize client
	if saved := LoadSearXNG(dataDir); saved != nil {
		n.cfg.Search.SearXNG.Enabled = saved.Enabled
		if saved.URL != "" {
			n.cfg.Search.SearXNG.URL = saved.URL
		}
	}
	sxCfg := n.cfg.Search.SearXNG
	if sxCfg.Enabled {
		if sxCfg.URL == "" || sxCfg.URL == "auto" {
			n.search.SearXNG = search.NewSearXNGClientAuto(
				sxCfg.Timeout, sxCfg.MaxResults,
				sxCfg.Categories, sxCfg.ScorePenalty,
			)
			slog.Info("searxng: external metasearch enabled (auto, public instances)",
				"fallback_only", sxCfg.FallbackOnly)
		} else {
			n.search.SearXNG = search.NewSearXNGClient(
				sxCfg.URL, sxCfg.Timeout, sxCfg.MaxResults,
				sxCfg.Categories, sxCfg.ScorePenalty,
			)
			slog.Info("searxng: external metasearch enabled (custom)",
				"url", sxCfg.URL, "fallback_only", sxCfg.FallbackOnly)
		}
		n.search.SearXNGFallback = sxCfg.FallbackOnly
		n.search.SearXNGThreshold = sxCfg.Threshold
	}

	// 12a. Wire intelligence into search engine
	hybridSearcher := index.NewHybridSearcher(bleveIdx, vectorStore, n.activeEmbedder, 0.7, 0.3)
	n.localEng.SetHybridSearcher(hybridSearcher)
	n.localEng.SetEntityStore(n.entityStore)
	n.localEng.SetClusterComputer(n.clusterStore)

	// 12b. Hash ring rebalancer — transfers documents when topology changes
	n.rebalancer = index.NewRebalancer(n.shards, bleveIdx, peerID.String(), n.cfg.Index.ReplicationFactor,
		func(ctx context.Context, peerIDStr string, docs []*index.IndexDocument) (int, error) {
			pid, err := peer.Decode(peerIDStr)
			if err != nil {
				return 0, err
			}
			// Convert IndexDocuments to models.Documents for replication
			modelDocs := make([]*models.Document, 0, len(docs))
			for _, d := range docs {
				modelDocs = append(modelDocs, &models.Document{
					ID:           d.ID,
					URL:          d.URL,
					Domain:       d.Domain,
					Title:        d.Title,
					Description:  d.Description,
					Content:      d.Content,
					ContentHash:  d.ContentHash,
					ContentSize:  d.ContentSize,
					StatusCode:   d.StatusCode,
					Depth:        d.Depth,
					WordCount:    d.WordCount,
					CrawledAt:    d.CrawledAt,
					OriginPeerID: d.OriginPeerID,
				})
			}
			req := &p2p.ReplicateRequest{
				Documents:  modelDocs,
				Generation: n.genStore.Current(),
			}
			resp, err := p2p.ReplicateDocuments(ctx, n.host, pid, req, 30*time.Second)
			if err != nil {
				return 0, err
			}
			return resp.Accepted, nil
		},
	)

	// Initialize spell checker from Bleve index dictionary
	spellChecker := search.NewSpellChecker(bleveIdx.BleveIndex())
	n.localEng.SetSpellChecker(spellChecker)
	spellChecker.StartRefresh(n.ctx, bleveIdx.BleveIndex(), 30*time.Minute)

	// 13. Register P2P protocol handlers
	p2p.RegisterSearchProtocol(h, n.handlePeerSearch)
	if !isLight {
		p2p.RegisterCrawlProtocol(h, n.handlePeerCrawlTask)
		p2p.RegisterIndexProtocol(h, n.handlePeerIndexDoc)
	}
	p2p.RegisterShardProtocol(h, n.handleShardCatalog)
	p2p.RegisterReplicateProtocol(h, n.handleReplicateRequest)
	p2p.RegisterAntiEntropyProtocol(h, n.handleAntiEntropyRequest)

	// 14. Fleet management (must be before API server so bind can be overridden)
	if err := n.initFleet(); err != nil {
		return fmt.Errorf("fleet: %w", err)
	}

	// 15. HTTP API
	crawlSeedFn := n.routeSeedURL
	if isLight {
		crawlSeedFn = func(url string) {} // no-op for light nodes
	}
	deps := &api.Deps{
		Search:       n.search,
		StatusFn:     n.Status,
		CrawlSeed:    crawlSeedFn,
		CrawlerInfo:  n.CrawlerInfo,
		CrawlerFeed:  func(afterSeq uint64) []models.CrawlEvent { if n.crawler != nil { return n.crawler.RecentEvents(afterSeq) }; return nil },
		IndexerStats: n.IndexerStats,
		PeersInfo:    n.PeersInfo,
		IndexStore:   bleveIdx,
		ReportURL:    n.ReportURL,
		TrustSummary: n.trustManager.Summary,
		SetNodeName: func(name string) {
			n.cfg.NodeName = name
			n.search.LocalName = name
			_ = SaveNodeName(dataDir, name)
		},
		DataDir:            dataDir,
		StorageFn:          n.StorageInfo,
		LeaderboardFn:      n.Leaderboard,
		DomainOwnershipFn:  n.DomainOwnership,
		ProfileFn: func() *models.MasterProfile {
			p, _ := n.profileStore.Get()
			return p
		},
		RecordInterestsFn: n.profileStore.RecordInterests,
		RecordSearchFn: func(query string) {
			cat := ClassifyQuery(query)
			if cat != "" {
				_ = n.profileStore.RecordSearchTopic(cat)
			}
			// Track query trends
			if n.trendStore != nil {
				terms := strings.Fields(strings.ToLower(query))
				n.trendStore.IncrementQuery(terms)
			}
		},
	}
	// Relay leaderboard
	deps.RelayLeaderboardFn = n.RelayLeaderboard

	// Intelligence deps (Phase 4)
	deps.TrendsFn = func() *models.TrendsResponse {
		return &models.TrendsResponse{
			TrendingQueries: toModelTrends(n.trendStore.TrendingQueries(20)),
			TrendingDomains: toModelTrends(n.trendStore.TrendingDomains(20)),
			ComputedAt:      time.Now(),
		}
	}
	deps.SuggestFn = func(prefix string, limit int) []string {
		prefix = strings.ToLower(strings.TrimSpace(prefix))
		if prefix == "" {
			return nil
		}
		seen := make(map[string]bool)
		var suggestions []string

		// Source 1: popular queries from click store
		if n.clickStore != nil {
			for _, q := range n.clickStore.PopularQueries(200) {
				if strings.HasPrefix(strings.ToLower(q), prefix) && !seen[q] {
					seen[q] = true
					suggestions = append(suggestions, q)
				}
			}
		}

		// Source 2: trending queries
		if n.trendStore != nil {
			for _, t := range n.trendStore.TrendingQueries(50) {
				q := t.Name
				if strings.HasPrefix(strings.ToLower(q), prefix) && !seen[q] {
					seen[q] = true
					suggestions = append(suggestions, q)
				}
			}
		}

		if len(suggestions) > limit {
			suggestions = suggestions[:limit]
		}
		return suggestions
	}

	deps.ClickFn = func(query, url string, position int) error {
		n.clickStore.RecordClick(query, url, position)
		return nil
	}
	deps.ImpressionFn = func(query, url string, position int) error {
		return n.clickStore.RecordImpression(query, url, position)
	}
	deps.DwellFn = func(query, url string, dwellMs int64) error {
		return n.clickStore.RecordDwell(query, url, dwellMs)
	}
	deps.PogoStickFn = func(query, url string) error {
		return n.clickStore.RecordPogoStick(query, url)
	}

	// Trust admin operations
	deps.UnquarantineFn = n.trustManager.Unquarantine
	deps.DismissReportFn = n.trustManager.DismissReport
	deps.ConfirmReportFn = n.trustManager.ConfirmReport
	deps.UnblockDomainFn = n.trustStore.UnblockDomain
	deps.VoteDocQuarantineFn = func(url string, confirm bool) error {
		docID := models.DocumentID(url)
		_, err := n.trustStore.VoteDocQuarantine(docID, confirm)
		return err
	}
	if n.auditTrail != nil {
		deps.AuditTrailFn = func(limit int) []interface{} {
			return n.auditTrailEntries(limit)
		}
	}

	// Resource limits deps
	deps.GetLimitsFn = func() *api.LimitsResponse {
		docCount, _ := n.bleveIdx.DocCount()
		storageBytes := dirSize(n.cfg.Storage.DataDir)
		var queueSize int64
		if n.scheduler != nil {
			queueSize = int64(n.scheduler.Pending())
		}
		var crawlerPaused bool
		if n.crawler != nil {
			crawlerPaused = n.crawler.IsPaused()
		}
		return &api.LimitsResponse{
			MaxStorageBytes: n.cfg.Storage.MaxStorageBytes,
			MaxDocuments:    n.cfg.Storage.MaxDocuments,
			MaxQueueSize:    n.cfg.Storage.MaxQueueSize,
			UsedStorage:     storageBytes,
			UsedDocuments:   int64(docCount),
			UsedQueue:       queueSize,
			CrawlerPaused:   crawlerPaused,
		}
	}
	deps.SetLimitsFn = func(req *api.LimitsRequest) error {
		if req.MaxStorageBytes != nil {
			n.cfg.Storage.MaxStorageBytes = *req.MaxStorageBytes
		}
		if req.MaxDocuments != nil {
			n.cfg.Storage.MaxDocuments = *req.MaxDocuments
		}
		if req.MaxQueueSize != nil {
			n.cfg.Storage.MaxQueueSize = *req.MaxQueueSize
			if n.scheduler != nil {
				n.scheduler.SetMaxQueueSize(*req.MaxQueueSize)
			}
		}
		return SaveLimits(dataDir, &ResourceLimits{
			MaxStorageBytes: n.cfg.Storage.MaxStorageBytes,
			MaxDocuments:    n.cfg.Storage.MaxDocuments,
			MaxQueueSize:    n.cfg.Storage.MaxQueueSize,
		})
	}

	deps.VersionInfo.Version = n.cfg.Version
	deps.VersionInfo.Commit = n.cfg.Commit
	deps.VersionInfo.BuildDate = n.cfg.BuildDate

	// System info + low-resource mode
	deps.SysInfoFn = func() interface{} {
		return DetectSystemResources(dataDir, n.cfg.LowResource)
	}
	deps.SetLowResourceFn = func(enabled bool) error {
		// Persist setting — runtime config changes (BadgerDB caches, intervals)
		// require a restart. Crawler settings take effect on next restart.
		n.cfg.LowResource = enabled
		slog.Info("low-resource (Eco) mode toggled via API", "enabled", enabled)
		return SaveLowResource(dataDir, enabled)
	}

	// SearXNG admin functions
	deps.SetSearXNGFn = func(enabled bool, sxURL string) error {
		if enabled {
			sxCfg := n.cfg.Search.SearXNG
			if sxURL == "" || sxURL == "auto" {
				n.search.SearXNG = search.NewSearXNGClientAuto(
					sxCfg.Timeout, sxCfg.MaxResults,
					sxCfg.Categories, sxCfg.ScorePenalty,
				)
			} else {
				n.search.SearXNG = search.NewSearXNGClient(
					sxURL, sxCfg.Timeout, sxCfg.MaxResults,
					sxCfg.Categories, sxCfg.ScorePenalty,
				)
			}
			n.search.SearXNGFallback = sxCfg.FallbackOnly
			n.search.SearXNGThreshold = sxCfg.Threshold
		} else {
			n.search.SearXNG = nil
		}
		n.cfg.Search.SearXNG.Enabled = enabled
		n.cfg.Search.SearXNG.URL = sxURL
		slog.Info("searxng: settings updated via API", "enabled", enabled, "url", sxURL)
		return SaveSearXNG(dataDir, enabled, sxURL)
	}
	deps.GetSearXNGFn = func() map[string]interface{} {
		sxCfg := n.cfg.Search.SearXNG
		mode := "auto"
		if sxCfg.URL != "" && sxCfg.URL != "auto" {
			mode = "custom"
		}
		instance := ""
		if n.search.SearXNG != nil {
			instance = n.search.SearXNG.CurrentURL()
		}
		return map[string]interface{}{
			"enabled":       sxCfg.Enabled,
			"url":           sxCfg.URL,
			"mode":          mode,
			"instance":      instance,
			"fallback_only": sxCfg.FallbackOnly,
			"threshold":     sxCfg.Threshold,
			"score_penalty": sxCfg.ScorePenalty,
			"categories":    sxCfg.Categories,
		}
	}

	// Neural embedding management
	deps.GetEmbeddingsFn = func() map[string]interface{} {
		n.embeddingMu.RLock()
		defer n.embeddingMu.RUnlock()

		provider := "tfidf"
		url := ""
		model := ""
		healthy := true

		if httpEmb, ok := n.activeEmbedder.(*index.HTTPEmbedder); ok {
			healthy = httpEmb.IsNeural()
			if n.cfg.Index.OllamaURL != "" {
				provider = "ollama"
				url = n.cfg.Index.OllamaURL
				model = n.cfg.Index.OllamaModel
				if model == "" {
					model = "all-minilm"
				}
			} else {
				provider = "custom"
				url = n.cfg.Index.EmbeddingURL
			}
		}

		return map[string]interface{}{
			"enabled":  provider != "tfidf",
			"provider": provider,
			"url":      url,
			"model":    model,
			"healthy":  healthy,
		}
	}

	deps.SetEmbeddingsFn = func(enabled bool, provider, embURL, model string) error {
		n.embeddingMu.Lock()
		defer n.embeddingMu.Unlock()

		if !enabled {
			n.activeEmbedder = n.fallbackEmbedder
			n.cfg.Index.OllamaURL = ""
			n.cfg.Index.EmbeddingURL = ""
			n.indexer.SetEmbedder(n.fallbackEmbedder)
			slog.Info("embeddings: switched to TF-IDF")
			return nil
		}

		switch provider {
		case "ollama":
			if embURL == "" {
				embURL = "http://localhost:11434"
			}
			if model == "" {
				model = "all-minilm"
			}
			emb := index.NewOllamaEmbedder(embURL, model, n.fallbackEmbedder)
			n.activeEmbedder = emb
			n.cfg.Index.OllamaURL = embURL
			n.cfg.Index.OllamaModel = model
			n.cfg.Index.EmbeddingURL = ""
			n.indexer.SetEmbedder(emb)
			slog.Info("embeddings: switched to Ollama", "url", embURL, "model", model, "healthy", emb.IsNeural())
		case "custom":
			if embURL == "" {
				return fmt.Errorf("URL is required for custom embedding provider")
			}
			emb := index.NewHTTPEmbedder(embURL, n.fallbackEmbedder)
			n.activeEmbedder = emb
			n.cfg.Index.EmbeddingURL = embURL
			n.cfg.Index.OllamaURL = ""
			n.indexer.SetEmbedder(emb)
			slog.Info("embeddings: switched to custom", "url", embURL, "healthy", emb.IsNeural())
		default:
			return fmt.Errorf("unknown provider: %s (use ollama, custom, or tfidf)", provider)
		}
		return nil
	}

	// Wire restart function for update-restart endpoint.
	deps.RestartFn = func() {
		n.ShutdownForRestart()
		if err := updater.SelfRestart(); err != nil {
			slog.Error("self-restart failed", "error", err)
			os.Exit(1)
		}
	}

	// Wire fleet deps if coordinator.
	if n.coordinator != nil {
		deps.FleetSummary = n.coordinator.Summary
		deps.FleetGetNode = n.coordinator.GetNode
		deps.FleetProxy = n.fleetProxyHTTP
		deps.FleetAPIToken = n.fleetAPIToken
		deps.FleetUpgrade = n.fleetUpgrade
	}

	n.apiServer = api.NewServer(n.cfg.API.Bind, n.cfg.API.Port, deps)

	return nil
}

// Run starts all subsystems and blocks until context is cancelled.
func (n *Node) Run() error {
	if !n.IsLight() {
		// Start crawler
		n.crawler.Start()
	}

	// Start batch indexer background flusher
	n.batchIndexer.Start(n.ctx)

	if !n.IsLight() {
		// Start PageRank background computation
		n.pageRank.Start(n.ctx)

		// Start incremental re-scoring
		n.incremental.Start(n.ctx)
	}

	// Start profile computer
	n.profileComputer.Start(n.ctx)

	// Start trust decay (idle peers slowly lose reputation)
	n.trustManager.StartDecayLoop(n.ctx)

	// Start quarantine resolution loop (checks every 5 min for expired voting windows)
	quarantineInterval := 5 * time.Minute
	if n.cfg.LowResource {
		quarantineInterval = 15 * time.Minute
	}
	go func() {
		ticker := time.NewTicker(quarantineInterval)
		defer ticker.Stop()
		for {
			select {
			case <-n.ctx.Done():
				return
			case <-ticker.C:
				n.resolveQuarantines()
			}
		}
	}()

	// Start hash ring rebalancer
	n.rebalancer.Start(n.ctx)

	if !n.IsLight() {
		// Start learn-to-rank trainer (retrains every 6 hours from click data)
		ltrTrainer := search.NewLTRTrainer(n.clickStore, n.bleveIdx, n.badger, 6*time.Hour)
		go ltrTrainer.Run(n.ctx.Done())

		// Start re-crawl scheduler (reschedules stale URLs every 5 minutes)
		if n.contentStore != nil && n.scheduler != nil {
			recrawlSched := crawler.NewRecrawlScheduler(n.contentStore, n.scheduler)
			go recrawlSched.Run(n.ctx)
		}
	}

	// Start gossip listeners
	go n.gossipLoop()
	go n.shardCatalogLoop()
	go n.shardCatalogPublisher()
	go n.antiEntropyLoop()
	go n.spamReportLoop()
	go n.maintenanceLoop()

	// Start fleet subsystems.
	if n.coordinator != nil {
		n.coordinator.Start(n.ctx)
	}
	if n.worker != nil {
		n.worker.StartHeartbeat(n.ctx, func(ctx context.Context, req *fleet.HeartbeatRequest) error {
			coordPeerStr := n.cfg.Fleet.CoordinatorPeer
			_ = coordPeerStr
			// The coordinator peer ID is already in the peerstore from initFleetWorker.
			// We need to extract it from the worker.
			resp, err := p2p.SendFleetHeartbeat(ctx, n.host, n.worker.CoordinatorID(), req, 10*time.Second)
			if err != nil {
				return err
			}
			if resp.Status != "ok" {
				return fmt.Errorf("heartbeat rejected: %s", resp.Reason)
			}
			return nil
		})
	}

	// Start DHT routing discovery (advertise + find peers)
	n.discovery.StartAdvertising(n.ctx)
	go n.discovery.StartFindingPeers(n.ctx)

	// Add seed URLs (routed through domain ownership checks)
	if !n.IsLight() {
		for _, seed := range n.cfg.SeedURLs {
			n.routeSeedURL(seed)
		}
	}

	// Start API server (blocks)
	return n.apiServer.Start()
}

// Shutdown gracefully stops all subsystems in dependency order.
func (n *Node) Shutdown() {
	slog.Info("node: shutting down")
	n.cancel() // 1. cancel root ctx — stops background goroutines

	// 2. drain HTTP connections
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	n.apiServer.Shutdown(ctx)

	// 3. save queued crawl tasks from memory to BadgerDB
	if n.scheduler != nil {
		n.scheduler.Drain()
	}

	// 4. persist crawled count
	if n.urlStore != nil {
		_ = n.urlStore.FlushCrawledCount()
	}

	// 5. stop crawler workers + persist crawler stats
	if n.crawler != nil {
		n.crawler.Stop()
	}

	// 6. final Bleve batch flush
	n.batchIndexer.Stop()

	// 7. persist indexer stats
	n.indexer.FlushStats()

	// 8. close P2P subsystems
	n.gossip.Close()
	n.discovery.Close()
	n.host.Close()

	// 9. close Bleve index
	n.bleveIdx.Close()

	// 9a. close GeoIP service
	if n.geoService != nil {
		n.geoService.Close()
	}

	// 10. close BadgerDB last (all other stores depend on it)
	n.badger.Close()

	slog.Info("node: shutdown complete")
}

// ShutdownForRestart performs the same graceful shutdown as Shutdown but
// returns instead of calling os.Exit, so the caller can re-exec the binary.
func (n *Node) ShutdownForRestart() {
	slog.Info("node: shutting down for restart")
	n.cancel()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	n.apiServer.Shutdown(ctx)

	if n.scheduler != nil {
		n.scheduler.Drain()
	}
	if n.urlStore != nil {
		_ = n.urlStore.FlushCrawledCount()
	}
	if n.crawler != nil {
		n.crawler.Stop()
	}
	n.batchIndexer.Stop()
	n.indexer.FlushStats()
	n.gossip.Close()
	n.discovery.Close()
	n.host.Close()
	n.bleveIdx.Close()
	if n.geoService != nil {
		n.geoService.Close()
	}
	n.badger.Close()

	slog.Info("node: shutdown for restart complete")
}

// Status returns the current node status.
func (n *Node) Status() *models.NodeStatus {
	docCount, _ := n.bleveIdx.DocCount()

	// Only report Doogle peers (shard ring members), not IPFS routing peers
	dooglePeers := n.shards.AllMembers()
	peerList := make([]string, 0, len(dooglePeers))
	for _, p := range dooglePeers {
		if p != n.peerID.String() {
			peerList = append(peerList, p)
		}
	}

	localDocs, peerDocs, _ := n.bleveIdx.CountByPeer(n.peerID.String())

	nodeType := "full"
	if n.IsLight() {
		nodeType = "light"
	}

	var crawledURLs int64
	if n.urlStore != nil {
		crawledURLs = n.urlStore.CrawledCount()
	}
	var urlsInQueue int
	if n.scheduler != nil {
		urlsInQueue = n.scheduler.Pending()
	}

	status := &models.NodeStatus{
		PeerID:         n.peerID.String(),
		NodeName:       n.cfg.NodeName,
		Country:        n.selfCountry,
		NodeType:       nodeType,
		Version:        n.cfg.Version,
		Commit:         n.cfg.Commit,
		BuildDate:      n.cfg.BuildDate,
		Addrs:          multiaddrsToStrings(n.host),
		ConnectedPeers: len(peerList),
		PeerList:       peerList,
		IndexedDocs:    int(docCount),
		CrawledURLs:    crawledURLs,
		URLsInQueue:    urlsInQueue,
		Uptime:         time.Since(n.startedAt).Round(time.Second).String(),
		StartedAt:      n.startedAt,
		LocalDocs:      localDocs,
		PeerDocs:       peerDocs,
		OwnedDomains:   n.countOwnedDomains(),
		ForwardedTasks: n.forwardedTasks.Load(),
		ReceivedTasks:  n.receivedTasks.Load(),
		UpdateNeeded:   n.updateNeeded.Load(),
	}

	// Fleet info.
	if n.coordinator != nil {
		status.FleetRole = "coordinator"
		status.FleetAPIToken = n.fleetAPIToken
		status.FleetSecretFile = filepath.Join(n.cfg.Storage.DataDir, "fleet.secret")
		status.FleetSecretHex = hex.EncodeToString(n.coordinator.Secret())
	} else if n.worker != nil {
		status.FleetRole = "worker"
		status.FleetCoordinatorID = n.worker.CoordinatorID().String()
	}

	return status
}

// CrawlerInfo returns crawler configuration and stats for the admin API.
func (n *Node) CrawlerInfo() *models.CrawlerInfo {
	if n.IsLight() || n.crawler == nil {
		return &models.CrawlerInfo{}
	}
	crawled, failed, active, jsRendered := n.crawler.Stats()
	return &models.CrawlerInfo{
		Workers:       n.cfg.Crawler.Workers,
		RateLimit:     n.cfg.Crawler.RateLimit,
		MaxDepth:      n.cfg.Crawler.MaxDepth,
		UserAgent:     n.cfg.Crawler.UserAgent,
		TotalCrawled:  crawled,
		TotalFailed:   failed,
		ActiveWorkers: active,
		SeenURLs:          n.urlStore.SeenCount(),
		JSRendered:        jsRendered,
		ForwardedTasks:    n.forwardedTasks.Load(),
		ReceivedFromPeers: n.receivedTasks.Load(),
	}
}

// IndexerStats returns indexer statistics for the admin API.
func (n *Node) IndexerStats() *models.IndexerInfo {
	return n.indexer.Stats()
}

// StorageInfo returns disk usage stats for the data directory.
func (n *Node) StorageInfo() (*models.StorageInfo, error) {
	dataDir := n.cfg.Storage.DataDir
	blevePath := filepath.Join(dataDir, n.cfg.Index.BleveDir)
	badgerPath := filepath.Join(dataDir, n.cfg.Storage.BadgerDir)

	bleveBytes := dirSize(blevePath)
	badgerBytes := dirSize(badgerPath)
	totalBytes := dirSize(dataDir)

	otherBytes := totalBytes - bleveBytes - badgerBytes
	if otherBytes < 0 {
		otherBytes = 0
	}

	return &models.StorageInfo{
		TotalBytes:  totalBytes,
		BleveBytes:  bleveBytes,
		BadgerBytes: badgerBytes,
		OtherBytes:  otherBytes,
		FreeBytes:   freeSpace(dataDir),
		DataDir:     dataDir,
	}, nil
}

// checkResourceLimits checks all 3 resource limits including disk I/O.
// Use in maintenance loop (runs every GCInterval).
func (n *Node) checkResourceLimits() (exceeded bool, reason string) {
	cfg := n.cfg.Storage

	// Check document count
	if cfg.MaxDocuments > 0 {
		docCount, _ := n.bleveIdx.DocCount()
		if int64(docCount) >= cfg.MaxDocuments {
			return true, fmt.Sprintf("document limit reached (%d/%d)", docCount, cfg.MaxDocuments)
		}
	}

	// Check queue size
	if cfg.MaxQueueSize > 0 && n.scheduler != nil {
		queueSize := int64(n.scheduler.Pending())
		if queueSize >= cfg.MaxQueueSize {
			return true, fmt.Sprintf("queue limit reached (%d/%d)", queueSize, cfg.MaxQueueSize)
		}
	}

	// Check storage (disk I/O — only in maintenance loop)
	if cfg.MaxStorageBytes > 0 {
		totalBytes := dirSize(cfg.DataDir)
		if totalBytes >= cfg.MaxStorageBytes {
			return true, fmt.Sprintf("storage limit reached (%d/%d bytes)", totalBytes, cfg.MaxStorageBytes)
		}
	}

	return false, ""
}

// checkResourceLimitsCheap checks only doc count + queue size (no disk I/O).
// Safe to call on the hot path (per-document).
func (n *Node) checkResourceLimitsCheap() bool {
	cfg := n.cfg.Storage

	if cfg.MaxDocuments > 0 {
		docCount, _ := n.bleveIdx.DocCount()
		if int64(docCount) >= cfg.MaxDocuments {
			return true
		}
	}

	if cfg.MaxQueueSize > 0 && n.scheduler != nil {
		if int64(n.scheduler.Pending()) >= cfg.MaxQueueSize {
			return true
		}
	}

	return false
}

// Leaderboard returns peer contribution rankings.
func (n *Node) Leaderboard() (*models.LeaderboardResponse, error) {
	counts, err := n.bleveIdx.DocCountsByPeer()
	if err != nil {
		return nil, fmt.Errorf("doc counts: %w", err)
	}

	selfID := n.peerID.String()

	// Merge orphan docs (empty key) into self
	if orphan, ok := counts[""]; ok {
		counts[selfID] += orphan
		delete(counts, "")
	}

	// Fetch trust data for enrichment
	reps, _ := n.trustStore.AllReputations()
	repMap := make(map[string]*models.PeerReputation, len(reps))
	for i := range reps {
		repMap[reps[i].PeerID] = &reps[i]
	}

	// Compute domain counts per peer
	allDomains, _ := n.bleveIdx.ListDomains()
	domainCountMap := make(map[string]int)
	for _, d := range allDomains {
		ownerID := n.shards.Owner(d)
		domainCountMap[ownerID]++
	}

	totalDocs := 0
	explorers := make([]models.ExplorerStats, 0, len(counts))
	for peerID, docCount := range counts {
		totalDocs += docCount

		es := models.ExplorerStats{
			PeerID:   peerID,
			DocCount: docCount,
			IsLocal:  peerID == selfID,
		}

		// Node name + country
		if peerID == selfID {
			es.NodeName = n.cfg.NodeName
			es.Country = n.selfCountry
		} else {
			es.NodeName = n.PeerName(peerID)
			es.Country = n.PeerGeo(peerID)
		}

		// Domain count
		es.DomainCount = domainCountMap[peerID]

		// Trust enrichment
		if rep, ok := repMap[peerID]; ok {
			es.TrustScore = rep.TrustScore
			es.FirstSeen = rep.FirstSeen
			es.LastSeen = rep.LastSeen
		} else {
			es.TrustScore = 0.5 // default
		}

		explorers = append(explorers, es)
	}

	// Sort by DocCount descending
	sort.Slice(explorers, func(i, j int) bool {
		return explorers[i].DocCount > explorers[j].DocCount
	})

	return &models.LeaderboardResponse{
		Explorers:   explorers,
		TotalDocs:   totalDocs,
		LocalPeerID: selfID,
	}, nil
}

// RelayLeaderboard returns relay (light node) contribution rankings.
func (n *Node) RelayLeaderboard() (*models.RelayLeaderboardResponse, error) {
	selfID := n.peerID.String()
	docCount, _ := n.bleveIdx.DocCount()

	// Fetch trust data for enrichment
	reps, _ := n.trustStore.AllReputations()
	repMap := make(map[string]*models.PeerReputation, len(reps))
	for i := range reps {
		repMap[reps[i].PeerID] = &reps[i]
	}

	var relays []models.RelayStats
	totalDocs := 0

	// Add local node if it's a light node
	if n.IsLight() {
		dooglePeers := n.shards.AllMembers()
		peerCount := len(dooglePeers) - 1
		if peerCount < 0 {
			peerCount = 0
		}
		rs := models.RelayStats{
			PeerID:         selfID,
			NodeName:       n.cfg.NodeName,
			Country:        n.selfCountry,
			DocsHosted:     int(docCount),
			QueriesServed:  n.queriesServed.Load(),
			Uptime:         time.Since(n.startedAt).Round(time.Second).String(),
			UptimeSeconds:  int64(time.Since(n.startedAt).Seconds()),
			ConnectedPeers: peerCount,
			IsLocal:        true,
			TrustScore:     0.5,
		}
		if rep, ok := repMap[selfID]; ok {
			rs.TrustScore = rep.TrustScore
			rs.FirstSeen = rep.FirstSeen
			rs.LastSeen = rep.LastSeen
		}
		relays = append(relays, rs)
		totalDocs += rs.DocsHosted
	}

	// Add all known light node peers
	n.peerRelayInfoMu.RLock()
	for _, ri := range n.peerRelayInfo {
		if ri.PeerID == selfID {
			continue
		}
		rs := models.RelayStats{
			PeerID:        ri.PeerID,
			NodeName:      ri.NodeName,
			Country:       n.PeerGeo(ri.PeerID),
			DocsHosted:    ri.DocCount,
			QueriesServed: ri.QueriesServed,
			LastSeen:      ri.LastSeen,
			TrustScore:    0.5,
		}
		if rep, ok := repMap[ri.PeerID]; ok {
			rs.TrustScore = rep.TrustScore
			rs.FirstSeen = rep.FirstSeen
			rs.LastSeen = rep.LastSeen
		}
		relays = append(relays, rs)
		totalDocs += rs.DocsHosted
	}
	n.peerRelayInfoMu.RUnlock()

	// Sort by DocsHosted descending
	sort.Slice(relays, func(i, j int) bool {
		return relays[i].DocsHosted > relays[j].DocsHosted
	})

	return &models.RelayLeaderboardResponse{
		Relays:      relays,
		TotalDocs:   totalDocs,
		LocalPeerID: selfID,
	}, nil
}

// countOwnedDomains returns the number of domains this node owns in the shard ring.
func (n *Node) countOwnedDomains() int {
	domains, err := n.bleveIdx.ListDomains()
	if err != nil {
		return 0
	}
	selfID := n.peerID.String()
	rf := n.cfg.Index.ReplicationFactor
	count := 0
	for _, d := range domains {
		if n.shards.IsOwner(selfID, d, rf) {
			count++
		}
	}
	return count
}

// DomainOwnership returns domain assignment info for the admin API.
func (n *Node) DomainOwnership() (*models.DomainOwnership, error) {
	domains, err := n.bleveIdx.ListDomains()
	if err != nil {
		return nil, fmt.Errorf("list domains: %w", err)
	}
	selfID := n.peerID.String()
	rf := n.cfg.Index.ReplicationFactor
	assignments := make([]models.DomainAssignment, 0, len(domains))
	owned := 0
	for _, d := range domains {
		ownerID := n.shards.Owner(d)
		isLocal := n.shards.IsOwner(selfID, d, rf)
		if isLocal {
			owned++
		}
		assignments = append(assignments, models.DomainAssignment{
			Domain:  d,
			OwnerID: ownerID,
			IsLocal: isLocal,
		})
	}
	return &models.DomainOwnership{
		TotalDomains: len(domains),
		OwnedDomains: owned,
		Domains:      assignments,
	}, nil
}

// PeersInfo returns detailed info about connected Doogle peers.
func (n *Node) PeersInfo() []models.PeerInfo {
	selfID := n.peerID.String()
	dooglePeers := n.shards.AllMembers()
	result := make([]models.PeerInfo, 0, len(dooglePeers))
	for _, pidStr := range dooglePeers {
		if pidStr == selfID {
			continue
		}
		pid, err := peer.Decode(pidStr)
		if err != nil {
			continue
		}
		addrs := n.host.Peerstore().Addrs(pid)
		addrStrs := make([]string, 0, len(addrs))
		for _, a := range addrs {
			addrStrs = append(addrStrs, a.String())
		}
		result = append(result, models.PeerInfo{
			PeerID:   pidStr,
			NodeName: n.PeerName(pidStr),
			Country:  n.PeerGeo(pidStr),
			Version:  n.PeerVersion(pidStr),
			Addrs:    addrStrs,
		})
	}
	return result
}

// PeerName returns the human-readable name for a peer, or empty if unknown.
func (n *Node) PeerName(id string) string {
	n.peerNamesMu.RLock()
	defer n.peerNamesMu.RUnlock()
	return n.peerNames[id]
}

const peerNamePrefix = "pn:"

// setPeerName stores a peer name in memory and persists it to BadgerDB.
func (n *Node) setPeerName(peerID, name string) {
	n.peerNamesMu.Lock()
	n.peerNames[peerID] = name
	n.peerNamesMu.Unlock()
	// Persist so names survive restarts and disconnects.
	_ = n.badger.Set([]byte(peerNamePrefix+peerID), []byte(name))
}

// loadPeerNames restores all persisted peer names from BadgerDB into memory.
func (n *Node) loadPeerNames() {
	prefix := []byte(peerNamePrefix)
	_ = n.badger.DB().View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			key := string(it.Item().Key())
			peerID := key[len(peerNamePrefix):]
			_ = it.Item().Value(func(val []byte) error {
				n.peerNamesMu.Lock()
				n.peerNames[peerID] = string(val)
				n.peerNamesMu.Unlock()
				return nil
			})
		}
		return nil
	})
}

const peerGeoPrefix = "geo:"

// setPeerGeo stores a peer's country in memory and persists it to BadgerDB.
func (n *Node) setPeerGeo(peerID, country string) {
	n.peerGeoMu.Lock()
	n.peerGeo[peerID] = country
	n.peerGeoMu.Unlock()
	_ = n.badger.Set([]byte(peerGeoPrefix+peerID), []byte(country))
}

// PeerGeo returns the country code for a peer, or empty if unknown.
func (n *Node) PeerGeo(id string) string {
	n.peerGeoMu.RLock()
	defer n.peerGeoMu.RUnlock()
	return n.peerGeo[id]
}

// loadPeerGeo restores all persisted peer geo from BadgerDB into memory.
func (n *Node) loadPeerGeo() {
	prefix := []byte(peerGeoPrefix)
	_ = n.badger.DB().View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			key := string(it.Item().Key())
			peerID := key[len(peerGeoPrefix):]
			_ = it.Item().Value(func(val []byte) error {
				n.peerGeoMu.Lock()
				n.peerGeo[peerID] = string(val)
				n.peerGeoMu.Unlock()
				return nil
			})
		}
		return nil
	})
}

const peerVersionPrefix = "pv:"

// PeerVersion returns the version string for a peer, or empty if unknown.
func (n *Node) PeerVersion(id string) string {
	n.peerVersionsMu.RLock()
	defer n.peerVersionsMu.RUnlock()
	return n.peerVersions[id]
}

// setPeerVersion stores a peer's version in memory and persists it to BadgerDB.
func (n *Node) setPeerVersion(peerID, version string) {
	n.peerVersionsMu.Lock()
	n.peerVersions[peerID] = version
	n.peerVersionsMu.Unlock()
	_ = n.badger.Set([]byte(peerVersionPrefix+peerID), []byte(version))
}

// loadPeerVersions restores all persisted peer versions from BadgerDB into memory.
func (n *Node) loadPeerVersions() {
	prefix := []byte(peerVersionPrefix)
	_ = n.badger.DB().View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			key := string(it.Item().Key())
			peerID := key[len(peerVersionPrefix):]
			_ = it.Item().Value(func(val []byte) error {
				n.peerVersionsMu.Lock()
				n.peerVersions[peerID] = string(val)
				n.peerVersionsMu.Unlock()
				return nil
			})
		}
		return nil
	})
}

// checkPeerCompat checks whether a peer's protocol compatibility level is acceptable.
// Returns true if compatible, false if the peer should be rejected.
func (n *Node) checkPeerCompat(catalog *p2p.ShardCatalog) bool {
	peerCompat := catalog.MinCompatVersion // 0 for old pre-version nodes

	// They require a newer protocol than we support — we're outdated
	if peerCompat > p2p.CompatLevel {
		slog.Warn("peer requires newer protocol — consider updating",
			"peer", catalog.PeerID[:12], "their_compat", peerCompat, "our_compat", p2p.CompatLevel)
		n.updateNeeded.Store(true)
		return false
	}

	// We require a newer protocol than they support — they're outdated
	if p2p.MinRequiredCompat > 0 && peerCompat < p2p.MinRequiredCompat {
		slog.Warn("peer too old — disconnecting",
			"peer", catalog.PeerID[:12], "their_compat", peerCompat, "our_min_required", p2p.MinRequiredCompat)
		return false
	}

	return true
}

// disconnectIncompatPeer removes an incompatible peer from the shard ring and closes the connection.
func (n *Node) disconnectIncompatPeer(peerIDStr string) {
	n.shards.RemoveNode(peerIDStr)
	if pid, err := peer.Decode(peerIDStr); err == nil {
		n.host.ConnManager().Unprotect(pid, "doogle")
		_ = n.host.Network().ClosePeer(pid)
	}
}

// sendCatalogToPeer sends our shard catalog (including node name) directly
// to a peer via the /doogle/shard/1.0.0 stream protocol. This bypasses
// GossipSub so the remote peer learns our name immediately on connection.
func (n *Node) sendCatalogToPeer(pid peer.ID) {
	if n.bleveIdx == nil || n.genStore == nil {
		return // init not yet complete
	}
	docCount, _ := n.bleveIdx.DocCount()
	catalog := &p2p.ShardCatalog{
		PeerID:           n.peerID.String(),
		NodeName:         n.cfg.NodeName,
		Country:          n.selfCountry,
		Version:          n.cfg.Version,
		MinCompatVersion: p2p.CompatLevel,
		DocCount:         docCount,
		Generation:       n.genStore.Current(),
	}
	if err := p2p.SendShardCatalog(n.ctx, n.host, pid, catalog, 10*time.Second); err != nil {
		slog.Debug("shard catalog: direct send failed", "peer", pid.String()[:12], "err", err)
	} else {
		slog.Debug("shard catalog: sent to new peer", "peer", pid.String()[:12], "name", n.cfg.NodeName)
	}
}

// onDocumentCrawled is called by the crawler when a page is fetched.
func (n *Node) onDocumentCrawled(doc *models.Document, discoveredURLs []string) {
	// Check resource limits (cheap — no disk I/O)
	if n.checkResourceLimitsCheap() {
		return
	}

	// Track content changes for incremental reindexing and re-crawl scheduling
	if n.contentStore != nil && doc.ContentHash != "" {
		_ = n.contentStore.PutWithTracking(doc.URL, doc.ContentHash, n.genStore.Current())
	}

	// Stamp origin: this document was crawled by us
	doc.OriginPeerID = n.peerID.String()

	// Enforce robot directives (noindex / nofollow)
	// noindex only         → skip indexing + replication + gossip, still record links and schedule URLs
	// nofollow only        → index normally, links discovered but don't pass PageRank
	// noindex + nofollow   → skip indexing, don't record links, don't schedule URLs
	skipIndex := doc.NoIndex
	skipLinks := doc.NoIndex && doc.NoFollow

	if skipIndex {
		slog.Info("node: noindex directive, skipping index/replication", "url", doc.URL, "robots_meta", doc.RobotsMeta)
	}

	// Index the document locally (unless noindex)
	if !skipIndex {
		if err := n.indexer.Index(doc); err != nil {
			slog.Error("node: index error", "err", err)
		}
	}

	// Record link graph edges (unless noindex+nofollow)
	if !skipLinks {
		n.recordLinks(doc)
	}

	// Track trend data
	if n.trendStore != nil {
		n.trendStore.IncrementCrawl(doc.Domain)
	}

	n.urlStore.IncrementCrawled()

	// Discover sitemap for new domains (async, non-blocking)
	go n.crawler.DiscoverSitemap(doc.Domain)

	// Replicate to shard owners if we're in a multi-node setup (unless noindex)
	if !skipIndex {
		n.replicateDocument(doc)
	}

	// Schedule discovered URLs (unless noindex+nofollow)
	if !skipLinks {
		for _, u := range discoveredURLs {
			domain := urlutil.ExtractDomain(u)

			// Skip URLs blocked by operator filter
			if !n.urlFilter.IsEmpty() && !n.urlFilter.IsAllowed(u, domain) {
				continue
			}

			task := &models.CrawlTask{
				URL:       u,
				Domain:    domain,
				Depth:     doc.Depth + 1,
				Priority:  doc.Depth + 2,
				SourceURL: doc.URL,
				CreatedAt: time.Now(),
			}
			if n.shouldCrawlLocally(domain) {
				n.scheduler.Schedule(task)
			} else {
				n.forwardCrawlTask(task)
			}
		}
	}

	// Broadcast discovered URLs to peers (unless noindex — don't gossip forbidden content)
	if !skipIndex && len(discoveredURLs) > 0 {
		ann := &models.URLAnnouncement{
			URLs:      discoveredURLs,
			SourceURL: doc.URL,
			Depth:     doc.Depth + 1,
			PeerID:    n.peerID.String(),
		}

		// Attach proof-of-work (Sybil resistance)
		challenge := p2p.PoWChallenge(n.peerID.String(), discoveredURLs)
		pow := p2p.ComputePoW(challenge, p2p.DefaultPoWDifficulty)
		ann.PoWNonce = pow.Nonce
		ann.PoWTimestamp = pow.Timestamp
		ann.PoWDifficulty = pow.Difficulty

		if err := n.gossip.Publish(n.ctx, ann); err != nil {
			slog.Error("node: gossip publish error", "err", err)
		}
	}
}

// replicateDocument sends a document to its shard replica owners.
func (n *Node) replicateDocument(doc *models.Document) {
	if n.shards.NodeCount() <= 1 {
		return // single node, nothing to replicate
	}

	owners := n.shards.Owners(doc.Domain, n.cfg.Index.ReplicationFactor)
	selfID := n.peerID.String()

	for _, ownerID := range owners {
		if ownerID == selfID {
			continue
		}
		pid, err := peer.Decode(ownerID)
		if err != nil {
			continue
		}
		// Check if peer is connected
		if n.host.Network().Connectedness(pid) != network.Connected {
			continue
		}
		go func(peerID peer.ID) {
			req := &p2p.ReplicateRequest{
				Documents:  []*models.Document{doc},
				Generation: n.genStore.Current(),
			}
			if _, err := p2p.ReplicateDocuments(n.ctx, n.host, peerID, req, 10*time.Second); err != nil {
				slog.Error("node: replicate error", "peer", peerID.String()[:12], "err", err)
			}
		}(pid)
	}
}

// recordLinks stores link graph edges from a crawled document.
func (n *Node) recordLinks(doc *models.Document) {
	fromID := models.DocumentID(doc.URL)
	for _, link := range doc.Links {
		if link.NoFollow {
			continue
		}
		toURL := urlutil.Normalize(link.URL)
		toID := models.DocumentID(toURL)
		edge := store.LinkEdge{
			FromURL:    doc.URL,
			ToURL:      toURL,
			AnchorText: link.Text,
			IsCross:    link.IsExternal,
		}
		if err := n.linkStore.AddLink(fromID, toID, edge); err != nil {
			slog.Error("node: record link error", "err", err)
		}
	}
}

// shouldCrawlLocally checks if this node owns the domain in the shard ring.
// Single-node mode always returns true.
func (n *Node) shouldCrawlLocally(domain string) bool {
	if n.shards.NodeCount() <= 1 {
		return true
	}
	return n.shards.IsOwner(n.peerID.String(), domain, n.cfg.Index.ReplicationFactor)
}

// forwardCrawlTask sends a crawl task to the domain's shard owner.
// Falls back to local crawl if owner is unreachable.
func (n *Node) forwardCrawlTask(task *models.CrawlTask) {
	owner := n.shards.Owner(task.Domain)
	if owner == "" || owner == n.peerID.String() {
		n.scheduler.Schedule(task)
		return
	}
	pid, err := peer.Decode(owner)
	if err != nil {
		n.scheduler.Schedule(task)
		return
	}
	if n.host.Network().Connectedness(pid) != network.Connected {
		n.scheduler.Schedule(task) // owner offline — fallback
		return
	}
	n.forwardedTasks.Add(1)
	go func() {
		if err := p2p.SendCrawlTask(n.ctx, n.host, pid, task, 10*time.Second); err != nil {
			slog.Debug("crawl forward: failed, crawling locally", "domain", task.Domain, "err", err)
			n.scheduler.Schedule(task)
		}
	}()
}

// routeSeedURL routes a seed URL through domain ownership checks.
func (n *Node) routeSeedURL(rawURL string) {
	normalized := urlutil.Normalize(rawURL)
	domain := urlutil.ExtractDomain(normalized)

	// Check URL filter
	if !n.urlFilter.IsEmpty() && !n.urlFilter.IsAllowed(normalized, domain) {
		slog.Debug("crawler: seed URL blocked by filter", "url", normalized)
		return
	}

	task := &models.CrawlTask{
		URL:       normalized,
		Domain:    domain,
		Depth:     0,
		Priority:  1,
		CreatedAt: time.Now(),
	}
	if n.shouldCrawlLocally(domain) {
		n.scheduler.Schedule(task)
		slog.Info("crawler: seeded URL (local)", "url", normalized)
	} else {
		n.forwardCrawlTask(task)
		owner := n.shards.Owner(domain)
		ownerShort := owner
		if len(ownerShort) > 12 {
			ownerShort = ownerShort[:12]
		}
		slog.Info("crawler: seeded URL (forwarded)", "url", normalized, "owner", ownerShort)
	}
}

// gossipLoop listens for URL announcements from peers.
func (n *Node) gossipLoop() {
	for {
		ann, err := n.gossip.Subscribe(n.ctx)
		if err != nil {
			if n.ctx.Err() != nil {
				return
			}
			continue
		}
		if ann == nil {
			continue
		}

		// Skip announcements from quarantined peers
		if n.trustManager.IsQuarantined(ann.PeerID) {
			continue
		}

		// Rate limit per peer (malicious crawl defense)
		if !n.gossipLimiter.Allow(ann.PeerID) {
			continue
		}

		// Verify proof-of-work if present (Sybil resistance)
		if ann.PoWTimestamp > 0 {
			challenge := p2p.PoWChallenge(ann.PeerID, ann.URLs)
			pow := p2p.ProofOfWork{
				Nonce:      ann.PoWNonce,
				Timestamp:  ann.PoWTimestamp,
				Difficulty: ann.PoWDifficulty,
			}
			trust := n.trustManager.TrustScore(ann.PeerID)
			minDiff := p2p.PoWDifficultyForTrust(trust)
			if err := p2p.VerifyPoW(challenge, pow, minDiff); err != nil {
				slog.Debug("gossip: invalid PoW from peer", "peer", ann.PeerID[:12], "err", err)
				continue
			}
		}

		// Light nodes relay gossip automatically via GossipSub mesh subscription
		// but don't schedule any URLs for crawling.
		if n.IsLight() {
			continue
		}

		for _, u := range ann.URLs {
			// Validate URL is safe (prevent SSRF via gossip)
			if !urlutil.IsSafeURL(u) {
				continue
			}

			domain := urlutil.ExtractDomain(u)

			// Skip URLs from flagged or consensus-blocked domains
			if n.trustManager.IsDomainFlagged(domain) || n.trustStore.IsDomainBlocked(domain) {
				continue
			}

			// Skip URLs blocked by operator filter
			if !n.urlFilter.IsEmpty() && !n.urlFilter.IsAllowed(u, domain) {
				continue
			}

			task := &models.CrawlTask{
				URL:       u,
				Domain:    domain,
				Depth:     ann.Depth,
				Priority:  ann.Depth + 1,
				SourceURL: ann.SourceURL,
				CreatedAt: time.Now(),
			}
			if n.shouldCrawlLocally(domain) {
				n.scheduler.Schedule(task)
			} else {
				n.forwardCrawlTask(task)
			}
		}
	}
}

// shardCatalogLoop listens for shard catalog updates from peers.
func (n *Node) shardCatalogLoop() {
	for {
		catalog, err := n.gossip.SubscribeShardCatalog(n.ctx)
		if err != nil {
			if n.ctx.Err() != nil {
				return
			}
			continue
		}
		if catalog == nil {
			continue
		}

		// Store version regardless of compat (for UI display)
		if catalog.Version != "" {
			n.setPeerVersion(catalog.PeerID, catalog.Version)
		}

		// Check protocol compatibility
		if !n.checkPeerCompat(catalog) {
			n.disconnectIncompatPeer(catalog.PeerID)
			continue
		}

		// Ensure the peer is in our shard ring
		n.shards.AddNode(catalog.PeerID)
		if catalog.NodeName != "" {
			n.setPeerName(catalog.PeerID, catalog.NodeName)
		}
		// Accept self-reported country if we haven't geolocated from IP yet.
		if catalog.Country != "" && n.PeerGeo(catalog.PeerID) == "" {
			n.setPeerGeo(catalog.PeerID, catalog.Country)
		}
		// Track relay info for light nodes
		if catalog.NodeType == "light" {
			n.peerRelayInfoMu.Lock()
			n.peerRelayInfo[catalog.PeerID] = relayInfo{
				PeerID:        catalog.PeerID,
				NodeName:      catalog.NodeName,
				Country:       catalog.Country,
				DocCount:      int(catalog.DocCount),
				QueriesServed: catalog.QueriesServed,
				LastSeen:      time.Now(),
			}
			n.peerRelayInfoMu.Unlock()
		}
		slog.Debug("shard catalog: received", "peer", catalog.PeerID[:12], "name", catalog.NodeName, "version", catalog.Version, "type", catalog.NodeType, "domains", len(catalog.Domains), "docs", catalog.DocCount, "gen", catalog.Generation)
	}
}

// shardCatalogPublisher periodically publishes our shard catalog.
func (n *Node) shardCatalogPublisher() {
	// Publish once shortly after startup so peers learn our name immediately
	// rather than waiting for the first 60-second tick.
	select {
	case <-time.After(5 * time.Second):
		n.publishShardCatalog()
	case <-n.ctx.Done():
		return
	}

	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			n.publishShardCatalog()
		case <-n.ctx.Done():
			return
		}
	}
}

// publishShardCatalog broadcasts this node's shard catalog to peers.
func (n *Node) publishShardCatalog() {
	docCount, _ := n.bleveIdx.DocCount()
	nodeType := "full"
	if n.IsLight() {
		nodeType = "light"
	}
	catalog := &p2p.ShardCatalog{
		PeerID:           n.peerID.String(),
		NodeName:         n.cfg.NodeName,
		NodeType:         nodeType,
		Country:          n.selfCountry,
		Version:          n.cfg.Version,
		MinCompatVersion: p2p.CompatLevel,
		DocCount:         docCount,
		Generation:       n.genStore.Current(),
		QueriesServed:    n.queriesServed.Load(),
	}
	if err := n.gossip.PublishShardCatalog(n.ctx, catalog); err != nil {
		slog.Error("node: shard catalog publish error", "err", err)
	}
}

// P2P handlers

func (n *Node) handlePeerSearch(req *models.SearchRequest) (*models.SearchResponse, error) {
	n.queriesServed.Add(1)
	return n.localEng.Search(req)
}

func (n *Node) handlePeerCrawlTask(task *models.CrawlTask) error {
	n.receivedTasks.Add(1)
	n.scheduler.Schedule(task)
	return nil
}

func (n *Node) handlePeerIndexDoc(senderPeerID string, doc *models.Document) error {
	if doc.OriginPeerID == "" {
		doc.OriginPeerID = senderPeerID
	}
	return n.indexer.Index(doc)
}

func (n *Node) handleShardCatalog(catalog *p2p.ShardCatalog) error {
	// Store version regardless of compat (for UI display)
	if catalog.Version != "" {
		n.setPeerVersion(catalog.PeerID, catalog.Version)
	}

	// Check protocol compatibility
	if !n.checkPeerCompat(catalog) {
		n.disconnectIncompatPeer(catalog.PeerID)
		return fmt.Errorf("incompatible peer %s (compat %d)", catalog.PeerID[:12], catalog.MinCompatVersion)
	}

	n.shards.AddNode(catalog.PeerID)
	if catalog.NodeName != "" {
		n.setPeerName(catalog.PeerID, catalog.NodeName)
	}
	// Accept self-reported country if we haven't geolocated from IP yet.
	if catalog.Country != "" && n.PeerGeo(catalog.PeerID) == "" {
		n.setPeerGeo(catalog.PeerID, catalog.Country)
	}
	// Track relay info for light nodes
	if catalog.NodeType == "light" {
		n.peerRelayInfoMu.Lock()
		n.peerRelayInfo[catalog.PeerID] = relayInfo{
			PeerID:        catalog.PeerID,
			NodeName:      catalog.NodeName,
			Country:       catalog.Country,
			DocCount:      int(catalog.DocCount),
			QueriesServed: catalog.QueriesServed,
			LastSeen:      time.Now(),
		}
		n.peerRelayInfoMu.Unlock()
	}
	slog.Debug("shard protocol: catalog received", "peer", catalog.PeerID[:12], "name", catalog.NodeName, "version", catalog.Version, "type", catalog.NodeType, "docs", catalog.DocCount)
	return nil
}

func (n *Node) handleReplicateRequest(senderPeerID string, req *p2p.ReplicateRequest) (*p2p.ReplicateResponse, error) {
	accepted := 0
	for _, doc := range req.Documents {
		// Skip documents from flagged or consensus-blocked domains
		if n.trustManager.IsDomainFlagged(doc.Domain) || n.trustStore.IsDomainBlocked(doc.Domain) {
			continue
		}

		// Stamp origin if the sending peer didn't set it (backward compat)
		if doc.OriginPeerID == "" {
			doc.OriginPeerID = senderPeerID
		}

		if err := n.indexer.Index(doc); err != nil {
			slog.Error("replicate: index error", "url", doc.URL, "err", err)
			continue
		}
		accepted++
	}
	return &p2p.ReplicateResponse{
		Status:   "ok",
		Accepted: accepted,
	}, nil
}

// ReportURL handles a local spam report, stores it, and broadcasts to peers.
func (n *Node) ReportURL(rawURL, reason, detail string) error {
	// Rate limit local API reports
	if !n.reportLimiter.Allow("local") {
		return fmt.Errorf("rate limited: too many reports, try again later")
	}

	domain := urlutil.ExtractDomain(rawURL)
	reportID := store.ReportID(n.peerID.String(), rawURL)

	report := &models.SpamReport{
		ID:         reportID,
		URL:        rawURL,
		Domain:     domain,
		ReporterID: n.peerID.String(),
		Reason:     reason,
		Detail:     detail,
		Timestamp:  time.Now(),
	}

	isNew, err := n.trustManager.HandleReport(report)
	if err != nil {
		return err
	}
	if !isNew {
		return nil // duplicate, don't broadcast
	}

	// Penalize the origin peer and clean up the document
	n.penalizeAndCleanup(rawURL, reason)

	// Append to audit trail (signed, hash-chained)
	if n.auditTrail != nil {
		if _, err := n.auditTrail.Append(report); err != nil {
			slog.Error("audit: failed to append report", "err", err)
		}
	}

	// Consensus-based domain blocklist: count unique reporter votes
	const consensusThreshold = 3
	if blocked, voters := n.trustStore.AddDomainVote(domain, n.peerID.String(), consensusThreshold); blocked {
		slog.Warn("trust: domain consensus-blocked", "domain", domain, "voters", voters)
	}

	// Record in master profile
	_ = n.profileStore.RecordReport()

	// Broadcast to peers
	if err := n.gossip.PublishSpamReport(n.ctx, report); err != nil {
		slog.Error("node: spam report publish error", "err", err)
	}

	return nil
}

// penalizeAndCleanup implements staged quarantine:
//  1. Document enters quarantine (still visible in search with warning flag)
//  2. 24-hour voting window opens for peers to confirm/dismiss
//  3. After window closes, resolveQuarantines() tallies votes and either deletes
//     the doc + penalizes origin peer, or lifts the quarantine.
//
// Replica holders are NOT penalized — only the origin peer (patient zero) takes
// the trust hit when the quarantine is confirmed.
func (n *Node) penalizeAndCleanup(rawURL, reason string) {
	docID := models.DocumentID(rawURL)
	doc, err := n.bleveIdx.Get(docID)
	if err != nil {
		return // document not in our index
	}

	// Check if already quarantined
	if n.trustStore.IsDocQuarantined(docID) {
		// Another report for the same URL — count as a confirmation vote
		n.trustStore.VoteDocQuarantine(docID, true)
		slog.Info("trust: additional vote for quarantined doc", "url", rawURL)
		return
	}

	// Stage 1: quarantine the document (don't delete yet)
	now := time.Now()
	q := &models.DocQuarantine{
		URL:           rawURL,
		DocID:         docID,
		OriginPeerID:  doc.OriginPeerID,
		Reason:        reason,
		ReporterID:    n.peerID.String(),
		QuarantinedAt: now,
		ExpiresAt:     now.Add(models.QuarantineVotingWindow),
		Confirms:      1, // the initial report counts as first confirmation
	}
	if err := n.trustStore.QuarantineDoc(q); err != nil {
		slog.Error("trust: failed to quarantine doc", "url", rawURL, "err", err)
		return
	}

	slog.Info("trust: document quarantined — 24h voting window open",
		"url", rawURL, "origin", doc.OriginPeerID, "reason", reason)
}

// resolveQuarantines is called periodically to check for expired voting windows.
// For each expired quarantine:
//   - If confirms > dismissals → delete doc from index, penalize origin peer
//   - Otherwise → lift quarantine, doc stays in index
func (n *Node) resolveQuarantines() {
	entries, err := n.trustStore.UnresolvedQuarantines()
	if err != nil || len(entries) == 0 {
		return
	}

	now := time.Now()
	for _, q := range entries {
		if now.Before(q.ExpiresAt) {
			continue // voting window still open
		}

		confirmed := q.Confirms > q.Dismissals
		q.Resolved = true
		q.Confirmed = confirmed
		n.trustStore.QuarantineDoc(q)

		if confirmed {
			// Penalize the origin peer (patient zero)
			if q.OriginPeerID != "" {
				reporterTrust := 1.0
				if q.OriginPeerID != n.peerID.String() {
					if rep, _ := n.trustStore.GetReputation(n.peerID.String()); rep != nil {
						reporterTrust = rep.TrustScore
					}
				}
				n.trustManager.RecordSpamDoc(q.OriginPeerID, reporterTrust, q.Reason)
			}

			// Delete from all replicas (including our own index)
			if err := n.bleveIdx.Delete(q.DocID); err != nil {
				slog.Error("trust: failed to delete confirmed-spam doc", "url", q.URL, "err", err)
			} else {
				slog.Warn("trust: CONFIRMED quarantine — doc deleted, origin penalized",
					"url", q.URL, "origin", q.OriginPeerID,
					"confirms", q.Confirms, "dismissals", q.Dismissals)
			}

			// Update reporter credibility — the reporter was right
			n.trustManager.RecordReporterConfirm(q.ReporterID)
		} else {
			slog.Info("trust: quarantine DISMISSED — doc restored",
				"url", q.URL, "confirms", q.Confirms, "dismissals", q.Dismissals)

			// Update reporter credibility — the reporter was wrong
			n.trustManager.RecordReporterReject(q.ReporterID)
		}
	}
}

// spamReportLoop listens for incoming spam reports from peers.
func (n *Node) spamReportLoop() {
	for {
		report, err := n.gossip.SubscribeSpamReport(n.ctx)
		if err != nil {
			if n.ctx.Err() != nil {
				return
			}
			continue
		}
		if report == nil {
			continue
		}

		// Don't accept reports from quarantined peers
		if n.trustManager.IsQuarantined(report.ReporterID) {
			slog.Warn("trust: ignoring report from quarantined peer", "peer", report.ReporterID[:12])
			continue
		}

		// Rate limit reports per peer
		if !n.reportLimiter.Allow(report.ReporterID) {
			slog.Warn("trust: rate-limiting reports from peer", "peer", report.ReporterID[:12])
			continue
		}

		if isNew, err := n.trustManager.HandleReport(report); err != nil {
			slog.Error("trust: error handling peer report", "err", err)
		} else if isNew {
			// Penalize the origin peer and clean up the document
			n.penalizeAndCleanup(report.URL, report.Reason)

			// Audit trail for incoming reports
			if n.auditTrail != nil {
				if _, err := n.auditTrail.Append(report); err != nil {
					slog.Error("audit: failed to append peer report", "err", err)
				}
			}

			// Consensus domain blocklist vote
			const consensusThreshold = 3
			if blocked, voters := n.trustStore.AddDomainVote(report.Domain, report.ReporterID, consensusThreshold); blocked {
				slog.Warn("trust: domain consensus-blocked via peer report", "domain", report.Domain, "voters", voters)
			}
		}
	}
}

// auditTrailEntries returns recent audit entries as generic interface slices for the API.
func (n *Node) auditTrailEntries(limit int) []interface{} {
	if n.auditTrail == nil {
		return nil
	}
	entries := n.auditTrail.RecentEntries(limit)
	result := make([]interface{}, len(entries))
	for i, e := range entries {
		result[i] = e
	}
	return result
}

// maintenanceLoop periodically runs BadgerDB GC and store pruning.
func (n *Node) maintenanceLoop() {
	interval := n.cfg.Storage.GCInterval
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	if n.cfg.LowResource {
		interval = 15 * time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	memCheckCounter := 0
	for {
		select {
		case <-ticker.C:
			// Self-monitoring: check heap every ~4 maintenance cycles to avoid frequent STW pauses
			memCheckCounter++
			if memCheckCounter%4 == 0 && !n.cfg.LowResource {
				var m runtime.MemStats
				runtime.ReadMemStats(&m)
				heapMB := m.HeapInuse / 1024 / 1024
				if heapMB > 500 {
					slog.Warn("high memory usage detected, consider --low-resource", "heap_mb", heapMB)
				}
			}

			// BadgerDB value log GC — run in a loop to reclaim multiple vlog files per cycle
			for {
				if err := n.badger.RunGC(); err != nil {
					break
				}
				slog.Debug("badger GC: reclaimed vlog space")
			}

			// Prune expired dedup entries (TTL-based, just log the count)
			if n.dedupStore != nil {
				if count, err := n.dedupStore.PruneExpired(); err == nil {
					slog.Debug("maintenance: dedup store", "seen_count", count)
				}
			}

			// Cleanup rate limiter expired entries
			n.gossipLimiter.Cleanup()

			// Trend maintenance: recompute averages and prune
			if n.trendStore != nil {
				n.trendStore.ComputeAverages()
				retention := n.cfg.Storage.TrendRetention
				if retention <= 0 {
					retention = 168 * time.Hour // 7 days
				}
				n.trendStore.PruneOldBuckets(retention)
			}

			// Prune stale content records
			if n.contentStore != nil {
				maxAge := n.cfg.Storage.ContentMaxAge
				if maxAge <= 0 {
					maxAge = 30 * 24 * time.Hour
				}
				if pruned, err := n.contentStore.PruneStale(maxAge); err != nil {
					slog.Error("maintenance: content prune error", "err", err)
				} else if pruned > 0 {
					slog.Info("maintenance: pruned stale content records", "count", pruned)
				}
			}

			// Resource limit enforcement — pause/resume crawler
			if n.crawler != nil {
				exceeded, reason := n.checkResourceLimits()
				if exceeded && !n.crawlerPausedForLimits.Load() {
					slog.Warn("resource limit reached, pausing crawler", "reason", reason)
					n.crawler.Pause()
					n.crawlerPausedForLimits.Store(true)
				} else if !exceeded && n.crawlerPausedForLimits.Load() {
					slog.Info("resource limits OK, resuming crawler")
					n.crawler.Resume()
					n.crawlerPausedForLimits.Store(false)
				}
			}
		case <-n.ctx.Done():
			return
		}
	}
}

// toModelTrends converts store.TrendItem to models.TrendItem.
func toModelTrends(items []store.TrendItem) []models.TrendItem {
	result := make([]models.TrendItem, len(items))
	for i, item := range items {
		result[i] = models.TrendItem{
			Name:          item.Name,
			CurrentRate:   item.CurrentRate,
			AverageRate:   item.AverageRate,
			VelocityRatio: item.VelocityRatio,
			Volume:        item.Volume,
		}
	}
	return result
}

func multiaddrsToStrings(h host.Host) []string {
	addrs := h.Addrs()
	result := make([]string, 0, len(addrs))
	for _, a := range addrs {
		result = append(result, fmt.Sprintf("%s/p2p/%s", a, h.ID()))
	}
	return result
}
