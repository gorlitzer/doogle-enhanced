package store

import (
	"encoding/json"
	"fmt"

	"github.com/dgraph-io/badger/v4"

	"github.com/doogle/doogle-v2/internal/fleet"
)

const prefixFleetNode = "fleet:node:" // fleet:node:<peerID> → FleetNode

// FleetStore persists fleet node registry in BadgerDB.
type FleetStore struct {
	bs *BadgerStore
}

// NewFleetStore creates a FleetStore backed by the shared BadgerStore.
func NewFleetStore(bs *BadgerStore) *FleetStore {
	return &FleetStore{bs: bs}
}

// PutNode stores or updates a fleet node entry.
func (fs *FleetStore) PutNode(node *fleet.FleetNode) error {
	data, err := json.Marshal(node)
	if err != nil {
		return fmt.Errorf("marshal fleet node: %w", err)
	}
	return fs.bs.Set([]byte(prefixFleetNode+node.PeerID), data)
}

// GetNode retrieves a fleet node by peer ID.
func (fs *FleetStore) GetNode(peerID string) (*fleet.FleetNode, error) {
	data, err := fs.bs.Get([]byte(prefixFleetNode + peerID))
	if err != nil || data == nil {
		return nil, err
	}
	var node fleet.FleetNode
	if err := json.Unmarshal(data, &node); err != nil {
		return nil, err
	}
	return &node, nil
}

// AllNodes returns all fleet node entries.
func (fs *FleetStore) AllNodes() ([]*fleet.FleetNode, error) {
	var nodes []*fleet.FleetNode
	prefix := []byte(prefixFleetNode)

	err := fs.bs.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			var node fleet.FleetNode
			err := it.Item().Value(func(val []byte) error {
				return json.Unmarshal(val, &node)
			})
			if err != nil {
				continue
			}
			nodes = append(nodes, &node)
		}
		return nil
	})

	return nodes, err
}

// DeleteNode removes a fleet node entry.
func (fs *FleetStore) DeleteNode(peerID string) error {
	return fs.bs.Delete([]byte(prefixFleetNode + peerID))
}
