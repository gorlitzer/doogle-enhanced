//go:build !windows

package node

import (
	"os"
	"path/filepath"
	"syscall"
)

// dirSize walks a directory tree and returns the total size in bytes.
func dirSize(path string) int64 {
	var total int64
	filepath.Walk(path, func(_ string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() {
			return nil
		}
		total += fi.Size()
		return nil
	})
	return total
}

// freeSpace returns the free bytes available on the volume containing path.
// Returns -1 if the information cannot be obtained.
func freeSpace(path string) int64 {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return -1
	}
	return int64(stat.Bavail) * int64(stat.Bsize)
}
