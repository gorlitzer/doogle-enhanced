package index

import (
	"context"
	"log"
	"sync"
	"time"
)

// Rebalancer monitors the consistent hash ring for topology changes
// and transfers documents to their new owners when peers join or leave.
type Rebalancer struct {
	shards            *ShardManager
	store             *BleveStore
	selfID            string
	replicationFactor int
	transferFn        TransferFn

	mu            sync.Mutex
	lastMembers   map[string]bool
	checkInterval time.Duration
}

// TransferFn is called to send documents to a new shard owner.
// Returns the number of documents successfully transferred.
type TransferFn func(ctx context.Context, peerID string, docs []*IndexDocument) (int, error)

// truncID safely truncates an ID for logging without panicking on short values.
func truncID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

// NewRebalancer creates a rebalancer that watches for ring changes.
func NewRebalancer(shards *ShardManager, store *BleveStore, selfID string, rf int, transferFn TransferFn) *Rebalancer {
	members := make(map[string]bool)
	for _, m := range shards.AllMembers() {
		members[m] = true
	}

	return &Rebalancer{
		shards:            shards,
		store:             store,
		selfID:            selfID,
		replicationFactor: rf,
		transferFn:        transferFn,
		lastMembers:       members,
		checkInterval:     30 * time.Second,
	}
}

// Start begins the background rebalance loop.
func (r *Rebalancer) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(r.checkInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.check(ctx)
			}
		}
	}()
	log.Printf("rebalancer: started (check interval=%s, rf=%d)", r.checkInterval, r.replicationFactor)
}

// check compares current ring members with last known state and triggers rebalance if needed.
func (r *Rebalancer) check(ctx context.Context) {
	r.mu.Lock()
	defer r.mu.Unlock()

	currentMembers := make(map[string]bool)
	for _, m := range r.shards.AllMembers() {
		currentMembers[m] = true
	}

	// Detect added and removed nodes
	var added, removed []string
	for m := range currentMembers {
		if !r.lastMembers[m] {
			added = append(added, m)
		}
	}
	for m := range r.lastMembers {
		if !currentMembers[m] {
			removed = append(removed, m)
		}
	}

	if len(added) == 0 && len(removed) == 0 {
		return // no topology change
	}

	log.Printf("rebalancer: topology changed (added=%d, removed=%d)", len(added), len(removed))
	r.lastMembers = currentMembers

	// When a new node joins, check if we have domains that should now belong to it
	if len(added) > 0 {
		r.rebalanceForNewNodes(ctx, added)
	}

	// When a node leaves, repair replica coverage for domains we hold
	if len(removed) > 0 {
		r.rebalanceForRemovedNodes(ctx, removed)
	}
}

// rebalanceForNewNodes finds domains that should now be owned by new nodes
// and transfers the documents to them.
func (r *Rebalancer) rebalanceForNewNodes(ctx context.Context, newNodes []string) {
	if r.transferFn == nil {
		return
	}

	domains, err := r.store.ListDomains()
	if err != nil {
		log.Printf("rebalancer: list domains error: %v", err)
		return
	}

	// Group documents by new owner
	toTransfer := make(map[string][]string) // peerID → list of domain names

	for _, domain := range domains {
		owners := r.shards.Owners(domain, r.replicationFactor)
		myOwner := false
		for _, o := range owners {
			if o == r.selfID {
				myOwner = true
				break
			}
		}

		if myOwner {
			continue // we're still an owner, keep it
		}

		// This domain no longer belongs to us. Find who should have it.
		primaryOwner := r.shards.Owner(domain)
		if primaryOwner != "" && primaryOwner != r.selfID {
			toTransfer[primaryOwner] = append(toTransfer[primaryOwner], domain)
		}
	}

	if len(toTransfer) == 0 {
		return
	}

	totalTransferred := 0
	for peerID, peerDomains := range toTransfer {
		// Collect documents for these domains, keeping each doc's ID alongside it
		// so we delete exactly what we transferred (and nothing indexed since).
		var docs []*IndexDocument
		var docIDs []string
		for _, domain := range peerDomains {
			ids, err := r.store.ListIDsByDomain(domain)
			if err != nil {
				continue
			}
			for _, id := range ids {
				doc, err := r.store.Get(id)
				if err != nil || doc == nil {
					continue
				}
				docs = append(docs, doc)
				docIDs = append(docIDs, id)
			}
		}

		if len(docs) == 0 {
			continue
		}

		// Transfer in batches of 50.
		batchSize := 50
		transferredForPeer := 0
		transferOK := true
		for i := 0; i < len(docs); i += batchSize {
			end := i + batchSize
			if end > len(docs) {
				end = len(docs)
			}
			batch := docs[i:end]

			transferred, err := r.transferFn(ctx, peerID, batch)
			if err != nil {
				log.Printf("rebalancer: transfer to %s failed: %v", truncID(peerID), err)
				transferOK = false
				break
			}
			transferredForPeer += transferred
		}
		totalTransferred += transferredForPeer

		// Only delete local copies when EVERY document was transferred and
		// acknowledged. Deleting on a failed or partial transfer risks destroying
		// the last replica of a document — permanent data loss. When in doubt we
		// keep the local copy; a later rebalance pass will retry.
		if transferOK && transferredForPeer == len(docs) {
			for _, id := range docIDs {
				_ = r.store.Delete(id)
			}
			log.Printf("rebalancer: transferred and removed %d domains (%d docs) to %s",
				len(peerDomains), len(docs), truncID(peerID))
		} else {
			log.Printf("rebalancer: keeping %d local docs for %s — transfer incomplete (%d/%d acknowledged)",
				len(docs), truncID(peerID), transferredForPeer, len(docs))
		}
	}

	if totalTransferred > 0 {
		log.Printf("rebalancer: total transferred %d documents", totalTransferred)
	}
}

// rebalanceForRemovedNodes repairs replica coverage when peers leave the ring.
// For each domain we still own, we push documents to any new owners that appeared
// in the updated ring (replacing the dead node). We keep our local copies.
func (r *Rebalancer) rebalanceForRemovedNodes(ctx context.Context, removedNodes []string) {
	if r.transferFn == nil {
		return
	}

	domains, err := r.store.ListDomains()
	if err != nil {
		log.Printf("rebalancer: list domains error: %v", err)
		return
	}

	// For each domain we still own, find new owners that need the data
	toRepair := make(map[string][]string) // peerID → list of domain names

	for _, domain := range domains {
		owners := r.shards.Owners(domain, r.replicationFactor)

		// Only repair domains we still own — we're a surviving replica
		weOwn := false
		for _, o := range owners {
			if o == r.selfID {
				weOwn = true
				break
			}
		}
		if !weOwn {
			continue
		}

		// The ring has already been updated (dead nodes removed).
		// Push to all non-self owners so they have the data that
		// the dead node was previously responsible for. Receivers deduplicate.
		for _, o := range owners {
			if o != r.selfID {
				toRepair[o] = append(toRepair[o], domain)
			}
		}
	}

	if len(toRepair) == 0 {
		return
	}

	// Deduplicate domain lists per peer
	for peerID, peerDomains := range toRepair {
		seen := make(map[string]bool, len(peerDomains))
		unique := peerDomains[:0]
		for _, d := range peerDomains {
			if !seen[d] {
				seen[d] = true
				unique = append(unique, d)
			}
		}
		toRepair[peerID] = unique
	}

	totalRepaired := 0
	for peerID, peerDomains := range toRepair {
		var docs []*IndexDocument
		for _, domain := range peerDomains {
			ids, err := r.store.ListIDsByDomain(domain)
			if err != nil {
				continue
			}
			for _, id := range ids {
				doc, err := r.store.Get(id)
				if err != nil || doc == nil {
					continue
				}
				docs = append(docs, doc)
			}
		}

		if len(docs) == 0 {
			continue
		}

		batchSize := 50
		for i := 0; i < len(docs); i += batchSize {
			end := i + batchSize
			if end > len(docs) {
				end = len(docs)
			}
			batch := docs[i:end]

			repaired, err := r.transferFn(ctx, peerID, batch)
			if err != nil {
				log.Printf("rebalancer: repair to %s failed: %v", truncID(peerID), err)
				break
			}
			totalRepaired += repaired
		}

		log.Printf("rebalancer: repaired %d domains (%d docs) to %s",
			len(peerDomains), len(docs), truncID(peerID))
	}

	if totalRepaired > 0 {
		log.Printf("rebalancer: total repaired %d documents across %d peers",
			totalRepaired, len(toRepair))
	}
}
