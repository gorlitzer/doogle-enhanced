package node

import (
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"

	"github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/peer"
)

const keyFileName = "node.key"

// LoadOrCreateIdentity loads a persistent Ed25519 identity from disk,
// or generates a new one if none exists.
func LoadOrCreateIdentity(dataDir string) (crypto.PrivKey, peer.ID, error) {
	keyPath := filepath.Join(dataDir, keyFileName)

	// Try loading existing key
	if data, err := os.ReadFile(keyPath); err == nil {
		priv, err := crypto.UnmarshalPrivateKey(data)
		if err != nil {
			return nil, "", fmt.Errorf("unmarshal key: %w", err)
		}
		id, err := peer.IDFromPrivateKey(priv)
		if err != nil {
			return nil, "", fmt.Errorf("peer ID from key: %w", err)
		}
		return priv, id, nil
	}

	// Generate new Ed25519 key
	priv, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		return nil, "", fmt.Errorf("generate key: %w", err)
	}

	// Persist to disk
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, "", fmt.Errorf("create data dir: %w", err)
	}
	data, err := crypto.MarshalPrivateKey(priv)
	if err != nil {
		return nil, "", fmt.Errorf("marshal key: %w", err)
	}
	if err := os.WriteFile(keyPath, data, 0600); err != nil {
		return nil, "", fmt.Errorf("write key: %w", err)
	}

	id, err := peer.IDFromPrivateKey(priv)
	if err != nil {
		return nil, "", fmt.Errorf("peer ID from key: %w", err)
	}

	return priv, id, nil
}
