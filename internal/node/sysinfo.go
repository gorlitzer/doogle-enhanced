package node

import (
	"fmt"
	"runtime"
)

// SystemInfo describes the host machine's resources.
type SystemInfo struct {
	TotalMemoryMB   int64  `json:"total_memory_mb"`
	CPUCores        int    `json:"cpu_cores"`
	FreeSpaceMB     int64  `json:"free_space_mb"`
	Recommended     string `json:"recommended"`      // "low-resource" or "standard"
	RecommendReason string `json:"recommend_reason"`
	LowResource     bool   `json:"low_resource"`      // current mode
}

// DetectSystemResources gathers CPU, RAM, and disk info and makes a recommendation.
func DetectSystemResources(dataDir string, currentLowResource bool) *SystemInfo {
	info := &SystemInfo{
		CPUCores:    runtime.NumCPU(),
		LowResource: currentLowResource,
	}

	info.TotalMemoryMB = totalMemoryMB()

	free := freeSpace(dataDir)
	if free >= 0 {
		info.FreeSpaceMB = free / (1024 * 1024)
	} else {
		info.FreeSpaceMB = -1
	}

	// Recommendation logic
	if info.TotalMemoryMB > 0 && info.TotalMemoryMB < 2048 {
		info.Recommended = "low-resource"
		info.RecommendReason = fmt.Sprintf("Limited RAM (%d MB)", info.TotalMemoryMB)
	} else if info.CPUCores <= 2 {
		info.Recommended = "low-resource"
		info.RecommendReason = fmt.Sprintf("Limited CPU (%d cores)", info.CPUCores)
	} else {
		info.Recommended = "standard"
		info.RecommendReason = fmt.Sprintf("%d CPU cores, %d MB RAM", info.CPUCores, info.TotalMemoryMB)
	}

	return info
}
