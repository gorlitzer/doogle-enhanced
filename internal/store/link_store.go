package store

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/dgraph-io/badger/v4"
)

const (
	linkPrefix     = "link:"
	linkCountPfx   = "linkcount:"
	outCountPfx    = "outcount:"
)

// LinkEdge represents a single link between two documents.
type LinkEdge struct {
	FromURL    string `json:"from_url"`
	ToURL      string `json:"to_url"`
	AnchorText string `json:"anchor_text"`
	IsCross    bool   `json:"is_cross"`
}

// LinkStore persists the backlink graph in BadgerDB.
type LinkStore struct {
	db *badger.DB
	mu sync.RWMutex
}

// NewLinkStore creates a LinkStore backed by the given BadgerStore.
func NewLinkStore(bs *BadgerStore) *LinkStore {
	return &LinkStore{db: bs.db}
}

// AddLink atomically writes an edge and updates both inbound and outbound counters.
// Idempotent — overwrites existing edges with the same key.
func (ls *LinkStore) AddLink(fromID, toID string, edge LinkEdge) error {
	ls.mu.Lock()
	defer ls.mu.Unlock()

	edgeKey := []byte(fmt.Sprintf("%s%s:%s", linkPrefix, toID, fromID))
	data, err := json.Marshal(edge)
	if err != nil {
		return fmt.Errorf("marshal link edge: %w", err)
	}

	return ls.db.Update(func(txn *badger.Txn) error {
		// Check if edge already exists (for idempotent counter updates)
		_, err := txn.Get(edgeKey)
		isNew := err == badger.ErrKeyNotFound

		// Write the edge
		if err := txn.Set(edgeKey, data); err != nil {
			return err
		}

		// Only bump counters for new edges
		if isNew {
			// Increment inbound count for destination
			inKey := []byte(linkCountPfx + toID)
			inCount := ls.getCountInTxn(txn, inKey)
			if err := txn.Set(inKey, encodeUint32(inCount+1)); err != nil {
				return err
			}

			// Increment outbound count for source
			outKey := []byte(outCountPfx + fromID)
			outCount := ls.getCountInTxn(txn, outKey)
			if err := txn.Set(outKey, encodeUint32(outCount+1)); err != nil {
				return err
			}
		}

		return nil
	})
}

// GetInboundLinks returns all inbound link edges for a given destination doc.
func (ls *LinkStore) GetInboundLinks(toID string) ([]LinkEdge, error) {
	ls.mu.RLock()
	defer ls.mu.RUnlock()

	prefix := []byte(fmt.Sprintf("%s%s:", linkPrefix, toID))
	var edges []LinkEdge

	err := ls.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.Valid(); it.Next() {
			item := it.Item()
			val, err := item.ValueCopy(nil)
			if err != nil {
				continue
			}
			var edge LinkEdge
			if err := json.Unmarshal(val, &edge); err != nil {
				continue
			}
			edges = append(edges, edge)
		}
		return nil
	})

	return edges, err
}

// InboundCount returns the number of inbound links for a destination doc.
func (ls *LinkStore) InboundCount(toID string) (int, error) {
	ls.mu.RLock()
	defer ls.mu.RUnlock()

	key := []byte(linkCountPfx + toID)
	var count uint32
	err := ls.db.View(func(txn *badger.Txn) error {
		count = ls.getCountInTxn(txn, key)
		return nil
	})
	return int(count), err
}

// GetOutboundCount returns the number of outbound links from a source doc.
func (ls *LinkStore) GetOutboundCount(fromID string) (int, error) {
	ls.mu.RLock()
	defer ls.mu.RUnlock()

	key := []byte(outCountPfx + fromID)
	var count uint32
	err := ls.db.View(func(txn *badger.Txn) error {
		count = ls.getCountInTxn(txn, key)
		return nil
	})
	return int(count), err
}

// AllDestinations returns all doc IDs that have at least one inbound link.
func (ls *LinkStore) AllDestinations() ([]string, error) {
	ls.mu.RLock()
	defer ls.mu.RUnlock()

	prefix := []byte(linkCountPfx)
	var ids []string

	err := ls.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchValues = false
		opts.Prefix = prefix
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek(prefix); it.Valid(); it.Next() {
			key := it.Item().Key()
			// key = "linkcount:<docID>"
			id := string(key[len(linkCountPfx):])
			if id != "" {
				ids = append(ids, id)
			}
		}
		return nil
	})

	return ids, err
}

func (ls *LinkStore) getCountInTxn(txn *badger.Txn, key []byte) uint32 {
	item, err := txn.Get(key)
	if err != nil {
		return 0
	}
	val, err := item.ValueCopy(nil)
	if err != nil || len(val) < 4 {
		return 0
	}
	return binary.BigEndian.Uint32(val)
}

func encodeUint32(v uint32) []byte {
	buf := make([]byte, 4)
	binary.BigEndian.PutUint32(buf, v)
	return buf
}
