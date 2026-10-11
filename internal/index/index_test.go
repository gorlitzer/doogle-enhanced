package index

import (
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func newTestBleve(t *testing.T) *BleveStore {
	t.Helper()
	dir := t.TempDir()
	bs, err := NewBleveStore(dir)
	if err != nil {
		t.Fatalf("NewBleveStore: %v", err)
	}
	t.Cleanup(func() { bs.Close() })
	return bs
}

func testDoc(id, url, title, content string) *IndexDocument {
	return &IndexDocument{
		ID:          id,
		URL:         url,
		Domain:      "example.com",
		Title:       title,
		Content:     content,
		ContentHash: "hash_" + id,
		ContentSize: len(content),
		WordCount:   10,
		CrawledAt:   time.Now(),
		IndexedAt:   time.Now(),
	}
}

// ---- BleveStore tests ----

func TestBleveStore_IndexAndGet(t *testing.T) {
	bs := newTestBleve(t)

	doc := testDoc("doc1", "https://example.com/1", "Test Title", "This is test content for searching")
	doc.StaticScore = 1.5
	doc.Generation = 42

	if err := bs.Index(doc); err != nil {
		t.Fatal(err)
	}

	count, _ := bs.DocCount()
	if count != 1 {
		t.Fatalf("expected DocCount=1, got %d", count)
	}

	got, err := bs.Get("doc1")
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Test Title" {
		t.Fatalf("expected title='Test Title', got %q", got.Title)
	}
	if got.StaticScore != 1.5 {
		t.Fatalf("expected StaticScore=1.5, got %f", got.StaticScore)
	}
	if got.Generation != 42 {
		t.Fatalf("expected Generation=42, got %d", got.Generation)
	}
}

func TestBleveStore_IndexBatch(t *testing.T) {
	bs := newTestBleve(t)

	docs := make([]*IndexDocument, 20)
	for i := range docs {
		docs[i] = testDoc(
			"batch"+string(rune('A'+i)),
			"https://example.com/batch/"+string(rune('A'+i)),
			"Batch doc",
			"Content for batch testing purposes",
		)
	}

	if err := bs.IndexBatch(docs); err != nil {
		t.Fatal(err)
	}

	count, _ := bs.DocCount()
	if count != 20 {
		t.Fatalf("expected DocCount=20, got %d", count)
	}
}

func TestBleveStore_Search(t *testing.T) {
	bs := newTestBleve(t)

	bs.Index(testDoc("d1", "https://example.com/go", "Go programming language", "Go is a statically typed compiled language designed at Google"))
	bs.Index(testDoc("d2", "https://example.com/rust", "Rust programming", "Rust is a systems programming language focused on safety"))
	bs.Index(testDoc("d3", "https://example.com/py", "Python tutorial", "Python is a high level dynamic programming language"))

	hits, total, err := bs.Search("programming language", 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total == 0 {
		t.Fatal("expected at least 1 result")
	}
	if len(hits) == 0 {
		t.Fatal("expected hits")
	}
}

func TestBleveStore_ListAll(t *testing.T) {
	bs := newTestBleve(t)

	for i := 0; i < 5; i++ {
		id := string(rune('a' + i))
		bs.Index(testDoc(id, "https://example.com/"+id, "Doc "+id, "Content "+id))
	}

	var collected []string
	err := bs.ListAll(func(doc *IndexDocument) bool {
		collected = append(collected, doc.ID)
		return true
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(collected) != 5 {
		t.Fatalf("expected 5 docs, got %d", len(collected))
	}
}

func TestBleveStore_ListAll_StopEarly(t *testing.T) {
	bs := newTestBleve(t)

	for i := 0; i < 10; i++ {
		id := string(rune('a' + i))
		bs.Index(testDoc(id, "https://example.com/"+id, "Doc "+id, "Content "+id))
	}

	count := 0
	bs.ListAll(func(doc *IndexDocument) bool {
		count++
		return count < 3
	})
	if count != 3 {
		t.Fatalf("expected callback called 3 times, got %d", count)
	}
}

func TestBleveStore_ListRecent(t *testing.T) {
	bs := newTestBleve(t)

	for i := 0; i < 3; i++ {
		id := string(rune('x' + i))
		bs.Index(testDoc(id, "https://example.com/"+id, "Recent "+id, "Content"))
	}

	docs, total, err := bs.ListRecent(0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 {
		t.Fatalf("expected total=3, got %d", total)
	}
	if len(docs) != 3 {
		t.Fatalf("expected 3 docs, got %d", len(docs))
	}
}

func TestBleveStore_GetNotFound(t *testing.T) {
	bs := newTestBleve(t)
	_, err := bs.Get("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent doc")
	}
}

// ---- BatchIndexer tests ----

func TestBatchIndexer_FlushOnFull(t *testing.T) {
	bs := newTestBleve(t)
	bi := NewBatchIndexer(bs, 5, 1*time.Hour) // high interval, low batch size

	for i := 0; i < 5; i++ {
		id := string(rune('a' + i))
		bi.Add(testDoc(id, "https://example.com/"+id, "Doc", "Content"))
	}

	// Should have auto-flushed at batch size 5
	time.Sleep(50 * time.Millisecond) // let the goroutine finish
	count, _ := bs.DocCount()
	if count != 5 {
		t.Fatalf("expected 5 docs after auto-flush, got %d", count)
	}
}

func TestBatchIndexer_ManualFlush(t *testing.T) {
	bs := newTestBleve(t)
	bi := NewBatchIndexer(bs, 100, 1*time.Hour) // won't auto-flush

	bi.Add(testDoc("m1", "https://example.com/m1", "Doc", "Content"))
	bi.Add(testDoc("m2", "https://example.com/m2", "Doc", "Content"))

	count, _ := bs.DocCount()
	if count != 0 {
		t.Fatalf("expected 0 before flush, got %d", count)
	}

	if err := bi.Flush(); err != nil {
		t.Fatal(err)
	}

	count, _ = bs.DocCount()
	if count != 2 {
		t.Fatalf("expected 2 after flush, got %d", count)
	}
}

func TestBatchIndexer_FlushEmpty(t *testing.T) {
	bs := newTestBleve(t)
	bi := NewBatchIndexer(bs, 100, 1*time.Hour)

	// Flushing empty buffer should be a no-op
	if err := bi.Flush(); err != nil {
		t.Fatal(err)
	}
}

func TestBatchIndexer_BackgroundTicker(t *testing.T) {
	bs := newTestBleve(t)
	bi := NewBatchIndexer(bs, 1000, 200*time.Millisecond) // flush every 200ms

	ctx, cancel := func() (interface{ Done() <-chan struct{}; Err() error }, func()) {
		// We need a real context
		return nil, nil
	}()
	_ = ctx
	_ = cancel

	// Use a real context
	realCtx, realCancel := newContext()
	bi.Start(realCtx)

	bi.Add(testDoc("bg1", "https://example.com/bg1", "Doc", "Content"))

	time.Sleep(500 * time.Millisecond) // wait for ticker

	count, _ := bs.DocCount()
	if count != 1 {
		t.Fatalf("expected 1 doc after background flush, got %d", count)
	}

	realCancel()
	bi.Stop()
}

func TestBatchIndexer_ConcurrentAdds(t *testing.T) {
	bs := newTestBleve(t)
	bi := NewBatchIndexer(bs, 10, 1*time.Hour)

	var wg sync.WaitGroup
	var counter atomic.Int32
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			id := string(rune(n + 100))
			bi.Add(testDoc(id, "https://example.com/"+id, "Doc", "Content"))
			counter.Add(1)
		}(i)
	}
	wg.Wait()
	bi.Flush()

	count, _ := bs.DocCount()
	if count == 0 {
		t.Fatal("expected some docs after concurrent adds")
	}
}

// ---- ShardManager tests ----

func TestShardManager_SingleNode(t *testing.T) {
	sm := NewShardManager()
	sm.AddNode("peer1")

	if sm.NodeCount() != 1 {
		t.Fatalf("expected 1 node, got %d", sm.NodeCount())
	}

	owner := sm.Owner("example.com")
	if owner != "peer1" {
		t.Fatalf("expected peer1, got %s", owner)
	}
}

func TestShardManager_MultiNode(t *testing.T) {
	sm := NewShardManager()
	sm.AddNode("peer1")
	sm.AddNode("peer2")
	sm.AddNode("peer3")

	if sm.NodeCount() != 3 {
		t.Fatalf("expected 3 nodes, got %d", sm.NodeCount())
	}

	// Owner should be deterministic
	owner1 := sm.Owner("example.com")
	owner2 := sm.Owner("example.com")
	if owner1 != owner2 {
		t.Fatal("expected deterministic owner")
	}
}

func TestShardManager_Owners(t *testing.T) {
	sm := NewShardManager()
	sm.AddNode("peer1")
	sm.AddNode("peer2")
	sm.AddNode("peer3")

	owners := sm.Owners("example.com", 2)
	if len(owners) != 2 {
		t.Fatalf("expected 2 owners, got %d", len(owners))
	}
	if owners[0] == owners[1] {
		t.Fatal("expected distinct owners")
	}
}

func TestShardManager_IsOwner(t *testing.T) {
	sm := NewShardManager()
	sm.AddNode("peer1")
	sm.AddNode("peer2")

	owner := sm.Owner("test.com")
	if !sm.IsOwner(owner, "test.com", 2) {
		t.Fatal("expected IsOwner=true for primary owner")
	}
}

func TestShardManager_RemoveNode(t *testing.T) {
	sm := NewShardManager()
	sm.AddNode("peer1")
	sm.AddNode("peer2")

	sm.RemoveNode("peer2")
	if sm.NodeCount() != 1 {
		t.Fatalf("expected 1 node, got %d", sm.NodeCount())
	}

	// All domains should now route to peer1
	owner := sm.Owner("anything.com")
	if owner != "peer1" {
		t.Fatalf("expected peer1, got %s", owner)
	}
}

func TestShardManager_CoveringSet(t *testing.T) {
	sm := NewShardManager()
	sm.AddNode("peer1")
	sm.AddNode("peer2")
	sm.AddNode("peer3")

	covering := sm.CoveringSet()
	if len(covering) != 3 {
		t.Fatalf("expected 3 in covering set, got %d", len(covering))
	}
}

func TestShardManager_EmptyRing(t *testing.T) {
	sm := NewShardManager()

	if sm.Owner("test.com") != "" {
		t.Fatal("expected empty string for empty ring")
	}

	if sm.CoveringSet() != nil {
		t.Fatal("expected nil covering set for empty ring")
	}
}

// ---- IndexDocument.Type() tests ----

func TestIndexDocument_Type_Default(t *testing.T) {
	doc := &IndexDocument{ID: "d1", Language: ""}
	if got := doc.Type(); got != "_default" {
		t.Fatalf("expected '_default', got %q", got)
	}
}

func TestIndexDocument_Type_WithLanguage(t *testing.T) {
	// All documents use the default mapping; lang analysis is at query time
	doc := &IndexDocument{ID: "d1", Language: "de"}
	if got := doc.Type(); got != "_default" {
		t.Fatalf("expected '_default', got %q", got)
	}
}

// ---- Multi-language indexing tests ----

func TestBleveStore_MultiLanguageIndex(t *testing.T) {
	bs := newTestBleve(t)

	deDoc := testDoc("de1", "https://example.de/page", "Programmiersprache Go", "Go ist eine statisch typisierte kompilierte Programmiersprache")
	deDoc.Language = "de"

	enDoc := testDoc("en1", "https://example.com/page", "Go programming language", "Go is a statically typed compiled programming language")
	// No language set — uses default mapping (English)

	if err := bs.Index(deDoc); err != nil {
		t.Fatal(err)
	}
	if err := bs.Index(enDoc); err != nil {
		t.Fatal(err)
	}

	count, _ := bs.DocCount()
	if count != 2 {
		t.Fatalf("expected 2 docs, got %d", count)
	}

	// English doc (default mapping) should be searchable
	hits, _, err := bs.Search("programming", 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 {
		t.Fatal("expected at least 1 hit for 'programming'")
	}

	// German doc should be retrievable by ID
	got, err := bs.Get("de1")
	if err != nil {
		t.Fatal(err)
	}
	if got.Language != "de" {
		t.Fatalf("expected language='de', got %q", got.Language)
	}
}

func TestLangAnalyzer_Supported(t *testing.T) {
	if a := LangAnalyzer("de"); a == "" {
		t.Fatal("expected non-empty analyzer for 'de'")
	}
	if a := LangAnalyzer("fr"); a == "" {
		t.Fatal("expected non-empty analyzer for 'fr'")
	}
}

func TestLangAnalyzer_Unsupported(t *testing.T) {
	if a := LangAnalyzer("xx"); a != "" {
		t.Fatalf("expected empty analyzer for unsupported lang, got %q", a)
	}
}

// helper to create a context
func newContext() (interface {
	Done() <-chan struct{}
	Err() error
	Deadline() (time.Time, bool)
	Value(interface{}) interface{}
}, func()) {
	ch := make(chan struct{})
	ctx := &simpleCtx{done: ch}
	cancel := func() { close(ch) }
	return ctx, cancel
}

type simpleCtx struct{ done chan struct{} }

func (c *simpleCtx) Done() <-chan struct{}               { return c.done }
func (c *simpleCtx) Err() error                          { select { case <-c.done: return os.ErrClosed; default: return nil } }
func (c *simpleCtx) Deadline() (time.Time, bool)         { return time.Time{}, false }
func (c *simpleCtx) Value(interface{}) interface{}        { return nil }
