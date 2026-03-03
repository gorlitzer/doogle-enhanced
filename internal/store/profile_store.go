package store

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

const profileKey = "profile:master"

// ProfileStore persists the local MasterProfile in BadgerDB.
// Single key, single JSON blob. Uses a mutex for concurrent writes.
type ProfileStore struct {
	bs *BadgerStore
	mu sync.Mutex
}

// NewProfileStore creates a ProfileStore backed by the shared BadgerStore.
func NewProfileStore(bs *BadgerStore) *ProfileStore {
	return &ProfileStore{bs: bs}
}

// Get loads the master profile, returning an empty initialized profile if none exists.
func (ps *ProfileStore) Get() (*models.MasterProfile, error) {
	data, err := ps.bs.Get([]byte(profileKey))
	if err != nil {
		return nil, err
	}
	if data == nil {
		return models.NewMasterProfile(), nil
	}
	var p models.MasterProfile
	if err := json.Unmarshal(data, &p); err != nil {
		return models.NewMasterProfile(), nil
	}
	// Ensure maps are initialized (defensive against partial JSON)
	if p.Interests == nil {
		p.Interests = make(map[string]float64)
	}
	if p.TopDomains == nil {
		p.TopDomains = make(map[string]int)
	}
	if p.SearchTopics == nil {
		p.SearchTopics = make(map[string]int64)
	}
	if p.RoleAffinities == nil {
		p.RoleAffinities = make(map[string]float64)
	}
	return &p, nil
}

// Save persists the profile.
func (ps *ProfileStore) Save(p *models.MasterProfile) error {
	p.UpdatedAt = time.Now()
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return ps.bs.Set([]byte(profileKey), data)
}

// RecordInterests sets interest weights for the given subcategory IDs (from wizard).
func (ps *ProfileStore) RecordInterests(subcategoryIDs []string) error {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	p, err := ps.Get()
	if err != nil {
		return err
	}
	for _, id := range subcategoryIDs {
		p.Interests[id] = 1.0
	}
	return ps.Save(p)
}

// RecordSearchTopic increments the search count for a category.
func (ps *ProfileStore) RecordSearchTopic(categoryID string) error {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	p, err := ps.Get()
	if err != nil {
		return err
	}
	p.SearchTopics[categoryID]++
	return ps.Save(p)
}

// RecordReport increments the reports-made counter.
func (ps *ProfileStore) RecordReport() error {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	p, err := ps.Get()
	if err != nil {
		return err
	}
	p.ReportsMade++
	return ps.Save(p)
}
