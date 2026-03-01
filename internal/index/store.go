package index

import "github.com/doogle/doogle-v2/internal/models"

// Store is the interface for a full-text index backend.
type Store interface {
	Index(doc *IndexDocument) error
	Search(query string, offset, limit int) ([]SearchHit, int, error)
	SearchAdvanced(pq *models.ParsedQuery, offset, limit int) ([]SearchHit, int, error)
	DocCount() (uint64, error)
	Get(id string) (*IndexDocument, error)
	ListRecent(offset, limit int) ([]IndexDocument, int, error)
	Close() error
}

// SearchHit represents a single search result from the index.
type SearchHit struct {
	ID    string
	Score float64
	Doc   *IndexDocument
}
