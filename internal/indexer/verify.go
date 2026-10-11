package indexer

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"github.com/doogle/doogle-v2/internal/models"
)

// ContentVerifier signs and verifies document content hashes with Ed25519.
// This proves that the indexing node attests to the content it crawled.
type ContentVerifier struct {
	privKey ed25519.PrivateKey
	pubKey  ed25519.PublicKey
	pubHex  string
}

// NewContentVerifier creates a verifier from a 64-byte Ed25519 private key.
func NewContentVerifier(rawKey []byte) *ContentVerifier {
	priv := ed25519.PrivateKey(rawKey)
	pub := priv.Public().(ed25519.PublicKey)
	return &ContentVerifier{
		privKey: priv,
		pubKey:  pub,
		pubHex:  hex.EncodeToString(pub),
	}
}

// Sign signs the document's content hash and stamps the signature fields.
func (cv *ContentVerifier) Sign(doc *models.Document) {
	if doc.ContentHash == "" {
		doc.ComputeHash()
	}
	hashBytes, err := hex.DecodeString(doc.ContentHash)
	if err != nil {
		return
	}
	sig := ed25519.Sign(cv.privKey, hashBytes)
	doc.ContentSig = hex.EncodeToString(sig)
	doc.ContentSigner = cv.pubHex
}

// Verify checks that a document's content signature is valid.
func Verify(doc *models.Document) error {
	if doc.ContentSig == "" || doc.ContentSigner == "" {
		return fmt.Errorf("missing content signature")
	}

	// Recompute hash to ensure it matches
	h := sha256.Sum256([]byte(doc.Content))
	expectedHash := hex.EncodeToString(h[:])
	if doc.ContentHash != expectedHash {
		return fmt.Errorf("content hash mismatch")
	}

	sigBytes, err := hex.DecodeString(doc.ContentSig)
	if err != nil {
		return fmt.Errorf("invalid signature hex: %w", err)
	}
	pubBytes, err := hex.DecodeString(doc.ContentSigner)
	if err != nil {
		return fmt.Errorf("invalid signer hex: %w", err)
	}
	if len(pubBytes) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid public key size: %d", len(pubBytes))
	}

	hashBytes, _ := hex.DecodeString(doc.ContentHash)
	if !ed25519.Verify(ed25519.PublicKey(pubBytes), hashBytes, sigBytes) {
		return fmt.Errorf("signature verification failed")
	}

	return nil
}
