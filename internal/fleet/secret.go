package fleet

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
)

const secretLen = 32 // 256 bits

// LoadOrCreateSecret loads a fleet secret from disk, or generates a new one.
// If secretOverride is non-empty, it is decoded from hex and used directly
// (not persisted).
func LoadOrCreateSecret(dataDir, secretOverride string) ([]byte, error) {
	if secretOverride != "" {
		b, err := hex.DecodeString(secretOverride)
		if err != nil {
			return nil, fmt.Errorf("invalid fleet secret hex: %w", err)
		}
		if len(b) != secretLen {
			return nil, fmt.Errorf("fleet secret must be %d bytes (%d hex chars)", secretLen, secretLen*2)
		}
		return b, nil
	}

	path := filepath.Join(dataDir, "fleet.secret")

	// Try to read existing secret.
	data, err := os.ReadFile(path)
	if err == nil && len(data) == secretLen {
		return data, nil
	}

	// Generate new secret.
	secret := make([]byte, secretLen)
	if _, err := rand.Read(secret); err != nil {
		return nil, fmt.Errorf("generate fleet secret: %w", err)
	}

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	if err := os.WriteFile(path, secret, 0600); err != nil {
		return nil, fmt.Errorf("write fleet secret: %w", err)
	}

	return secret, nil
}

// HMACSign computes HMAC-SHA256(secret, msg) and returns the hex-encoded signature.
func HMACSign(secret, msg []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write(msg)
	return hex.EncodeToString(mac.Sum(nil))
}

// HMACVerify checks an HMAC-SHA256 signature using constant-time comparison.
func HMACVerify(secret, msg []byte, sigHex string) bool {
	expected := HMACSign(secret, msg)
	return hmac.Equal([]byte(expected), []byte(sigHex))
}

// DeriveAPIToken derives a deterministic bearer token from the fleet secret.
func DeriveAPIToken(secret []byte) string {
	return HMACSign(secret, []byte("doogle-fleet-api-token"))
}
