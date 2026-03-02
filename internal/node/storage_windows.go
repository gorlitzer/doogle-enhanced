//go:build windows

package node

import (
	"os"
	"path/filepath"
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

// freeSpace returns -1 on Windows (not implemented via syscall).
func freeSpace(_ string) int64 {
	return -1
}
