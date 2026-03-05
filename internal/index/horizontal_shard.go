package index

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
)

// HorizontalShardManager splits a local index into multiple Bleve shards
// by domain hash. This improves write throughput and allows per-shard operations.
type HorizontalShardManager struct {
	mu        sync.RWMutex
	shards    map[int]*BleveStore
	numShards int
	baseDir   string
}

// NewHorizontalShardManager creates a manager with n local shards.
func NewHorizontalShardManager(baseDir string, numShards int) (*HorizontalShardManager, error) {
	if numShards <= 0 {
		numShards = 4
	}

	hsm := &HorizontalShardManager{
		shards:    make(map[int]*BleveStore, numShards),
		numShards: numShards,
		baseDir:   baseDir,
	}

	for i := 0; i < numShards; i++ {
		shardDir := filepath.Join(baseDir, fmt.Sprintf("shard_%d", i))
		if err := os.MkdirAll(filepath.Dir(shardDir), 0755); err != nil {
			return nil, fmt.Errorf("create shard dir: %w", err)
		}
		store, err := NewBleveStore(shardDir)
		if err != nil {
			// Close already-opened shards
			for _, s := range hsm.shards {
				s.Close()
			}
			return nil, fmt.Errorf("open shard %d: %w", i, err)
		}
		hsm.shards[i] = store
	}

	log.Printf("horizontal sharding: opened %d local shards in %s", numShards, baseDir)
	return hsm, nil
}

// ShardFor returns the shard index for a given domain.
func (hsm *HorizontalShardManager) ShardFor(domain string) int {
	h := domainHash(domain)
	return int(h % uint32(hsm.numShards))
}

// GetShard returns the BleveStore for the given shard index.
func (hsm *HorizontalShardManager) GetShard(idx int) *BleveStore {
	hsm.mu.RLock()
	defer hsm.mu.RUnlock()
	return hsm.shards[idx]
}

// GetShardForDomain returns the BleveStore for a domain.
func (hsm *HorizontalShardManager) GetShardForDomain(domain string) *BleveStore {
	return hsm.GetShard(hsm.ShardFor(domain))
}

// Index routes a document to the correct shard.
func (hsm *HorizontalShardManager) Index(doc *IndexDocument) error {
	shard := hsm.GetShardForDomain(doc.Domain)
	if shard == nil {
		return fmt.Errorf("no shard for domain %s", doc.Domain)
	}
	return shard.Index(doc)
}

// TotalDocCount returns the sum of documents across all shards.
func (hsm *HorizontalShardManager) TotalDocCount() uint64 {
	hsm.mu.RLock()
	defer hsm.mu.RUnlock()

	var total uint64
	for _, shard := range hsm.shards {
		c, err := shard.DocCount()
		if err == nil {
			total += c
		}
	}
	return total
}

// ShardStats returns per-shard document counts.
func (hsm *HorizontalShardManager) ShardStats() map[int]uint64 {
	hsm.mu.RLock()
	defer hsm.mu.RUnlock()

	stats := make(map[int]uint64, hsm.numShards)
	for i, shard := range hsm.shards {
		c, _ := shard.DocCount()
		stats[i] = c
	}
	return stats
}

// AllShards returns all shard stores.
func (hsm *HorizontalShardManager) AllShards() []*BleveStore {
	hsm.mu.RLock()
	defer hsm.mu.RUnlock()

	result := make([]*BleveStore, 0, hsm.numShards)
	for i := 0; i < hsm.numShards; i++ {
		if s, ok := hsm.shards[i]; ok {
			result = append(result, s)
		}
	}
	return result
}

// Close closes all shard indexes.
func (hsm *HorizontalShardManager) Close() {
	hsm.mu.Lock()
	defer hsm.mu.Unlock()

	for _, shard := range hsm.shards {
		shard.Close()
	}
}

// domainHash returns a uint32 hash for a domain string.
func domainHash(domain string) uint32 {
	var h uint32 = 2166136261 // FNV offset basis
	for _, c := range domain {
		h ^= uint32(c)
		h *= 16777619 // FNV prime
	}
	return h
}
