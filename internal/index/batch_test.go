package index

import (
	"fmt"
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

// flakyStore is a minimal Store whose IndexBatch can be made to fail on demand,
// so we can exercise the BatchIndexer error path.
type flakyStore struct {
	failNext bool
	indexed  []*IndexDocument
}

func (f *flakyStore) IndexBatch(docs []*IndexDocument) error {
	if f.failNext {
		f.failNext = false
		return fmt.Errorf("simulated index failure")
	}
	f.indexed = append(f.indexed, docs...)
	return nil
}

func (f *flakyStore) Index(doc *IndexDocument) error { return f.IndexBatch([]*IndexDocument{doc}) }
func (f *flakyStore) Search(string, int, int) ([]SearchHit, int, error) { return nil, 0, nil }
func (f *flakyStore) SearchAdvanced(*models.ParsedQuery, int, int) ([]SearchHit, int, error) {
	return nil, 0, nil
}
func (f *flakyStore) DocCount() (uint64, error)            { return uint64(len(f.indexed)), nil }
func (f *flakyStore) Get(string) (*IndexDocument, error)   { return nil, nil }
func (f *flakyStore) Delete(string) error                  { return nil }
func (f *flakyStore) ListRecent(int, int) ([]IndexDocument, int, error) { return nil, 0, nil }
func (f *flakyStore) ListAll(func(*IndexDocument) bool) error           { return nil }
func (f *flakyStore) ListIDsByDomain(string) ([]string, error)          { return nil, nil }
func (f *flakyStore) ListDomains() ([]string, error)                    { return nil, nil }
func (f *flakyStore) ListRecentByPeer(string, int, int) ([]IndexDocument, int, error) {
	return nil, 0, nil
}
func (f *flakyStore) CountByPeer(string) (int, int, error)   { return 0, 0, nil }
func (f *flakyStore) DocCountsByPeer() (map[string]int, error) { return nil, nil }
func (f *flakyStore) Close() error                            { return nil }

// TestBatchIndexer_RequeuesOnError is the regression test for the silent
// batch-drop bug: a failed flush must not lose documents — they must be retried
// on the next flush.
func TestBatchIndexer_RequeuesOnError(t *testing.T) {
	fs := &flakyStore{failNext: true}
	bi := NewBatchIndexer(fs, 2, time.Hour)

	// Two docs fill the batch and trigger an auto-flush, which fails.
	bi.Add(&IndexDocument{ID: "a", URL: "https://a.com"})
	bi.Add(&IndexDocument{ID: "b", URL: "https://b.com"})

	if len(fs.indexed) != 0 {
		t.Fatalf("expected 0 docs indexed after failed flush, got %d", len(fs.indexed))
	}

	// Next flush should succeed and index BOTH previously-buffered docs.
	if err := bi.Flush(); err != nil {
		t.Fatalf("second flush failed: %v", err)
	}
	if len(fs.indexed) != 2 {
		t.Fatalf("expected 2 docs recovered and indexed, got %d (data loss!)", len(fs.indexed))
	}
}
