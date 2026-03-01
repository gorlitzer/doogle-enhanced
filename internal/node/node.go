package node

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"time"

	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"

	"github.com/doogle/doogle-v2/internal/api"
	"github.com/doogle/doogle-v2/internal/crawler"
	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/indexer"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/p2p"
	"github.com/doogle/doogle-v2/internal/search"
	"github.com/doogle/doogle-v2/internal/store"
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

	// Trust & safety
	trustStore   *store.TrustStore
	trustManager *TrustManager

	startedAt time.Time
	ctx       context.Context
	cancel    context.CancelFunc
}

// New creates and initializes a Doogle node.
func New(cfg *Config) (*Node, error) {
	ctx, cancel := context.WithCancel(context.Background())

	n := &Node{
		cfg:       cfg,
		startedAt: time.Now(),
		ctx:       ctx,
		cancel:    cancel,
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
	log.Printf("node: peer ID = %s", peerID)

	// 2. libp2p host
	h, err := p2p.NewHost(n.ctx, privKey, n.cfg.P2P.Port)
	if err != nil {
		return fmt.Errorf("p2p host: %w", err)
	}
	n.host = h

	// 3. Discovery (DHT + mDNS)
	disc, err := p2p.NewDiscovery(n.ctx, h, n.cfg.P2P.BootstrapPeers, n.cfg.P2P.MDNS)
	if err != nil {
		return fmt.Errorf("discovery: %w", err)
	}
	n.discovery = disc

	// 4. GossipSub (URL frontier + shard catalog)
	gossip, err := p2p.NewGossip(n.ctx, h)
	if err != nil {
		return fmt.Errorf("gossip: %w", err)
	}
	n.gossip = gossip

	// 5. Storage
	badgerPath := filepath.Join(dataDir, n.cfg.Storage.BadgerDir)
	bs, err := store.NewBadgerStore(badgerPath)
	if err != nil {
		return fmt.Errorf("badger: %w", err)
	}
	n.badger = bs

	// 5a. Foundation stores
	n.dedupStore = store.NewDedupStore(bs)
	n.urlStore = store.NewURLStore(bs, n.dedupStore)
	n.linkStore = store.NewLinkStore(bs)
	n.contentStore = store.NewContentStore(bs)

	genStore, err := store.NewGenerationStore(bs)
	if err != nil {
		return fmt.Errorf("generation store: %w", err)
	}
	n.genStore = genStore

	// 5b. Trust store and manager
	n.trustStore = store.NewTrustStore(bs)
	n.trustManager = NewTrustManager(n.trustStore, peerID.String())

	// 6. Bleve index
	blevePath := filepath.Join(dataDir, n.cfg.Index.BleveDir)
	bleveIdx, err := index.NewBleveStore(blevePath)
	if err != nil {
		return fmt.Errorf("bleve: %w", err)
	}
	n.bleveIdx = bleveIdx

	// 7. Shard manager — add self
	n.shards = index.NewShardManager()
	n.shards.AddNode(peerID.String())

	// 7a. Register network notifiee to track peer join/leave for shard ring
	h.Network().Notify(&network.NotifyBundle{
		ConnectedF: func(_ network.Network, conn network.Conn) {
			pid := conn.RemotePeer().String()
			n.shards.AddNode(pid)
			log.Printf("shard ring: added peer %s (total: %d)", pid[:12], n.shards.NodeCount())
		},
		DisconnectedF: func(_ network.Network, conn network.Conn) {
			pid := conn.RemotePeer().String()
			n.shards.RemoveNode(pid)
			log.Printf("shard ring: removed peer %s (total: %d)", pid[:12], n.shards.NodeCount())
		},
	})

	// 8. Batch indexer
	n.batchIndexer = index.NewBatchIndexer(
		bleveIdx,
		n.cfg.Index.BatchSize,
		n.cfg.Index.BatchFlushInterval,
	)

	// 9. Indexer + PageRank
	n.indexer = indexer.New(bleveIdx, n.batchIndexer, n.genStore)
	n.pageRank = indexer.NewPageRankComputer(n.linkStore, bleveIdx, n.cfg.Index.PageRankInterval)

	// 10. Incremental indexer
	n.incremental = indexer.NewIncrementalIndexer(
		bleveIdx,
		n.contentStore,
		n.genStore,
		n.batchIndexer,
		n.cfg.Index.IncrementalInterval,
	)

	// 11. Crawler with callback
	n.scheduler = crawler.NewScheduler(n.urlStore, 10000)
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
	}, n.scheduler, n.onDocumentCrawled)

	// 12. Search engines (shard-aware distributed search)
	n.localEng = search.NewEngine(bleveIdx)
	n.search = search.NewDistributedSearch(
		h, n.localEng, n.shards,
		n.cfg.Index.ReplicationFactor,
		n.cfg.Search.PeerTimeout,
		n.cfg.Search.MaxPeers,
		n.cfg.Search.CacheSize,
		n.cfg.Search.CacheTTL,
	)

	// 13. Register P2P protocol handlers
	p2p.RegisterSearchProtocol(h, n.handlePeerSearch)
	p2p.RegisterCrawlProtocol(h, n.handlePeerCrawlTask)
	p2p.RegisterIndexProtocol(h, n.handlePeerIndexDoc)
	p2p.RegisterShardProtocol(h, n.handleShardCatalog)
	p2p.RegisterReplicateProtocol(h, n.handleReplicateRequest)
	p2p.RegisterAntiEntropyProtocol(h, n.handleAntiEntropyRequest)

	// 14. HTTP API
	n.apiServer = api.NewServer(n.cfg.API.Bind, n.cfg.API.Port, &api.Deps{
		Search:       n.search,
		StatusFn:     n.Status,
		CrawlSeed:    n.crawler.AddSeed,
		CrawlerInfo:  n.CrawlerInfo,
		CrawlerFeed:  n.crawler.RecentEvents,
		IndexerStats: n.IndexerStats,
		PeersInfo:    n.PeersInfo,
		IndexStore:   bleveIdx,
		ReportURL:    n.ReportURL,
		TrustSummary: n.trustManager.Summary,
	})

	return nil
}

// Run starts all subsystems and blocks until context is cancelled.
func (n *Node) Run() error {
	// Start crawler
	n.crawler.Start()

	// Start batch indexer background flusher
	n.batchIndexer.Start(n.ctx)

	// Start PageRank background computation
	n.pageRank.Start(n.ctx)

	// Start incremental re-scoring
	n.incremental.Start(n.ctx)

	// Start gossip listeners
	go n.gossipLoop()
	go n.shardCatalogLoop()
	go n.shardCatalogPublisher()
	go n.antiEntropyLoop()
	go n.spamReportLoop()

	// Add seed URLs
	for _, seed := range n.cfg.SeedURLs {
		n.crawler.AddSeed(seed)
	}

	// Start API server (blocks)
	return n.apiServer.Start()
}

// Shutdown gracefully stops all subsystems.
func (n *Node) Shutdown() {
	log.Println("node: shutting down...")
	n.cancel()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	n.apiServer.Shutdown(ctx)
	n.crawler.Stop()
	n.batchIndexer.Stop()
	n.gossip.Close()
	n.discovery.Close()
	n.host.Close()
	n.bleveIdx.Close()
	n.badger.Close()

	log.Println("node: shutdown complete")
}

// Status returns the current node status.
func (n *Node) Status() *models.NodeStatus {
	docCount, _ := n.bleveIdx.DocCount()

	peers := n.host.Network().Peers()
	peerList := make([]string, 0, len(peers))
	for _, p := range peers {
		peerList = append(peerList, p.String())
	}

	return &models.NodeStatus{
		PeerID:         n.peerID.String(),
		NodeName:       n.cfg.NodeName,
		Addrs:          multiaddrsToStrings(n.host),
		ConnectedPeers: len(peers),
		PeerList:       peerList,
		IndexedDocs:    int(docCount),
		CrawledURLs:    n.urlStore.CrawledCount(),
		URLsInQueue:    n.scheduler.Pending(),
		Uptime:         time.Since(n.startedAt).Round(time.Second).String(),
		StartedAt:      n.startedAt,
	}
}

// CrawlerInfo returns crawler configuration and stats for the admin API.
func (n *Node) CrawlerInfo() *models.CrawlerInfo {
	crawled, failed, active, jsRendered := n.crawler.Stats()
	return &models.CrawlerInfo{
		Workers:       n.cfg.Crawler.Workers,
		RateLimit:     n.cfg.Crawler.RateLimit,
		MaxDepth:      n.cfg.Crawler.MaxDepth,
		UserAgent:     n.cfg.Crawler.UserAgent,
		TotalCrawled:  crawled,
		TotalFailed:   failed,
		ActiveWorkers: active,
		SeenURLs:      n.urlStore.SeenCount(),
		JSRendered:    jsRendered,
	}
}

// IndexerStats returns indexer statistics for the admin API.
func (n *Node) IndexerStats() *models.IndexerInfo {
	return n.indexer.Stats()
}

// PeersInfo returns detailed info about connected peers.
func (n *Node) PeersInfo() []models.PeerInfo {
	peers := n.host.Network().Peers()
	result := make([]models.PeerInfo, 0, len(peers))
	for _, p := range peers {
		addrs := n.host.Peerstore().Addrs(p)
		addrStrs := make([]string, 0, len(addrs))
		for _, a := range addrs {
			addrStrs = append(addrStrs, a.String())
		}
		result = append(result, models.PeerInfo{
			PeerID: p.String(),
			Addrs:  addrStrs,
		})
	}
	return result
}

// onDocumentCrawled is called by the crawler when a page is fetched.
func (n *Node) onDocumentCrawled(doc *models.Document, discoveredURLs []string) {
	// Track content changes for incremental reindexing
	if n.contentStore != nil && doc.ContentHash != "" {
		if n.contentStore.HasChanged(doc.URL, doc.ContentHash) {
			n.contentStore.Put(doc.URL, &store.ContentRecord{
				ContentHash: doc.ContentHash,
				ScoredAt:    time.Now(),
				Generation:  n.genStore.Current(),
			})
		}
	}

	// Index the document locally
	if err := n.indexer.Index(doc); err != nil {
		log.Printf("node: index error: %v", err)
	}

	// Record link graph edges
	n.recordLinks(doc)

	n.urlStore.IncrementCrawled()

	// Replicate to shard owners if we're in a multi-node setup
	n.replicateDocument(doc)

	// Schedule discovered URLs
	for _, u := range discoveredURLs {
		domain := urlutil.ExtractDomain(u)
		task := &models.CrawlTask{
			URL:       u,
			Domain:    domain,
			Depth:     doc.Depth + 1,
			Priority:  doc.Depth + 2,
			SourceURL: doc.URL,
			CreatedAt: time.Now(),
		}
		n.scheduler.Schedule(task)
	}

	// Broadcast discovered URLs to peers
	if len(discoveredURLs) > 0 {
		ann := &models.URLAnnouncement{
			URLs:      discoveredURLs,
			SourceURL: doc.URL,
			Depth:     doc.Depth + 1,
			PeerID:    n.peerID.String(),
		}
		if err := n.gossip.Publish(n.ctx, ann); err != nil {
			log.Printf("node: gossip publish error: %v", err)
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
				log.Printf("node: replicate to %s error: %v", peerID.String()[:12], err)
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
			log.Printf("node: record link error: %v", err)
		}
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

		for _, u := range ann.URLs {
			domain := urlutil.ExtractDomain(u)

			// Skip URLs from flagged domains
			if n.trustManager.IsDomainFlagged(domain) {
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
			n.scheduler.Schedule(task)
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

		// Ensure the peer is in our shard ring
		n.shards.AddNode(catalog.PeerID)
		log.Printf("shard catalog: received from %s (%d domains, %d docs, gen %d)",
			catalog.PeerID[:12], len(catalog.Domains), catalog.DocCount, catalog.Generation)
	}
}

// shardCatalogPublisher periodically publishes our shard catalog.
func (n *Node) shardCatalogPublisher() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			docCount, _ := n.bleveIdx.DocCount()
			catalog := &p2p.ShardCatalog{
				PeerID:     n.peerID.String(),
				DocCount:   docCount,
				Generation: n.genStore.Current(),
			}
			if err := n.gossip.PublishShardCatalog(n.ctx, catalog); err != nil {
				log.Printf("node: shard catalog publish error: %v", err)
			}
		case <-n.ctx.Done():
			return
		}
	}
}

// P2P handlers

func (n *Node) handlePeerSearch(req *models.SearchRequest) (*models.SearchResponse, error) {
	return n.localEng.Search(req)
}

func (n *Node) handlePeerCrawlTask(task *models.CrawlTask) error {
	n.scheduler.Schedule(task)
	return nil
}

func (n *Node) handlePeerIndexDoc(doc *models.Document) error {
	return n.indexer.Index(doc)
}

func (n *Node) handleShardCatalog(catalog *p2p.ShardCatalog) error {
	n.shards.AddNode(catalog.PeerID)
	log.Printf("shard protocol: catalog from %s (%d docs)", catalog.PeerID[:12], catalog.DocCount)
	return nil
}

func (n *Node) handleReplicateRequest(req *p2p.ReplicateRequest) (*p2p.ReplicateResponse, error) {
	accepted := 0
	for _, doc := range req.Documents {
		// Skip documents from flagged domains
		if n.trustManager.IsDomainFlagged(doc.Domain) {
			continue
		}

		if err := n.indexer.Index(doc); err != nil {
			log.Printf("replicate: index error for %s: %v", doc.URL, err)
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

	// Broadcast to peers
	if err := n.gossip.PublishSpamReport(n.ctx, report); err != nil {
		log.Printf("node: spam report publish error: %v", err)
	}

	return nil
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
			log.Printf("trust: ignoring report from quarantined peer %s", report.ReporterID[:12])
			continue
		}

		if _, err := n.trustManager.HandleReport(report); err != nil {
			log.Printf("trust: error handling peer report: %v", err)
		}
	}
}

func multiaddrsToStrings(h host.Host) []string {
	addrs := h.Addrs()
	result := make([]string, 0, len(addrs))
	for _, a := range addrs {
		result = append(result, fmt.Sprintf("%s/p2p/%s", a, h.ID()))
	}
	return result
}
