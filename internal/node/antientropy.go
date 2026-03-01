package node

import (
	"log"
	"math/rand"
	"time"

	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/p2p"
)

// antiEntropyLoop runs periodic Merkle-based consistency checks with replica peers.
func (n *Node) antiEntropyLoop() {
	interval := n.cfg.Index.AntiEntropyInterval
	if interval <= 0 {
		interval = 2 * time.Minute
	}

	// Add initial jitter before first tick
	jitter := time.Duration(rand.Int63n(int64(30 * time.Second)))
	select {
	case <-time.After(jitter):
	case <-n.ctx.Done():
		return
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Add per-tick jitter by resetting the ticker
			jitter := time.Duration(rand.Int63n(int64(30 * time.Second)))
			ticker.Reset(interval + jitter)

			if n.shards.NodeCount() <= 1 {
				continue
			}
			n.runAntiEntropy()
		case <-n.ctx.Done():
			return
		}
	}
}

// runAntiEntropy checks all locally-owned domains against replica peers.
func (n *Node) runAntiEntropy() {
	domains, err := n.bleveIdx.ListDomains()
	if err != nil {
		log.Printf("anti-entropy: list domains error: %v", err)
		return
	}

	selfID := n.peerID.String()
	rf := n.cfg.Index.ReplicationFactor

	for _, domain := range domains {
		if !n.shards.IsOwner(selfID, domain, rf) {
			continue
		}

		ids, err := n.bleveIdx.ListIDsByDomain(domain)
		if err != nil {
			log.Printf("anti-entropy: list IDs for %s error: %v", domain, err)
			continue
		}

		localRoot := p2p.ComputeMerkleRoot(ids)

		// Get replica peers for this domain, skip self
		owners := n.shards.Owners(domain, rf)
		for _, ownerID := range owners {
			if ownerID == selfID {
				continue
			}

			pid, err := peer.Decode(ownerID)
			if err != nil {
				continue
			}
			if n.host.Network().Connectedness(pid) != network.Connected {
				continue
			}

			req := &p2p.AntiEntropyRequest{
				Domain:     domain,
				MerkleRoot: localRoot,
				DocIDs:     ids,
			}

			resp, err := p2p.SendAntiEntropyRequest(n.ctx, n.host, pid, req, 30*time.Second)
			if err != nil {
				log.Printf("anti-entropy: request to %s for domain %s error: %v", ownerID[:12], domain, err)
				continue
			}

			if resp.Status == "ok" && resp.MerkleRoot == localRoot {
				log.Printf("anti-entropy: domain %s in sync with peer %s", domain, ownerID[:12])
				continue
			}

			if resp.Status == "diverged" && len(resp.MissingIDs) > 0 {
				log.Printf("anti-entropy: domain %s diverged from peer %s, repairing %d docs",
					domain, ownerID[:12], len(resp.MissingIDs))
				n.repairMissingDocs(pid, resp.MissingIDs)
			}
		}
	}
}

// handleAntiEntropyRequest processes an incoming anti-entropy request from a peer.
func (n *Node) handleAntiEntropyRequest(req *p2p.AntiEntropyRequest) (*p2p.AntiEntropyResponse, error) {
	localIDs, err := n.bleveIdx.ListIDsByDomain(req.Domain)
	if err != nil {
		return &p2p.AntiEntropyResponse{Status: "error"}, err
	}

	localRoot := p2p.ComputeMerkleRoot(localIDs)

	if localRoot == req.MerkleRoot {
		return &p2p.AntiEntropyResponse{
			Status:     "ok",
			MerkleRoot: localRoot,
		}, nil
	}

	// Compute set difference: IDs in remote's list that we don't have locally
	localSet := make(map[string]struct{}, len(localIDs))
	for _, id := range localIDs {
		localSet[id] = struct{}{}
	}

	var missingIDs []string
	for _, id := range req.DocIDs {
		if _, exists := localSet[id]; !exists {
			missingIDs = append(missingIDs, id)
		}
	}

	return &p2p.AntiEntropyResponse{
		Status:     "diverged",
		MerkleRoot: localRoot,
		MissingIDs: missingIDs,
	}, nil
}

// repairMissingDocs fetches documents by ID from the local index and sends them to the peer.
func (n *Node) repairMissingDocs(peerID peer.ID, missingIDs []string) {
	var docs []*models.Document
	for _, id := range missingIDs {
		idoc, err := n.bleveIdx.Get(id)
		if err != nil {
			log.Printf("anti-entropy: get doc %s error: %v", id, err)
			continue
		}
		docs = append(docs, indexDocToModel(idoc))
	}

	if len(docs) == 0 {
		return
	}

	req := &p2p.ReplicateRequest{
		Documents:  docs,
		Generation: n.genStore.Current(),
	}
	resp, err := p2p.ReplicateDocuments(n.ctx, n.host, peerID, req, 30*time.Second)
	if err != nil {
		log.Printf("anti-entropy: replicate to %s error: %v", peerID.String()[:12], err)
		return
	}
	log.Printf("anti-entropy: repaired %d docs to peer %s", resp.Accepted, peerID.String()[:12])
}

// indexDocToModel converts an IndexDocument back to a models.Document for replication.
func indexDocToModel(idoc *index.IndexDocument) *models.Document {
	return &models.Document{
		ID:                idoc.ID,
		URL:               idoc.URL,
		Domain:            idoc.Domain,
		Title:             idoc.Title,
		Description:       idoc.Description,
		Content:           idoc.Content,
		ContentHash:       idoc.ContentHash,
		ContentSize:       idoc.ContentSize,
		StatusCode:        idoc.StatusCode,
		Depth:             idoc.Depth,
		WordCount:         idoc.WordCount,
		CrawledAt:         idoc.CrawledAt,
		IndexedAt:         idoc.IndexedAt,
		Language:          idoc.Language,
		IsHTTPS:           idoc.IsHTTPS,
		PageRankScore:     idoc.PageRankScore,
		EEATScore:         idoc.EEATScore,
		QualityScore:      idoc.QualityScore,
		SpamScore:         idoc.SpamScore,
		LinkScore:         idoc.LinkScore,
		SEOScore:          idoc.SEOScore,
		ReadabilityScore:  idoc.ReadabilityScore,
		CitationScore:     idoc.CitationScore,
		FreshnessScore:    idoc.FreshnessScore,
		AuthorCredibility: idoc.AuthorCredibility,
		RelevanceScore:    idoc.RelevanceScore,
		IsTimeSensitive:   idoc.IsTimeSensitive,
		IsEvergreen:       idoc.IsEvergreen,
	}
}
