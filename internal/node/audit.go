package node

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/dgraph-io/badger/v4"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

// AuditTrail maintains a tamper-proof chain of spam reports.
// Each report is signed with Ed25519 and hash-chained to the previous entry.
type AuditTrail struct {
	store     *store.BadgerStore
	privKey   ed25519.PrivateKey
	pubKey    ed25519.PublicKey
	mu        sync.Mutex
	lastHash  []byte // hash of the most recent entry
}

// AuditEntry is a signed, hash-chained spam report record.
type AuditEntry struct {
	Report    models.SpamReport `json:"report"`
	PrevHash  string            `json:"prev_hash"`  // hex-encoded hash of previous entry
	EntryHash string            `json:"entry_hash"` // hex-encoded hash of this entry
	Signature string            `json:"signature"`  // hex-encoded Ed25519 signature
	SignerID  string            `json:"signer_id"`  // hex-encoded public key
}

const auditPrefix = "audit:chain:"

// NewAuditTrail creates an audit trail backed by BadgerDB.
// rawKey should be the 64-byte Ed25519 private key (seed + public).
func NewAuditTrail(bs *store.BadgerStore, rawKey []byte) *AuditTrail {
	privKey := ed25519.PrivateKey(rawKey)
	at := &AuditTrail{
		store:   bs,
		privKey: privKey,
		pubKey:  privKey.Public().(ed25519.PublicKey),
	}
	at.loadLastHash()
	return at
}

// loadLastHash restores the chain tip from storage.
func (at *AuditTrail) loadLastHash() {
	val, err := at.store.Get([]byte("audit:last_hash"))
	if err == nil && len(val) > 0 {
		at.lastHash = val
	}
}

// Append adds a signed, hash-chained entry for a spam report.
func (at *AuditTrail) Append(report *models.SpamReport) (*AuditEntry, error) {
	at.mu.Lock()
	defer at.mu.Unlock()

	prevHash := hex.EncodeToString(at.lastHash)

	// Build the entry payload for hashing
	payload := auditPayload(report, prevHash)

	// Compute entry hash
	h := sha256.Sum256(payload)
	entryHash := hex.EncodeToString(h[:])

	// Sign the entry hash
	sig := ed25519.Sign(at.privKey, h[:])

	entry := &AuditEntry{
		Report:    *report,
		PrevHash:  prevHash,
		EntryHash: entryHash,
		Signature: hex.EncodeToString(sig),
		SignerID:  hex.EncodeToString(at.pubKey),
	}

	// Persist entry
	entryJSON, err := json.Marshal(entry)
	if err != nil {
		return nil, fmt.Errorf("marshal audit entry: %w", err)
	}
	key := []byte(auditPrefix + report.ID)
	if err := at.store.Set(key, entryJSON); err != nil {
		return nil, fmt.Errorf("store audit entry: %w", err)
	}

	// Update chain tip
	at.lastHash = h[:]
	_ = at.store.Set([]byte("audit:last_hash"), h[:])

	return entry, nil
}

// Verify checks that an audit entry's hash and signature are valid.
func (at *AuditTrail) Verify(entry *AuditEntry) error {
	// Recompute entry hash
	payload := auditPayload(&entry.Report, entry.PrevHash)
	h := sha256.Sum256(payload)
	expectedHash := hex.EncodeToString(h[:])
	if entry.EntryHash != expectedHash {
		return fmt.Errorf("hash mismatch: expected %s, got %s", expectedHash, entry.EntryHash)
	}

	// Verify signature
	sigBytes, err := hex.DecodeString(entry.Signature)
	if err != nil {
		return fmt.Errorf("invalid signature hex: %w", err)
	}
	pubBytes, err := hex.DecodeString(entry.SignerID)
	if err != nil {
		return fmt.Errorf("invalid signer hex: %w", err)
	}
	if len(pubBytes) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid public key size: %d", len(pubBytes))
	}
	if !ed25519.Verify(ed25519.PublicKey(pubBytes), h[:], sigBytes) {
		return fmt.Errorf("signature verification failed")
	}

	return nil
}

// GetEntry retrieves an audit entry by report ID.
func (at *AuditTrail) GetEntry(reportID string) (*AuditEntry, error) {
	val, err := at.store.Get([]byte(auditPrefix + reportID))
	if err != nil || val == nil {
		return nil, fmt.Errorf("entry not found: %s", reportID)
	}
	var entry AuditEntry
	if err := json.Unmarshal(val, &entry); err != nil {
		return nil, fmt.Errorf("unmarshal audit entry: %w", err)
	}
	return &entry, nil
}

// RecentEntries returns the most recent audit entries (up to limit).
func (at *AuditTrail) RecentEntries(limit int) []AuditEntry {
	at.mu.Lock()
	defer at.mu.Unlock()

	prefix := []byte(auditPrefix)
	var entries []AuditEntry

	at.store.DB().View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = prefix
		opts.Reverse = true
		it := txn.NewIterator(opts)
		defer it.Close()

		count := 0
		for it.Seek(append(prefix, 0xFF)); it.ValidForPrefix(prefix); it.Next() {
			if count >= limit {
				break
			}
			var entry AuditEntry
			err := it.Item().Value(func(val []byte) error {
				return json.Unmarshal(val, &entry)
			})
			if err != nil {
				continue
			}

			// Verify inline
			if verifyErr := at.Verify(&entry); verifyErr != nil {
				entry.SignerID = "INVALID: " + verifyErr.Error()
			}

			entries = append(entries, entry)
			count++
		}
		return nil
	})

	return entries
}

// auditPayload builds the canonical bytes for hashing/signing.
func auditPayload(report *models.SpamReport, prevHash string) []byte {
	canonical := fmt.Sprintf("%s|%s|%s|%s|%s|%d|%s",
		report.ID,
		report.URL,
		report.ReporterID,
		report.Reason,
		report.Detail,
		report.Timestamp.UnixNano(),
		prevHash,
	)
	return []byte(canonical)
}
