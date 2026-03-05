package index

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sort"
	"sync"

	"github.com/dgraph-io/badger/v4"
)

// VectorHit represents a result from vector similarity search.
type VectorHit struct {
	DocID      string
	Score      float64
	Metadata   map[string]string
}

// BadgerVectorStore stores document embeddings in BadgerDB with brute-force search.
// For small-to-medium corpora (<100k docs), this is sufficient and avoids
// additional dependencies. Keys: vec:{docID} → embedding bytes, vecmeta:{docID} → metadata JSON.
type BadgerVectorStore struct {
	db       *badger.DB
	mu       sync.RWMutex
	dim      int
}

// NewBadgerVectorStore creates a vector store backed by an existing BadgerDB.
func NewBadgerVectorStore(db *badger.DB, dim int) *BadgerVectorStore {
	if dim <= 0 {
		dim = embeddingDim
	}
	return &BadgerVectorStore{db: db, dim: dim}
}

const vecPrefix = "vec:"
const vecMetaPrefix = "vecmeta:"

// Upsert stores or updates an embedding for a document.
func (vs *BadgerVectorStore) Upsert(docID string, embedding []float32, metadata map[string]string) error {
	if len(embedding) != vs.dim {
		return fmt.Errorf("embedding dimension mismatch: got %d, want %d", len(embedding), vs.dim)
	}

	// Encode embedding as raw bytes (4 bytes per float32)
	buf := make([]byte, len(embedding)*4)
	for i, v := range embedding {
		binary.LittleEndian.PutUint32(buf[i*4:], math.Float32bits(v))
	}

	metaJSON, _ := json.Marshal(metadata)

	return vs.db.Update(func(txn *badger.Txn) error {
		if err := txn.Set([]byte(vecPrefix+docID), buf); err != nil {
			return err
		}
		return txn.Set([]byte(vecMetaPrefix+docID), metaJSON)
	})
}

// Search performs brute-force cosine similarity search and returns top-k results.
func (vs *BadgerVectorStore) Search(queryEmbedding []float32, k int) []VectorHit {
	vs.mu.RLock()
	defer vs.mu.RUnlock()

	type scored struct {
		docID string
		score float64
	}
	var results []scored

	_ = vs.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = []byte(vecPrefix)
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek([]byte(vecPrefix)); it.ValidForPrefix([]byte(vecPrefix)); it.Next() {
			item := it.Item()
			docID := string(item.Key())[len(vecPrefix):]

			_ = item.Value(func(val []byte) error {
				if len(val) != vs.dim*4 {
					return nil
				}
				embedding := decodeFloats(val)
				sim := CosineSimilarity(queryEmbedding, embedding)
				if sim > 0 {
					results = append(results, scored{docID, sim})
				}
				return nil
			})
		}
		return nil
	})

	// Sort by similarity descending
	sort.Slice(results, func(i, j int) bool {
		return results[i].score > results[j].score
	})

	if len(results) > k {
		results = results[:k]
	}

	// Enrich with metadata
	hits := make([]VectorHit, 0, len(results))
	for _, r := range results {
		meta := vs.getMetadata(r.docID)
		hits = append(hits, VectorHit{
			DocID:    r.docID,
			Score:    r.score,
			Metadata: meta,
		})
	}

	return hits
}

// Delete removes an embedding.
func (vs *BadgerVectorStore) Delete(docID string) error {
	return vs.db.Update(func(txn *badger.Txn) error {
		_ = txn.Delete([]byte(vecPrefix + docID))
		_ = txn.Delete([]byte(vecMetaPrefix + docID))
		return nil
	})
}

// Count returns the number of stored embeddings.
func (vs *BadgerVectorStore) Count() int {
	count := 0
	_ = vs.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchValues = false
		opts.Prefix = []byte(vecPrefix)
		it := txn.NewIterator(opts)
		defer it.Close()
		for it.Seek([]byte(vecPrefix)); it.ValidForPrefix([]byte(vecPrefix)); it.Next() {
			count++
		}
		return nil
	})
	return count
}

// AllEmbeddings returns all stored embeddings (for clustering).
func (vs *BadgerVectorStore) AllEmbeddings() ([]string, [][]float32) {
	var ids []string
	var vecs [][]float32

	_ = vs.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = []byte(vecPrefix)
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Seek([]byte(vecPrefix)); it.ValidForPrefix([]byte(vecPrefix)); it.Next() {
			item := it.Item()
			docID := string(item.Key())[len(vecPrefix):]

			_ = item.Value(func(val []byte) error {
				if len(val) == vs.dim*4 {
					ids = append(ids, docID)
					vecs = append(vecs, decodeFloats(val))
				}
				return nil
			})
		}
		return nil
	})

	return ids, vecs
}

// Close is a no-op since BadgerDB lifecycle is managed by BadgerStore.
func (vs *BadgerVectorStore) Close() error {
	log.Println("vector store: closing")
	return nil
}

func (vs *BadgerVectorStore) getMetadata(docID string) map[string]string {
	var meta map[string]string
	_ = vs.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(vecMetaPrefix + docID))
		if err != nil {
			return err
		}
		return item.Value(func(val []byte) error {
			return json.Unmarshal(val, &meta)
		})
	})
	return meta
}

func decodeFloats(buf []byte) []float32 {
	n := len(buf) / 4
	result := make([]float32, n)
	for i := 0; i < n; i++ {
		result[i] = math.Float32frombits(binary.LittleEndian.Uint32(buf[i*4:]))
	}
	return result
}
