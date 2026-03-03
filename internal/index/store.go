package index

import "github.com/doogle/doogle-v2/internal/models"

// Store is the interface for a full-text index backend.
type Store interface {
	Index(doc *IndexDocument) error
	IndexBatch(docs []*IndexDocument) error
	Search(query string, offset, limit int) ([]SearchHit, int, error)
	SearchAdvanced(pq *models.ParsedQuery, offset, limit int) ([]SearchHit, int, error)
	DocCount() (uint64, error)
	Get(id string) (*IndexDocument, error)
	Delete(id string) error
	ListRecent(offset, limit int) ([]IndexDocument, int, error)
	ListAll(callback func(doc *IndexDocument) bool) error
	ListIDsByDomain(domain string) ([]string, error)
	ListDomains() ([]string, error)
	ListRecentByPeer(peerID string, offset, limit int) ([]IndexDocument, int, error)
	CountByPeer(selfPeerID string) (local int, remote int, err error)
	DocCountsByPeer() (map[string]int, error)
	Close() error
}

// SearchHit represents a single search result from the index.
type SearchHit struct {
	ID    string
	Score float64
	Doc   *IndexDocument
}
