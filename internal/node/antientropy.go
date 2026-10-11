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
	defer n.bgWg.Done()
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

		idHashes, err := n.bleveIdx.ListIDHashesByDomain(domain)
		if err != nil {
			log.Printf("anti-entropy: list id hashes for %s error: %v", domain, err)
			continue
		}

		// Fingerprints fold each doc's content hash into the Merkle root, so a
		// replica that has the same URLs but stale CONTENT is now detected as
		// diverged (previously the ID-only root reported it in sync forever).
		fps := make([]string, 0, len(idHashes))
		for id, h := range idHashes {
			fps = append(fps, p2p.Fingerprint(id, h))
		}
		localRoot := p2p.ComputeMerkleRoot(fps)

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
				DocIDs:     fps,
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
	localIDHashes, err := n.bleveIdx.ListIDHashesByDomain(req.Domain)
	if err != nil {
		return &p2p.AntiEntropyResponse{Status: "error"}, err
	}

	// Build local fingerprints (id+content hash) to match the requester's root.
	localFPs := make([]string, 0, len(localIDHashes))
	localSet := make(map[string]struct{}, len(localIDHashes))
	for id, h := range localIDHashes {
		fp := p2p.Fingerprint(id, h)
		localFPs = append(localFPs, fp)
		localSet[fp] = struct{}{}
	}

	localRoot := p2p.ComputeMerkleRoot(localFPs)

	if localRoot == req.MerkleRoot {
		return &p2p.AntiEntropyResponse{
			Status:     "ok",
			MerkleRoot: localRoot,
		}, nil
	}

	// A requester fingerprint we don't have means either a doc we're missing or
	// one whose content diverged (same ID, different hash). Either way we want
	// the requester's copy, so return the underlying doc ID for repair.
	var missingIDs []string
	for _, fp := range req.DocIDs {
		if _, exists := localSet[fp]; !exists {
			missingIDs = append(missingIDs, p2p.FingerprintID(fp))
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
