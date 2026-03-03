package store

import (
	"fmt"
	"log"

	"github.com/dgraph-io/badger/v4"
)

// BadgerStore wraps a BadgerDB instance for metadata storage.
type BadgerStore struct {
	db *badger.DB
}

// NewBadgerStore opens or creates a BadgerDB at the given path.
func NewBadgerStore(path string) (*BadgerStore, error) {
	opts := badger.DefaultOptions(path).
		WithLogger(nil). // suppress badger's verbose logging
		WithValueLogFileSize(64 << 20).
		WithNumMemtables(2).
		WithNumLevelZeroTables(2).
		WithNumLevelZeroTablesStall(4).
		WithBlockCacheSize(32 << 20).
		WithIndexCacheSize(16 << 20).
		WithNumCompactors(2).
		WithCompactL0OnClose(true)

	db, err := badger.Open(opts)
	if err != nil {
		return nil, fmt.Errorf("open badger: %w", err)
	}

	return &BadgerStore{db: db}, nil
}

// Get retrieves a value by key.
func (s *BadgerStore) Get(key []byte) ([]byte, error) {
	var val []byte
	err := s.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get(key)
		if err != nil {
			return err
		}
		val, err = item.ValueCopy(nil)
		return err
	})
	if err == badger.ErrKeyNotFound {
		return nil, nil
	}
	return val, err
}

// Set stores a key-value pair.
func (s *BadgerStore) Set(key, value []byte) error {
	return s.db.Update(func(txn *badger.Txn) error {
		return txn.Set(key, value)
	})
}

// Has checks if a key exists.
func (s *BadgerStore) Has(key []byte) bool {
	err := s.db.View(func(txn *badger.Txn) error {
		_, err := txn.Get(key)
		return err
	})
	return err == nil
}

// Delete removes a key.
func (s *BadgerStore) Delete(key []byte) error {
	return s.db.Update(func(txn *badger.Txn) error {
		return txn.Delete(key)
	})
}

// DB returns the underlying BadgerDB instance.
func (s *BadgerStore) DB() *badger.DB {
	return s.db
}

// RunGC triggers a BadgerDB value log garbage collection pass.
func (s *BadgerStore) RunGC() error {
	return s.db.RunValueLogGC(0.5)
}

// Close closes the database.
func (s *BadgerStore) Close() error {
	log.Println("closing BadgerDB")
	return s.db.Close()
}
