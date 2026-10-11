package p2p

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"math"
	"time"
)

// ProofOfWork is a hashcash-style proof attached to gossip messages.
// Prevents Sybil peers from flooding the network with cheap announcements.
type ProofOfWork struct {
	Nonce      uint64 `json:"nonce"`
	Timestamp  int64  `json:"timestamp"`  // unix seconds
	Difficulty uint8  `json:"difficulty"` // required leading zero bits
}

const (
	// DefaultPoWDifficulty is the baseline difficulty (leading zero bits).
	// 20 bits ≈ ~1M hashes ≈ ~100ms on modern hardware. The old 16-bit baseline
	// (~10ms) was too cheap to meaningfully deter Sybil flooding.
	DefaultPoWDifficulty uint8 = 20

	// MaxPoWDifficulty caps the difficulty for low-trust peers.
	// 26 bits ≈ ~67M hashes ≈ a few seconds.
	MaxPoWDifficulty uint8 = 26

	// PoW proofs expire after this window to prevent replay.
	PoWMaxAge = 5 * time.Minute
)

// ComputePoW finds a nonce such that SHA-256(challenge || nonce) has at least
// `difficulty` leading zero bits.
func ComputePoW(challenge []byte, difficulty uint8) ProofOfWork {
	now := time.Now().Unix()
	ts := make([]byte, 8)
	binary.BigEndian.PutUint64(ts, uint64(now))

	base := make([]byte, 0, len(challenge)+16)
	base = append(base, challenge...)
	base = append(base, ts...)

	nonceBuf := make([]byte, 8)
	for nonce := uint64(0); nonce < math.MaxUint64; nonce++ {
		binary.BigEndian.PutUint64(nonceBuf, nonce)
		h := sha256.Sum256(append(base, nonceBuf...))
		if hasLeadingZeroBits(h[:], difficulty) {
			return ProofOfWork{
				Nonce:      nonce,
				Timestamp:  now,
				Difficulty: difficulty,
			}
		}
	}
	// Practically unreachable
	return ProofOfWork{Timestamp: now}
}

// VerifyPoW checks that the proof satisfies the difficulty requirement.
func VerifyPoW(challenge []byte, pow ProofOfWork, minDifficulty uint8) error {
	// Check staleness
	age := time.Since(time.Unix(pow.Timestamp, 0))
	if age < 0 || age > PoWMaxAge {
		return fmt.Errorf("pow expired (age=%s)", age)
	}

	if pow.Difficulty < minDifficulty {
		return fmt.Errorf("pow difficulty too low: got %d, need %d", pow.Difficulty, minDifficulty)
	}

	ts := make([]byte, 8)
	binary.BigEndian.PutUint64(ts, uint64(pow.Timestamp))

	base := make([]byte, 0, len(challenge)+16)
	base = append(base, challenge...)
	base = append(base, ts...)

	nonceBuf := make([]byte, 8)
	binary.BigEndian.PutUint64(nonceBuf, pow.Nonce)

	h := sha256.Sum256(append(base, nonceBuf...))
	if !hasLeadingZeroBits(h[:], pow.Difficulty) {
		return fmt.Errorf("pow verification failed")
	}

	return nil
}

// PoWDifficultyForTrust returns the required PoW difficulty based on peer trust score.
// High-trust peers (>0.7) get baseline difficulty; low-trust peers get higher difficulty.
func PoWDifficultyForTrust(trustScore float64) uint8 {
	switch {
	case trustScore >= 0.7:
		return DefaultPoWDifficulty
	case trustScore >= 0.4:
		return DefaultPoWDifficulty + 2
	case trustScore >= 0.2:
		return DefaultPoWDifficulty + 4
	default:
		return MaxPoWDifficulty
	}
}

// PoWChallenge builds the challenge bytes for a URL announcement proof.
func PoWChallenge(peerID string, urls []string) []byte {
	h := sha256.New()
	h.Write([]byte(peerID))
	for _, u := range urls {
		h.Write([]byte(u))
	}
	return h.Sum(nil)
}

// PoWChallengeHex returns the hex-encoded challenge for API display.
func PoWChallengeHex(challenge []byte) string {
	return hex.EncodeToString(challenge)
}

// hasLeadingZeroBits checks if a hash has at least n leading zero bits.
func hasLeadingZeroBits(hash []byte, n uint8) bool {
	fullBytes := n / 8
	remainBits := n % 8

	for i := uint8(0); i < fullBytes; i++ {
		if hash[i] != 0 {
			return false
		}
	}

	if remainBits > 0 {
		mask := byte(0xFF << (8 - remainBits))
		if hash[fullBytes]&mask != 0 {
			return false
		}
	}

	return true
}
