package node

import "syscall"

// totalMemoryMB returns the total physical RAM in megabytes on Linux.
func totalMemoryMB() int64 {
	var info syscall.Sysinfo_t
	if err := syscall.Sysinfo(&info); err != nil {
		return 0
	}
	return int64(info.Totalram) * int64(info.Unit) / (1024 * 1024)
}
