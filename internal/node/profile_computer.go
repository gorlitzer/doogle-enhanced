package node

import (
	"context"
	"log/slog"
	"math"
	"sort"
	"time"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/store"
)

// ProfileComputer periodically recomputes TopDomains and RoleAffinities.
type ProfileComputer struct {
	profileStore *store.ProfileStore
	bleveIdx     *index.BleveStore
	shards       *index.ShardManager
	interval     time.Duration

	// Signal providers (injected by node)
	UptimeHoursFn    func() float64
	ConnectedPeersFn func() int
	IndexedDocsFn    func() int
}

// NewProfileComputer creates a new profile computer.
func NewProfileComputer(ps *store.ProfileStore, idx *index.BleveStore, shards *index.ShardManager) *ProfileComputer {
	return &ProfileComputer{
		profileStore: ps,
		bleveIdx:     idx,
		shards:       shards,
		interval:     5 * time.Minute,
	}
}

// Start runs the profile computation loop in the background.
func (pc *ProfileComputer) Start(ctx context.Context) {
	go func() {
		// Initial delay to let the node settle
		select {
		case <-time.After(30 * time.Second):
		case <-ctx.Done():
			return
		}

		pc.compute()

		ticker := time.NewTicker(pc.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				pc.compute()
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (pc *ProfileComputer) compute() {
	p, err := pc.profileStore.Get()
	if err != nil {
		slog.Error("profile computer: load error", "err", err)
		return
	}

	// ── TopDomains (top 50 by doc count) ──
	domains, err := pc.bleveIdx.ListDomains()
	if err == nil {
		domainCounts := make(map[string]int, len(domains))
		for _, d := range domains {
			domainCounts[d]++
		}
		// Sort and keep top 50
		type dc struct {
			domain string
			count  int
		}
		sorted := make([]dc, 0, len(domainCounts))
		for d, c := range domainCounts {
			sorted = append(sorted, dc{d, c})
		}
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].count > sorted[j].count
		})
		top := make(map[string]int, 50)
		for i, s := range sorted {
			if i >= 50 {
				break
			}
			top[s.domain] = s.count
		}
		p.TopDomains = top
	}

	// ── Role Affinities ──
	affinities := make(map[string]float64, 8)

	// Explorer: distinct interests count → 20 saturates
	affinities["Explorer"] = clamp(float64(len(p.Interests)) / 20.0)

	// Guardian: reports made → 50 saturates
	affinities["Guardian"] = clamp(float64(p.ReportsMade) / 50.0)

	// Connector: uptime_hours × connected_peers → 720 saturates
	uptimeHours := 0.0
	connectedPeers := 0
	if pc.UptimeHoursFn != nil {
		uptimeHours = pc.UptimeHoursFn()
	}
	if pc.ConnectedPeersFn != nil {
		connectedPeers = pc.ConnectedPeersFn()
	}
	connectorSignal := uptimeHours * float64(connectedPeers)
	affinities["Connector"] = clamp(connectorSignal / 720.0)

	// Specialist: Gini coefficient of domain doc distribution → 0.8 saturates
	affinities["Specialist"] = clamp(giniCoefficient(p.TopDomains) / 0.8)

	// Curator: reports + distinct search topics → 100 saturates
	distinctSearchTopics := len(p.SearchTopics)
	curatorSignal := float64(p.ReportsMade) + float64(distinctSearchTopics)
	affinities["Curator"] = clamp(curatorSignal / 100.0)

	// Amplifier: 0 (future)
	affinities["Amplifier"] = 0

	// Archivist: uptime_hours + indexed_docs/1000 → 1000+10k saturates
	indexedDocs := 0
	if pc.IndexedDocsFn != nil {
		indexedDocs = pc.IndexedDocsFn()
	}
	archivistSignal := uptimeHours + float64(indexedDocs)/1000.0
	// Saturates at uptime_hours=1000 + indexed_docs=10000 → signal=1000+10=1010
	affinities["Archivist"] = clamp(archivistSignal / 1010.0)

	// Builder: 0 (future)
	affinities["Builder"] = 0

	p.RoleAffinities = affinities

	if err := pc.profileStore.Save(p); err != nil {
		slog.Error("profile computer: save error", "err", err)
	}
}

// clamp restricts a value to [0.0, 1.0].
func clamp(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1.0 {
		return 1.0
	}
	return v
}

// giniCoefficient computes the Gini coefficient of a distribution.
// Returns 0 for empty/uniform, approaches 1 for highly concentrated.
func giniCoefficient(counts map[string]int) float64 {
	n := len(counts)
	if n < 2 {
		return 0
	}

	vals := make([]float64, 0, n)
	total := 0.0
	for _, c := range counts {
		vals = append(vals, float64(c))
		total += float64(c)
	}
	if total == 0 {
		return 0
	}

	sort.Float64s(vals)

	sumOfDiffs := 0.0
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			sumOfDiffs += math.Abs(vals[i] - vals[j])
		}
	}

	return sumOfDiffs / (2.0 * float64(n) * total)
}
