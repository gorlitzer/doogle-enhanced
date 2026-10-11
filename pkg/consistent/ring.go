package consistent

import (
	"crypto/sha256"
	"encoding/binary"
	"sort"
	"sync"
)

// Ring implements a consistent hash ring for shard assignment.
type Ring struct {
	mu       sync.RWMutex
	nodes    map[string]bool
	ring     []hashEntry
	replicas int // virtual nodes per real node
}

type hashEntry struct {
	hash uint32
	node string
}

// NewRing creates a consistent hash ring with the given number of virtual nodes.
func NewRing(replicas int) *Ring {
	if replicas <= 0 {
		replicas = 64
	}
	return &Ring{
		nodes:    make(map[string]bool),
		replicas: replicas,
	}
}

// Add inserts a node into the ring.
func (r *Ring) Add(node string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.nodes[node] {
		return
	}
	r.nodes[node] = true
	r.rebuildLocked()
}

// Remove deletes a node from the ring.
func (r *Ring) Remove(node string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.nodes[node] {
		return
	}
	delete(r.nodes, node)
	r.rebuildLocked()
}

// Get returns the node responsible for the given key.
func (r *Ring) Get(key string) string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if len(r.ring) == 0 {
		return ""
	}

	h := hashKey(key)
	idx := sort.Search(len(r.ring), func(i int) bool {
		return r.ring[i].hash >= h
	})
	if idx >= len(r.ring) {
		idx = 0
	}
	return r.ring[idx].node
}

// GetN returns up to n distinct nodes responsible for the key (primary + replicas).
func (r *Ring) GetN(key string, n int) []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if len(r.ring) == 0 {
		return nil
	}

	h := hashKey(key)
	idx := sort.Search(len(r.ring), func(i int) bool {
		return r.ring[i].hash >= h
	})

	seen := make(map[string]bool)
	var result []string
	for i := 0; i < len(r.ring) && len(result) < n; i++ {
		pos := (idx + i) % len(r.ring)
		node := r.ring[pos].node
		if !seen[node] {
			seen[node] = true
			result = append(result, node)
		}
	}
	return result
}

// Members returns all nodes in the ring.
func (r *Ring) Members() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]string, 0, len(r.nodes))
	for node := range r.nodes {
		result = append(result, node)
	}
	return result
}

// Has returns true if the node is in the ring.
func (r *Ring) Has(node string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.nodes[node]
}

// Size returns the number of nodes.
func (r *Ring) Size() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.nodes)
}

func (r *Ring) rebuildLocked() {
	r.ring = nil
	for node := range r.nodes {
		for i := 0; i < r.replicas; i++ {
			vkey := node + "#" + string(rune(i))
			r.ring = append(r.ring, hashEntry{
				hash: hashKey(vkey),
				node: node,
			})
		}
	}
	sort.Slice(r.ring, func(i, j int) bool {
		if r.ring[i].hash != r.ring[j].hash {
			return r.ring[i].hash < r.ring[j].hash
		}
		// Deterministic tie-break on hash collision. Without it, two vnodes that
		// hash to the same 32-bit value could order differently on different
		// nodes (sort.Slice is not stable and map iteration order varies), so a
		// key landing on that boundary would resolve to different owners on
		// different nodes — a split-brain / inconsistent-replication risk that
		// becomes likely (birthday bound) at ~1k nodes.
		return r.ring[i].node < r.ring[j].node
	})
}

func hashKey(key string) uint32 {
	h := sha256.Sum256([]byte(key))
	return binary.BigEndian.Uint32(h[:4])
}
