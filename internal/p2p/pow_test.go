package p2p

import (
	"testing"
	"time"
)

func TestComputeAndVerifyPoW_Roundtrip(t *testing.T) {
	challenge := PoWChallenge("peer-abc", []string{"https://example.com"})
	pow := ComputePoW(challenge, DefaultPoWDifficulty)

	if err := VerifyPoW(challenge, pow, DefaultPoWDifficulty); err != nil {
		t.Fatalf("valid proof rejected: %v", err)
	}
}

// TestVerifyPoW_RejectsMissingProof is the regression test for making PoW
// mandatory: a zero-value proof (a peer that simply omits the work) must fail.
func TestVerifyPoW_RejectsMissingProof(t *testing.T) {
	challenge := PoWChallenge("peer-abc", []string{"https://example.com"})
	var empty ProofOfWork // Nonce=0, Timestamp=0, Difficulty=0

	if err := VerifyPoW(challenge, empty, DefaultPoWDifficulty); err == nil {
		t.Fatal("expected missing/zero proof to be rejected, got nil error")
	}
}

func TestVerifyPoW_RejectsUnderDifficulty(t *testing.T) {
	challenge := PoWChallenge("peer-abc", []string{"https://example.com"})
	// Produce a proof at the baseline, then demand more than it satisfies.
	pow := ComputePoW(challenge, DefaultPoWDifficulty)

	if err := VerifyPoW(challenge, pow, MaxPoWDifficulty); err == nil {
		t.Fatalf("expected proof at difficulty %d to be rejected when %d required",
			DefaultPoWDifficulty, MaxPoWDifficulty)
	}
}

func TestVerifyPoW_RejectsStaleProof(t *testing.T) {
	challenge := PoWChallenge("peer-abc", []string{"https://example.com"})
	pow := ComputePoW(challenge, DefaultPoWDifficulty)
	pow.Timestamp = time.Now().Add(-2 * PoWMaxAge).Unix() // outside the replay window

	if err := VerifyPoW(challenge, pow, DefaultPoWDifficulty); err == nil {
		t.Fatal("expected stale proof to be rejected")
	}
}

func TestVerifyPoW_RejectsWrongChallenge(t *testing.T) {
	pow := ComputePoW(PoWChallenge("peer-abc", []string{"https://a.com"}), DefaultPoWDifficulty)
	other := PoWChallenge("peer-xyz", []string{"https://b.com"})

	if err := VerifyPoW(other, pow, DefaultPoWDifficulty); err == nil {
		t.Fatal("expected proof bound to a different challenge to be rejected")
	}
}

// TestPoWDifficultyForTrust_Escalates verifies low-trust peers face strictly
// more work, and that a neutral-trust peer's self-computed proof (what the
// publish path produces) satisfies a neutral-trust verifier.
func TestPoWDifficultyForTrust_Escalates(t *testing.T) {
	high := PoWDifficultyForTrust(0.9)
	neutral := PoWDifficultyForTrust(0.5)
	low := PoWDifficultyForTrust(0.1)

	if !(high <= neutral && neutral < low) {
		t.Fatalf("expected high(%d) <= neutral(%d) < low(%d)", high, neutral, low)
	}
	if low != MaxPoWDifficulty {
		t.Fatalf("expected lowest trust to require MaxPoWDifficulty(%d), got %d", MaxPoWDifficulty, low)
	}

	// A neutral peer computes at PoWDifficultyForTrust(0.5); a neutral verifier
	// must accept it (the coupling bug fix).
	challenge := PoWChallenge("new-peer", []string{"https://example.com"})
	pow := ComputePoW(challenge, neutral)
	if err := VerifyPoW(challenge, pow, neutral); err != nil {
		t.Fatalf("neutral-trust proof rejected by neutral verifier: %v", err)
	}
}
