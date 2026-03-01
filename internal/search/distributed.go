package search

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/peer"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/p2p"
)

// DistributedSearch fans out queries to connected peers and merges results.
type DistributedSearch struct {
	host        host.Host
	localEngine *Engine
	peerTimeout time.Duration
	maxPeers    int
}

// NewDistributedSearch creates a distributed search engine.
func NewDistributedSearch(h host.Host, local *Engine, peerTimeout time.Duration, maxPeers int) *DistributedSearch {
	return &DistributedSearch{
		host:        h,
		localEngine: local,
		peerTimeout: peerTimeout,
		maxPeers:    maxPeers,
	}
}

// Search queries the local index and connected peers, merging all results.
func (ds *DistributedSearch) Search(ctx context.Context, req *models.SearchRequest) (*models.SearchResponse, error) {
	start := time.Now()

	// Local search
	localResp, err := ds.localEngine.Search(req)
	if err != nil {
		return nil, err
	}

	// Always re-rank local results with quality signals
	RerankResults(localResp.Results)

	// Get connected peers
	peers := ds.host.Network().Peers()
	if len(peers) == 0 {
		localResp.TookMs = time.Since(start).Milliseconds()
		return localResp, nil
	}

	// Limit peers to query
	if len(peers) > ds.maxPeers {
		peers = peers[:ds.maxPeers]
	}

	// Fan out to peers
	var mu sync.Mutex
	var wg sync.WaitGroup
	var allResults []models.SearchResult
	allResults = append(allResults, localResp.Results...)
	peersAsked := 0

	for _, pid := range peers {
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
