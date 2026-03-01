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
	replicationFactor int
	peerTimeout       time.Duration
	maxPeers          int
}

// NewDistributedSearch creates a distributed search engine.
func NewDistributedSearch(h host.Host, local *Engine, shards *index.ShardManager, replicationFactor int, peerTimeout time.Duration, maxPeers int) *DistributedSearch {
	if replicationFactor <= 0 {
		replicationFactor = 3
	}
	return &DistributedSearch{
		host:              h,
		localEngine:       local,
		shards:            shards,
		replicationFactor: replicationFactor,
		peerTimeout:       peerTimeout,
		maxPeers:          maxPeers,
	}
}

// Search queries the local index and connected peers, merging all results.
// Uses shard-aware routing when a ShardManager is available.
func (ds *DistributedSearch) Search(ctx context.Context, req *models.SearchRequest) (*models.SearchResponse, error) {
	start := time.Now()

	// Local search
	localResp, err := ds.localEngine.Search(req)
	if err != nil {
		return nil, err
	}

	// Always re-rank local results with quality signals
	RerankResults(localResp.Results)

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
			// Tag results with peer ID
			for i := range resp.Results {
				resp.Results[i].PeerID = peerID.String()
			}
			mu.Lock()
			allResults = append(allResults, resp.Results...)
			mu.Unlock()
		}(pid)
	}

	wg.Wait()

	// Re-rank merged results
	RerankResults(allResults)

	// Deduplicate by URL
	seen := make(map[string]bool)
	var deduped []models.SearchResult
	for _, r := range allResults {
		if !seen[r.URL] {
			seen[r.URL] = true
			deduped = append(deduped, r)
		}
	}

	// Paginate
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 10
	}
	if len(deduped) > pageSize {
		deduped = deduped[:pageSize]
	}

	return &models.SearchResponse{
		Query:      req.Query,
		Results:    deduped,
		Total:      len(deduped),
		Page:       req.Page,
		PageSize:   pageSize,
		TookMs:     time.Since(start).Milliseconds(),
		PeersAsked: peersAsked,
	}, nil
}

// selectTargetPeers determines which peers to query based on the search request.
// For site: queries, only shard owners are queried.
// For general queries, the covering set of the hash ring is used.
func (ds *DistributedSearch) selectTargetPeers(req *models.SearchRequest) []peer.ID {
	connectedPeers := ds.host.Network().Peers()
	if len(connectedPeers) == 0 {
		return nil
	}

	// If no shard manager, fall back to querying all connected peers
	if ds.shards == nil || ds.shards.NodeCount() <= 1 {
		return ds.limitPeers(connectedPeers)
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
