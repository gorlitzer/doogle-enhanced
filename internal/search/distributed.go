package search

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/peer"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/p2p"
)

// DistributedSearch fans out queries to connected peers and merges results.
// When a ShardManager is provided, queries are routed only to shard owners.
type DistributedSearch struct {
	host              host.Host
	localEngine       *Engine
	shards            *index.ShardManager
	cache             *SearchCache
	replicationFactor int
	peerTimeout       time.Duration
	maxPeers          int

	// Peer name resolution
	PeerNameFn func(id string) string // resolve peer ID → name
	LocalName  string                 // this node's name
	LocalID    string                 // this node's peer ID

	// SearXNG metasearch fallback
	SearXNG          *SearXNGClient
	SearXNGFallback  bool // fallback-only mode
	SearXNGThreshold int  // min native results before skipping
}

// NewDistributedSearch creates a distributed search engine.
func NewDistributedSearch(h host.Host, local *Engine, shards *index.ShardManager, replicationFactor int, peerTimeout time.Duration, maxPeers int, cacheSize int, cacheTTL time.Duration) *DistributedSearch {
	if replicationFactor <= 0 {
		replicationFactor = 3
	}
	var cache *SearchCache
	if cacheSize > 0 && cacheTTL > 0 {
		cache = NewSearchCache(cacheSize, cacheTTL)
	}
	return &DistributedSearch{
		host:              h,
		localEngine:       local,
		shards:            shards,
		cache:             cache,
		replicationFactor: replicationFactor,
		peerTimeout:       peerTimeout,
		maxPeers:          maxPeers,
	}
}

// Search queries the local index and connected peers, merging all results.
// Uses shard-aware routing when a ShardManager is available.
func (ds *DistributedSearch) Search(ctx context.Context, req *models.SearchRequest) (*models.SearchResponse, error) {
	start := time.Now()

	// Check cache
	var cacheKey string
	if ds.cache != nil {
		cacheKey = CacheKey(req.Query, req.Page, req.PageSize)
		if cached := ds.cache.Get(cacheKey); cached != nil {
			return cached, nil
		}
	}

	// Local search
	localResp, err := ds.localEngine.Search(req)
	if err != nil {
		return nil, err
	}

	// Tag local results with this node's identity
	for i := range localResp.Results {
		localResp.Results[i].PeerID = ds.LocalID
		localResp.Results[i].PeerName = ds.LocalName
		if localResp.Results[i].PeerName == "" && ds.LocalID != "" {
			localResp.Results[i].PeerName = ds.LocalID[:min(12, len(ds.LocalID))] + "..."
		}
		// Resolve origin peer name
		localResp.Results[i].OriginPeerName = ds.resolveOriginName(localResp.Results[i].OriginPeerID)
	}

	// Local results were already re-ranked inside localEngine.Search; the merged
	// set is re-ranked once below (with intent), so re-ranking again here is
	// redundant. (Scoring is now idempotent, but avoid the wasted pass.)

	// Get target peers (shard-aware or full fan-out)
	targetPeers := ds.selectTargetPeers(req)
	if len(targetPeers) == 0 {
		localResp.TookMs = time.Since(start).Milliseconds()
		return localResp, nil
	}

	// Fan out to peers
	var mu sync.Mutex
	var wg sync.WaitGroup
	var allResults []models.SearchResult
	allResults = append(allResults, localResp.Results...)
	peersAsked := 0

	for _, pid := range targetPeers {
		if pid == ds.host.ID() {
			continue
		}
		wg.Add(1)
		peersAsked++
		go func(peerID peer.ID) {
			defer wg.Done()
			resp, err := p2p.QueryPeer(ctx, ds.host, peerID, req, ds.peerTimeout)
			if err != nil {
				log.Printf("distributed search: peer %s error: %v", peerID.String()[:12], err)
				return
			}
			// Tag results with peer ID and name
			for i := range resp.Results {
				resp.Results[i].PeerID = peerID.String()
				if ds.PeerNameFn != nil {
					resp.Results[i].PeerName = ds.PeerNameFn(peerID.String())
				}
				if resp.Results[i].PeerName == "" {
					resp.Results[i].PeerName = peerID.String()[:min(12, len(peerID.String()))] + "..."
				}
				// Resolve origin peer name
				resp.Results[i].OriginPeerName = ds.resolveOriginName(resp.Results[i].OriginPeerID)
			}
			mu.Lock()
			allResults = append(allResults, resp.Results...)
			mu.Unlock()
		}(pid)
	}

	wg.Wait()

	// SearXNG external search (if enabled)
	searxngCount := 0
	if ds.SearXNG != nil {
		nativeCount := len(allResults)
		if !ds.SearXNGFallback || nativeCount < ds.SearXNGThreshold {
			if ext, err := ds.SearXNG.Query(ctx, req.Query); err == nil && len(ext) > 0 {
				allResults = append(allResults, ext...)
				searxngCount = len(ext)
			}
		}
	}

	// Classify intent for reranking
	pq := ParseQuery(req.Query)
	pq.Synonyms = ExpandQuery(pq)
	intent := ClassifyIntent(pq)

	// Re-rank merged results with intent awareness
	RerankWithIntent(allResults, &intent)

	// Deduplicate by canonical URL and near-duplicate content hash (mirrors),
	// then apply domain diversity: max 2 per domain in top 10.
	deduped := DedupeResults(allResults)
	deduped = MaybeRerank(req.Query, deduped)
	deduped = ApplyDomainDiversity(deduped, 2, 10)

	// Paginate the merged/deduped/diversified set. Previously this always sliced
	// the first pageSize regardless of req.Page, so pages 2+ returned page 1.
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 10
	}
	page := req.Page
	if page < 1 {
		page = 1
	}
	total := len(deduped)
	offset := (page - 1) * pageSize
	switch {
	case offset >= len(deduped):
		deduped = nil
	case offset+pageSize >= len(deduped):
		deduped = deduped[offset:]
	default:
		deduped = deduped[offset : offset+pageSize]
	}

	resp := &models.SearchResponse{
		Query:          req.Query,
		Results:        deduped,
		Total:          total,
		Page:           req.Page,
		PageSize:       pageSize,
		TookMs:         time.Since(start).Milliseconds(),
		PeersAsked:     peersAsked,
		SearXNGResults: searxngCount,
		Intent:         intent.Type.String(),
	}

	// Spelling suggestion
	if ds.localEngine.spellChecker != nil {
		if suggestion, ok := ds.localEngine.spellChecker.Suggest(req.Query); ok {
			resp.Suggestion = suggestion
		}
	}

	// Instant answers / featured snippets
	if instant := DetectInstantAnswer(req.Query); instant != nil {
		resp.FeaturedSnippet = instant
	} else if len(deduped) > 0 {
		if featured := ExtractFeaturedSnippet(req.Query, deduped, &intent); featured != nil {
			resp.FeaturedSnippet = featured
		}
	}

	// Related searches
	resp.RelatedSearches = GenerateRelatedSearches(pq, resp.RelatedTopics)

	// Store in cache
	if ds.cache != nil {
		ds.cache.Put(cacheKey, resp)
	}

	return resp, nil
}

// resolveOriginName resolves an origin peer ID to a human-readable name.
func (ds *DistributedSearch) resolveOriginName(originPeerID string) string {
	if originPeerID == "" {
		return ds.LocalName
	}
	if originPeerID == ds.LocalID {
		return ds.LocalName
	}
	if ds.PeerNameFn != nil {
		if name := ds.PeerNameFn(originPeerID); name != "" {
			return name
		}
	}
	return ""
}

// selectTargetPeers determines which peers to query based on the search request.
// For site: queries, only shard owners are queried.
// For general queries, the covering set of the hash ring is used.
func (ds *DistributedSearch) selectTargetPeers(req *models.SearchRequest) []peer.ID {
	// Early exit: no other Doogle peers in the ring → local-only search
	if ds.shards == nil || ds.shards.NodeCount() <= 1 {
		return nil
	}

	connectedPeers := ds.host.Network().Peers()
	if len(connectedPeers) == 0 {
		return nil
	}

	// Parse query for site: filter
	pq := ParseQuery(req.Query)

	if pq.SiteDomain != "" {
		// Query only shard owners for this domain
		ownerIDs := ds.shards.Owners(pq.SiteDomain, ds.replicationFactor)
		return ds.resolvePeers(ownerIDs, connectedPeers)
	}

	// General query: use the covering set (all ring members)
	// This is an optimization — instead of all connected peers (which may
	// include non-indexed peers), we query only those in the hash ring.
	coveringIDs := ds.shards.CoveringSet()
	targets := ds.resolvePeers(coveringIDs, connectedPeers)

	// If covering set is larger than maxPeers, limit it
	return ds.limitPeers(targets)
}

// resolvePeers converts string peer IDs to peer.ID, filtering to only connected peers.
func (ds *DistributedSearch) resolvePeers(peerIDStrs []string, connected []peer.ID) []peer.ID {
	connSet := make(map[peer.ID]bool, len(connected))
	for _, p := range connected {
		connSet[p] = true
	}

	var result []peer.ID
	for _, idStr := range peerIDStrs {
		pid, err := peer.Decode(idStr)
		if err != nil {
			continue
		}
		if connSet[pid] && pid != ds.host.ID() {
			result = append(result, pid)
		}
	}
	return result
}

func (ds *DistributedSearch) limitPeers(peers []peer.ID) []peer.ID {
	if len(peers) > ds.maxPeers {
		return peers[:ds.maxPeers]
	}
	return peers
}

// ParseQuery is imported from engine.go — extract site: filter for routing.
func extractSiteDomain(query string) string {
	for _, part := range strings.Fields(query) {
		if strings.HasPrefix(part, "site:") {
			return strings.TrimPrefix(part, "site:")
		}
	}
	return ""
}
