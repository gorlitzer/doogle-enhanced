package indexer

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/doogle/doogle-v2/internal/store"
)

// DuplicateDetector uses content fingerprinting and Jaccard similarity
// to detect exact and near-duplicate documents.
// Fingerprints are persisted in BadgerDB and cached in-memory for fast lookups.
type DuplicateDetector struct {
	fingerprints map[string]string // fingerprint → document ID (in-memory cache)
	mu           sync.RWMutex
	shingleSize  int
	persist      *store.BadgerStore // optional persistent backing store
}

// NewDuplicateDetector creates a duplicate detector with in-memory fingerprints.
func NewDuplicateDetector() *DuplicateDetector {
	return &DuplicateDetector{
		fingerprints: make(map[string]string),
		shingleSize:  5,
	}
}

// NewPersistentDuplicateDetector creates a duplicate detector backed by BadgerDB.
// Fingerprints survive restarts.
func NewPersistentDuplicateDetector(bs *store.BadgerStore) *DuplicateDetector {
	dd := &DuplicateDetector{
		fingerprints: make(map[string]string),
		shingleSize:  5,
		persist:      bs,
	}
	// Warm cache from persistent store
	dd.loadFromStore()
	return dd
}

const dedupFPPrefix = "dedup:fp:"

// loadFromStore loads all persisted fingerprints into the in-memory cache.
func (dd *DuplicateDetector) loadFromStore() {
	if dd.persist == nil {
		return
	}
	count := 0
	dd.persist.Scan([]byte(dedupFPPrefix), func(key, val []byte) bool {
		fp := string(key[len(dedupFPPrefix):])
		docID := string(val)
		dd.fingerprints[fp] = docID
		count++
		return true
	})
	if count > 0 {
		// Log loaded count at startup
	}
}

// IsDuplicate checks if content is a duplicate of an existing document.
// Returns (isDuplicate, existingDocID).
func (dd *DuplicateDetector) IsDuplicate(docID, content string) (bool, string) {
	fp := dd.Fingerprint(content)

	dd.mu.RLock()
	existingID, exists := dd.fingerprints[fp]
	dd.mu.RUnlock()

	if exists && existingID != docID {
		return true, existingID
	}

	// Check persistent store if not in cache
	if !exists && dd.persist != nil {
		if val, err := dd.persist.Get([]byte(dedupFPPrefix + fp)); err == nil && val != nil {
			storedID := string(val)
			if storedID != docID {
				dd.mu.Lock()
				dd.fingerprints[fp] = storedID
				dd.mu.Unlock()
				return true, storedID
			}
		}
	}

	dd.mu.Lock()
	dd.fingerprints[fp] = docID
	dd.mu.Unlock()

	// Persist to BadgerDB
	if dd.persist != nil {
		dd.persist.Set([]byte(dedupFPPrefix+fp), []byte(docID))
	}

	return false, ""
}

// Fingerprint generates a content fingerprint using sorted top shingles.
func (dd *DuplicateDetector) Fingerprint(content string) string {
	normalized := dd.normalize(content)
	shingles := dd.shingle(normalized, dd.shingleSize)
	if len(shingles) == 0 {
		h := sha256.Sum256([]byte(normalized))
		return hex.EncodeToString(h[:])
	}

	sort.Strings(shingles)
	n := 20
	if len(shingles) < n {
		n = len(shingles)
	}

	combined := strings.Join(shingles[:n], "|")
	h := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(h[:])
}

// Similarity computes Jaccard similarity between two texts (0.0-1.0).
func (dd *DuplicateDetector) Similarity(text1, text2 string) float64 {
	norm1 := dd.normalize(text1)
	norm2 := dd.normalize(text2)
	set1 := dd.shingleSet(norm1, dd.shingleSize)
	set2 := dd.shingleSet(norm2, dd.shingleSize)

	if len(set1) == 0 && len(set2) == 0 {
		return 1.0
	}
	if len(set1) == 0 || len(set2) == 0 {
		return 0.0
	}

	// Jaccard = |intersection| / |union|
	intersection := 0
	for s := range set1 {
		if set2[s] {
			intersection++
		}
	}
	union := len(set1) + len(set2) - intersection
	if union == 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

// IsNearDuplicate returns true if similarity exceeds 80%.
func (dd *DuplicateDetector) IsNearDuplicate(text1, text2 string) bool {
	return dd.Similarity(text1, text2) > 0.80
}

// ContentSignature produces a compact signature for quick comparison.
// Samples words at regular intervals.
func (dd *DuplicateDetector) ContentSignature(content string) string {
	words := strings.Fields(dd.normalize(content))
	if len(words) == 0 {
		return ""
	}

	// Sample every Nth word
	step := len(words) / 20
	if step < 1 {
		step = 1
	}

	var sampled []string
	for i := 0; i < len(words) && len(sampled) < 20; i += step {
		sampled = append(sampled, words[i])
	}
	return strings.Join(sampled, " ")
}

// normalize cleans text for consistent fingerprinting.
func (dd *DuplicateDetector) normalize(content string) string {
	s := strings.ToLower(content)

	// Remove punctuation
	punctRe := regexp.MustCompile(`[.,!?;:'"()\[\]{}\-_/\\|@#$%^&*~` + "`" + `]`)
	s = punctRe.ReplaceAllString(s, " ")

	// Collapse whitespace
	spaceRe := regexp.MustCompile(`\s+`)
	s = spaceRe.ReplaceAllString(s, " ")

	return strings.TrimSpace(s)
}

// shingle generates word-level n-grams (unique).
func (dd *DuplicateDetector) shingle(normalized string, n int) []string {
	words := strings.Fields(normalized)
	if len(words) < n {
		return nil
	}

	seen := make(map[string]bool)
	var shingles []string
	for i := 0; i <= len(words)-n; i++ {
		s := strings.Join(words[i:i+n], " ")
		if !seen[s] {
			seen[s] = true
			shingles = append(shingles, s)
		}
	}
	return shingles
}

// shingleSet returns shingles as a set for Jaccard computation.
func (dd *DuplicateDetector) shingleSet(normalized string, n int) map[string]bool {
	words := strings.Fields(normalized)
	if len(words) < n {
		return nil
	}

	set := make(map[string]bool)
	for i := 0; i <= len(words)-n; i++ {
		s := strings.Join(words[i:i+n], " ")
		set[s] = true
	}
	return set
}
