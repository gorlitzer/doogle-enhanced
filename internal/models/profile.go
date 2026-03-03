package models

import "time"

// MasterProfile is a local-only behavioral profile for the node operator.
// It tracks interests, search habits, report activity, and computes role
// affinity scores. Never shared with peers — stored in local BadgerDB.
type MasterProfile struct {
	Interests      map[string]float64 `json:"interests"`       // subcategory ID → weight
	TopDomains     map[string]int     `json:"top_domains"`     // domain → doc count (top 50)
	SearchTopics   map[string]int64   `json:"search_topics"`   // category ID → search count
	ReportsMade    int64              `json:"reports_made"`
	DomainsFlagged int64              `json:"domains_flagged"`
	RoleAffinities map[string]float64 `json:"role_affinities"` // role name → 0.0–1.0
	CreatedAt      time.Time          `json:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at"`
}

// AllRoles returns the 8 canonical role names.
func AllRoles() []string {
	return []string{
		"Explorer",
		"Guardian",
		"Connector",
		"Specialist",
		"Curator",
		"Amplifier",
		"Archivist",
		"Builder",
	}
}

// NewMasterProfile creates an empty initialized profile.
func NewMasterProfile() *MasterProfile {
	now := time.Now()
	affinities := make(map[string]float64, len(AllRoles()))
	for _, r := range AllRoles() {
		affinities[r] = 0
	}
	return &MasterProfile{
		Interests:      make(map[string]float64),
		TopDomains:     make(map[string]int),
		SearchTopics:   make(map[string]int64),
		RoleAffinities: affinities,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
}
