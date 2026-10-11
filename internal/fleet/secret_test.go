package fleet

import (
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrCreateSecret_Generate(t *testing.T) {
	dir := t.TempDir()
	secret, err := LoadOrCreateSecret(dir, "")
	if err != nil {
		t.Fatalf("LoadOrCreateSecret: %v", err)
	}
	if len(secret) != secretLen {
		t.Fatalf("expected %d bytes, got %d", secretLen, len(secret))
	}

	// File should exist with 0600 permissions.
	path := filepath.Join(dir, "fleet.secret")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat fleet.secret: %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Errorf("expected 0600 permissions, got %o", info.Mode().Perm())
	}
}

func TestLoadOrCreateSecret_Persistence(t *testing.T) {
	dir := t.TempDir()

	// Generate.
	s1, err := LoadOrCreateSecret(dir, "")
	if err != nil {
		t.Fatal(err)
	}

	// Reload — should return the same secret.
	s2, err := LoadOrCreateSecret(dir, "")
	if err != nil {
		t.Fatal(err)
	}

	if hex.EncodeToString(s1) != hex.EncodeToString(s2) {
		t.Fatal("expected same secret on reload")
	}
}

func TestLoadOrCreateSecret_Override(t *testing.T) {
	dir := t.TempDir()
	override := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

	secret, err := LoadOrCreateSecret(dir, override)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(secret) != override {
		t.Fatal("override secret not used")
	}

	// Should NOT have been persisted.
	path := filepath.Join(dir, "fleet.secret")
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("override secret should not be persisted to disk")
	}
}

func TestLoadOrCreateSecret_InvalidHex(t *testing.T) {
	dir := t.TempDir()
	_, err := LoadOrCreateSecret(dir, "not-valid-hex")
	if err == nil {
		t.Fatal("expected error for invalid hex")
	}
}

func TestLoadOrCreateSecret_WrongLength(t *testing.T) {
	dir := t.TempDir()
	_, err := LoadOrCreateSecret(dir, "aabbccdd") // only 4 bytes
	if err == nil {
		t.Fatal("expected error for wrong length")
	}
}

func TestHMACSignVerify(t *testing.T) {
	secret := []byte("test-secret-key-32-bytes-padded!")
	msg := []byte("hello world")

	sig := HMACSign(secret, msg)
	if sig == "" {
		t.Fatal("expected non-empty signature")
	}

	if !HMACVerify(secret, msg, sig) {
		t.Fatal("expected verification to pass")
	}

	// Wrong message should fail.
	if HMACVerify(secret, []byte("wrong message"), sig) {
		t.Fatal("expected verification to fail for wrong message")
	}

	// Wrong signature should fail.
	if HMACVerify(secret, msg, "deadbeef") {
		t.Fatal("expected verification to fail for wrong signature")
	}

	// Wrong secret should fail.
	if HMACVerify([]byte("wrong-secret-key-32-bytes-pad!!"), msg, sig) {
		t.Fatal("expected verification to fail for wrong secret")
	}
}

func TestDeriveAPIToken_Deterministic(t *testing.T) {
	secret := []byte("my-fleet-secret-is-32-bytes-ok!!")

	t1 := DeriveAPIToken(secret)
	t2 := DeriveAPIToken(secret)

	if t1 != t2 {
		t.Fatal("expected deterministic token")
	}
	if t1 == "" {
		t.Fatal("expected non-empty token")
	}
}

func TestDeriveAPIToken_DifferentSecrets(t *testing.T) {
	s1 := []byte("secret-one-is-32-bytes-padding!!")
	s2 := []byte("secret-two-is-32-bytes-padding!!")

	t1 := DeriveAPIToken(s1)
	t2 := DeriveAPIToken(s2)

	if t1 == t2 {
		t.Fatal("expected different tokens for different secrets")
	}
}
