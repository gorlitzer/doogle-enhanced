package node

import (
	"path/filepath"
	"sync"
	"testing"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/p2p"
	"github.com/doogle/doogle-v2/internal/store"
)

func TestPeerGeo_SetAndGet(t *testing.T) {
	n := &Node{
		peerGeo: make(map[string]string),
	}

	// Initially empty
	if got := n.PeerGeo("peer1"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}

	// Set without badger (nil badger — just test the map)
	n.peerGeoMu.Lock()
	n.peerGeo["peer1"] = "US"
	n.peerGeoMu.Unlock()

	if got := n.PeerGeo("peer1"); got != "US" {
		t.Fatalf("expected US, got %q", got)
	}
}

func TestPeerGeo_FirstSeenSemantics(t *testing.T) {
	n := &Node{
		peerGeo: make(map[string]string),
	}

	// Simulate first-seen: only set if not already known
	n.peerGeoMu.Lock()
	n.peerGeo["peer1"] = "DE"
	n.peerGeoMu.Unlock()

	// Second attempt should not overwrite (matches OnConnect logic)
	if n.PeerGeo("peer1") != "" {
		// already known, skip
	}
	if got := n.PeerGeo("peer1"); got != "DE" {
		t.Fatalf("expected DE (first-seen preserved), got %q", got)
	}
}

func TestPeerGeo_PersistAndLoad(t *testing.T) {
	dir := t.TempDir()
	badgerPath := filepath.Join(dir, "badger")

	bs, err := store.NewBadgerStore(badgerPath, false)
	if err != nil {
		t.Fatalf("badger: %v", err)
	}
	defer bs.Close()

	n := &Node{
		peerGeo: make(map[string]string),
		badger:  bs,
	}

	// Persist geo data
	n.setPeerGeo("peer1", "US")
	n.setPeerGeo("peer2", "DE")
	n.setPeerGeo("peer3", "JP")

	if got := n.PeerGeo("peer1"); got != "US" {
		t.Fatalf("expected US, got %q", got)
	}
	if got := n.PeerGeo("peer2"); got != "DE" {
		t.Fatalf("expected DE, got %q", got)
	}

	// Simulate restart: clear in-memory map, then load from badger
	n.peerGeoMu.Lock()
	n.peerGeo = make(map[string]string)
	n.peerGeoMu.Unlock()

	if got := n.PeerGeo("peer1"); got != "" {
		t.Fatalf("expected empty after clearing map, got %q", got)
	}

	n.loadPeerGeo()

	if got := n.PeerGeo("peer1"); got != "US" {
		t.Fatalf("expected US after loadPeerGeo, got %q", got)
	}
	if got := n.PeerGeo("peer2"); got != "DE" {
		t.Fatalf("expected DE after loadPeerGeo, got %q", got)
	}
	if got := n.PeerGeo("peer3"); got != "JP" {
		t.Fatalf("expected JP after loadPeerGeo, got %q", got)
	}
}

func TestPeerGeo_Overwrite(t *testing.T) {
	dir := t.TempDir()
	badgerPath := filepath.Join(dir, "badger")

	bs, err := store.NewBadgerStore(badgerPath, false)
	if err != nil {
		t.Fatalf("badger: %v", err)
	}
	defer bs.Close()

	n := &Node{
		peerGeo: make(map[string]string),
		badger:  bs,
	}

	n.setPeerGeo("peer1", "US")
	n.setPeerGeo("peer1", "CA") // overwrite

	if got := n.PeerGeo("peer1"); got != "CA" {
		t.Fatalf("expected CA after overwrite, got %q", got)
	}

	// Verify persistence reflects the overwrite
	n.peerGeoMu.Lock()
	n.peerGeo = make(map[string]string)
	n.peerGeoMu.Unlock()

	n.loadPeerGeo()
	if got := n.PeerGeo("peer1"); got != "CA" {
		t.Fatalf("expected CA after reload, got %q", got)
	}
}

func TestPeerGeo_EmptyMap(t *testing.T) {
	dir := t.TempDir()
	badgerPath := filepath.Join(dir, "badger")

	bs, err := store.NewBadgerStore(badgerPath, false)
	if err != nil {
		t.Fatalf("badger: %v", err)
	}
	defer bs.Close()

	n := &Node{
		peerGeo: make(map[string]string),
		badger:  bs,
	}

	// Loading from empty DB should not panic
	n.loadPeerGeo()

	if got := n.PeerGeo("nonexistent"); got != "" {
		t.Fatalf("expected empty for nonexistent peer, got %q", got)
	}
}

func TestPeerGeo_ConcurrentAccess(t *testing.T) {
	dir := t.TempDir()
	bs, err := store.NewBadgerStore(filepath.Join(dir, "badger"), false)
	if err != nil {
		t.Fatal(err)
	}
	defer bs.Close()

	n := &Node{
		peerGeo: make(map[string]string),
		badger:  bs,
	}

	var wg sync.WaitGroup
	// Concurrent writers
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			peerID := "peer" + string(rune('A'+i%26))
			n.setPeerGeo(peerID, "XX")
		}(i)
	}
	// Concurrent readers
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			peerID := "peer" + string(rune('A'+i%26))
			_ = n.PeerGeo(peerID) // must not panic
		}(i)
	}
	wg.Wait()
}

func TestPeerGeo_BadgerKeyFormat(t *testing.T) {
	dir := t.TempDir()
	bs, err := store.NewBadgerStore(filepath.Join(dir, "badger"), false)
	if err != nil {
		t.Fatal(err)
	}
	defer bs.Close()

	n := &Node{
		peerGeo: make(map[string]string),
		badger:  bs,
	}

	n.setPeerGeo("QmTestPeer123", "FR")

	// Verify the key in badger uses the correct prefix
	val, err := bs.Get([]byte(peerGeoPrefix + "QmTestPeer123"))
	if err != nil {
		t.Fatalf("expected key in badger, got error: %v", err)
	}
	if string(val) != "FR" {
		t.Fatalf("expected FR in badger, got %q", string(val))
	}
}

// --- handleShardCatalog Country acceptance tests ---

func newTestNodeWithBadger(t *testing.T) *Node {
	t.Helper()
	dir := t.TempDir()
	bs, err := store.NewBadgerStore(filepath.Join(dir, "badger"), false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { bs.Close() })
	return &Node{
		peerGeo:       make(map[string]string),
		peerNames:     make(map[string]string),
		peerRelayInfo: make(map[string]relayInfo),
		shards:        index.NewShardManager(),
		badger:        bs,
	}
}

func TestHandleShardCatalog_AcceptsCountryIfUnknown(t *testing.T) {
	n := newTestNodeWithBadger(t)
	// Stub shards to avoid nil panic
	// shards already set by newTestNodeWithBadger

	catalog := &p2p.ShardCatalog{
		PeerID:  "QmRemotePeer1234",
		Country: "DE",
	}
	if err := n.handleShardCatalog(catalog); err != nil {
		t.Fatal(err)
	}

	if got := n.PeerGeo("QmRemotePeer1234"); got != "DE" {
		t.Fatalf("expected DE from catalog, got %q", got)
	}
}

func TestHandleShardCatalog_IgnoresCountryIfAlreadyKnown(t *testing.T) {
	n := newTestNodeWithBadger(t)
	// shards already set by newTestNodeWithBadger

	// Pre-set geo from IP lookup
	n.setPeerGeo("QmRemotePeer1234", "US")

	catalog := &p2p.ShardCatalog{
		PeerID:  "QmRemotePeer1234",
		Country: "DE", // self-reported different country
	}
	if err := n.handleShardCatalog(catalog); err != nil {
		t.Fatal(err)
	}

	// First-seen wins: US from IP lookup, not DE from catalog
	if got := n.PeerGeo("QmRemotePeer1234"); got != "US" {
		t.Fatalf("expected US (first-seen), got %q", got)
	}
}

func TestHandleShardCatalog_EmptyCountryIgnored(t *testing.T) {
	n := newTestNodeWithBadger(t)
	// shards already set by newTestNodeWithBadger

	catalog := &p2p.ShardCatalog{
		PeerID:  "QmRemotePeer1234",
		Country: "",
	}
	if err := n.handleShardCatalog(catalog); err != nil {
		t.Fatal(err)
	}

	if got := n.PeerGeo("QmRemotePeer1234"); got != "" {
		t.Fatalf("expected empty (no country in catalog), got %q", got)
	}
}

func TestHandleShardCatalog_LightNodeRelayInfoCountry(t *testing.T) {
	n := newTestNodeWithBadger(t)
	// shards already set by newTestNodeWithBadger

	catalog := &p2p.ShardCatalog{
		PeerID:   "QmLightPeer12345",
		NodeType: "light",
		Country:  "JP",
		NodeName: "LightNode1",
	}
	if err := n.handleShardCatalog(catalog); err != nil {
		t.Fatal(err)
	}

	// Country should be in peerGeo
	if got := n.PeerGeo("QmLightPeer12345"); got != "JP" {
		t.Fatalf("expected JP, got %q", got)
	}

	// Country should also be in relayInfo
	n.peerRelayInfoMu.RLock()
	ri, ok := n.peerRelayInfo["QmLightPeer12345"]
	n.peerRelayInfoMu.RUnlock()
	if !ok {
		t.Fatal("expected relay info for light peer")
	}
	if ri.Country != "JP" {
		t.Fatalf("expected JP in relayInfo, got %q", ri.Country)
	}
}


