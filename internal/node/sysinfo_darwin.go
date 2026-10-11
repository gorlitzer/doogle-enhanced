package node

import (
	"syscall"
	"unsafe"
)

// totalMemoryMB returns the total physical RAM in megabytes on macOS.
func totalMemoryMB() int64 {
	mib := [2]int32{6 /* CTL_HW */, 24 /* HW_MEMSIZE */}
	var memBytes uint64
	size := unsafe.Sizeof(memBytes)
	_, _, errno := syscall.Syscall6(
		syscall.SYS___SYSCTL,
		uintptr(unsafe.Pointer(&mib[0])),
		2,
		uintptr(unsafe.Pointer(&memBytes)),
		uintptr(unsafe.Pointer(&size)),
		0, 0,
	)
	if errno != 0 {
		return 0
	}
	return int64(memBytes / (1024 * 1024))
}
