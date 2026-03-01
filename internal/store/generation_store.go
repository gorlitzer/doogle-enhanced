package store

import (
	"encoding/binary"
	"sync/atomic"

	"github.com/dgraph-io/badger/v4"
)

const generationKey = "meta:generation"

// GenerationStore is a monotonic counter tracking index scoring generations.
// Enables "reindex only docs from generation < X".
type GenerationStore struct {
	db      *badger.DB
	current atomic.Uint64
}

// NewGenerationStore creates a GenerationStore and loads the current value from disk.
func NewGenerationStore(bs *BadgerStore) (*GenerationStore, error) {
	gs := &GenerationStore{db: bs.db}
	if err := gs.load(); err != nil {
		return nil, err
	}
	return gs, nil
}

// Current returns the current generation counter.
func (gs *GenerationStore) Current() uint64 {
	return gs.current.Load()
}

// Increment atomically increments the generation counter and persists it.
func (gs *GenerationStore) Increment() (uint64, error) {
	newVal := gs.current.Add(1)
	if err := gs.persist(newVal); err != nil {
		gs.current.Add(^uint64(0)) // rollback on error
		return gs.current.Load(), err
	}
	return newVal, nil
}

func (gs *GenerationStore) load() error {
	return gs.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(generationKey))
		if err == badger.ErrKeyNotFound {
			gs.current.Store(0)
			return nil
		}
		if err != nil {
			return err
		}
		return item.Value(func(val []byte) error {
			if len(val) >= 8 {
				gs.current.Store(binary.BigEndian.Uint64(val))
			}
			return nil
		})
	})
}

func (gs *GenerationStore) persist(val uint64) error {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, val)
	return gs.db.Update(func(txn *badger.Txn) error {
		return txn.Set([]byte(generationKey), buf)
	})
}
