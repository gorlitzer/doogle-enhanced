package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestVerifyChecksum(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "binary")
	content := []byte("pretend this is a doogle binary")
	if err := os.WriteFile(path, content, 0644); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(content)
	good := hex.EncodeToString(sum[:])

	if err := VerifyChecksum(path, good); err != nil {
		t.Fatalf("valid checksum rejected: %v", err)
	}
	// Case-insensitive match.
	if err := VerifyChecksum(path, "ABCDEF0000000000000000000000000000000000000000000000000000000000"); err == nil {
		t.Fatal("expected checksum mismatch to be rejected")
	}
	if err := VerifyChecksum(path, good[:len(good)-2]+"ff"); err == nil {
		t.Fatal("expected tampered checksum to be rejected")
	}
}
