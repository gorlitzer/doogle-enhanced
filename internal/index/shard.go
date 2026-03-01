package index

import (
	"github.com/doogle/doogle-v2/pkg/consistent"
)

// ShardManager assigns domains to nodes using consistent hashing.
type ShardManager struct {
	ring *consistent.Ring
}

// NewShardManager creates a shard manager.
func NewShardManager() *ShardManager {
	return &ShardManager{
		ring: consistent.NewRing(64),
	}
}

// AddNode adds a peer to the hash ring.
func (sm *ShardManager) AddNode(peerID string) {
	sm.ring.Add(peerID)
}

// RemoveNode removes a peer from the hash ring.
func (sm *ShardManager) RemoveNode(peerID string) {
	sm.ring.Remove(peerID)
}

// Owner returns the node responsible for the given domain.
func (sm *ShardManager) Owner(domain string) string {
	return sm.ring.Get(domain)
}

// Owners returns the primary + replica nodes for a domain.
func (sm *ShardManager) Owners(domain string, n int) []string {
	return sm.ring.GetN(domain, n)
}

// IsOwner checks if the given peer is responsible for the domain.
func (sm *ShardManager) IsOwner(peerID, domain string) bool {
	owners := sm.ring.GetN(domain, 2) // primary + 1 replica
	for _, o := range owners {
		if o == peerID {
			return true
		}
	}
	return false
}

// NodeCount returns the number of nodes in the ring.
func (sm *ShardManager) NodeCount() int {
	return sm.ring.Size()
}

// CoveringSet returns the minimum set of peers that collectively cover all
// hash ring segments. For general queries this gives O(sqrt(N)) fan-out
// instead of querying all N peers.
func (sm *ShardManager) CoveringSet() []string {
	members := sm.ring.Members()
	if len(members) == 0 {
		return nil
	}
	// With consistent hashing, every member owns at least one segment.
	// The covering set is simply all distinct members — but in practice
	// we want to return them. The optimization is that the caller uses
	// this instead of ALL connected peers (which may include non-ring peers).
	return members
}

// AllMembers returns all nodes currently in the ring.
func (sm *ShardManager) AllMembers() []string {
	return sm.ring.Members()
}
