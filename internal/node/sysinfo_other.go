//go:build !darwin && !linux

package node

// totalMemoryMB returns 0 on unsupported platforms (RAM detection unavailable).
func totalMemoryMB() int64 {
	return 0
}
