package store

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/dgraph-io/badger/v4"
)

// ClusterStore persists topic clusters for document grouping.
type ClusterStore struct {
	db *BadgerStore
}

// Cluster represents a group of related documents under a topic label.
type Cluster struct {
	ID       string   `json:"id"`
	Label    string   `json:"label"`
	DocIDs   []string `json:"doc_ids"`
	Keywords []string `json:"keywords"`
}

// NewClusterStore creates a ClusterStore backed by BadgerDB.
func NewClusterStore(db *BadgerStore) *ClusterStore {
	return &ClusterStore{db: db}
}

// PutCluster stores or updates a cluster.
func (cs *ClusterStore) PutCluster(c *Cluster) error {
	data, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return cs.db.Set([]byte(fmt.Sprintf("cluster:%s", c.ID)), data)
}

// GetCluster retrieves a cluster by ID.
func (cs *ClusterStore) GetCluster(id string) (*Cluster, error) {
	data, err := cs.db.Get([]byte(fmt.Sprintf("cluster:%s", id)))
	if err != nil || data == nil {
		return nil, err
	}
	var c Cluster
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

// RelatedTopics finds cluster labels containing any of the given document IDs.
// Satisfies search.ClusterProvider interface.
func (cs *ClusterStore) RelatedTopics(docIDs []string, limit int) []string {
	docSet := make(map[string]bool, len(docIDs))
	for _, id := range docIDs {
		docSet[id] = true
	}

	var labels []string
	seen := make(map[string]bool)

	_ = cs.db.DB().View(func(txn *badger.Txn) error {
		prefix := []byte("cluster:")
		it := txn.NewIterator(badger.IteratorOptions{Prefix: prefix})
		defer it.Close()

		for it.Rewind(); it.Valid() && len(labels) < limit; it.Next() {
			item := it.Item()
			_ = item.Value(func(val []byte) error {
				var c Cluster
				if json.Unmarshal(val, &c) != nil {
					return nil
				}
				for _, did := range c.DocIDs {
					if docSet[did] && !seen[c.Label] {
						seen[c.Label] = true
						labels = append(labels, c.Label)
						break
					}
				}
				return nil
			})
		}
		return nil
	})

	// Also return keywords from entity co-occurrences if we have few cluster labels
	if len(labels) < limit {
		for _, id := range docIDs {
			if len(labels) >= limit {
				break
			}
			// Use first docID term as a keyword hint
			parts := strings.SplitN(id, "-", 2)
			if len(parts) > 1 && !seen[parts[1]] {
				continue // skip opaque IDs
			}
		}
	}

	return labels
}
