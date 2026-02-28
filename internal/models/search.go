package models

import "time"

// SearchRequest represents a search query.
type SearchRequest struct {
	Query    string `json:"query"`
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
}

// SearchResponse contains search results.
type SearchResponse struct {
	Query      string         `json:"query"`
	Results    []SearchResult `json:"results"`
	Total      int            `json:"total"`
	Page       int            `json:"page"`
	PageSize   int            `json:"page_size"`
	TookMs     int64          `json:"took_ms"`
	PeersAsked int            `json:"peers_asked,omitempty"`
}

// SearchResult represents a single search hit.
type SearchResult struct {
	URL          string  `json:"url"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	Domain       string  `json:"domain"`
	Score        float64 `json:"score"`
	PeerID       string  `json:"peer_id,omitempty"`

	// Scoring signals (used by ranker, exposed for transparency)
	EEATScore         float64   `json:"eeat_score,omitempty"`
	QualityScore      float64   `json:"quality_score,omitempty"`
	SpamScore         float64   `json:"spam_score,omitempty"`
	LinkScore         float64   `json:"link_score,omitempty"`
	SEOScore          float64   `json:"seo_score,omitempty"`
	ReadabilityScore  float64   `json:"readability_score,omitempty"`
	CitationScore     float64   `json:"citation_score,omitempty"`
	FreshnessScore    float64   `json:"freshness_score,omitempty"`
	AuthorCredibility float64   `json:"author_credibility,omitempty"`
	RelevanceScore    float64   `json:"relevance_score,omitempty"`
	CrawledAt         time.Time `json:"crawled_at,omitempty"`
	IsTimeSensitive   bool      `json:"is_time_sensitive,omitempty"`
	IsEvergreen       bool      `json:"is_evergreen,omitempty"`
}

// NodeStatus represents the current state of a node.
type NodeStatus struct {
	PeerID         string    `json:"peer_id"`
	Addrs          []string  `json:"addrs"`
	ConnectedPeers int       `json:"connected_peers"`
	PeerList       []string  `json:"peer_list,omitempty"`
	IndexedDocs    int       `json:"indexed_docs"`
	CrawledURLs    int64     `json:"crawled_urls"`
	URLsInQueue    int       `json:"urls_in_queue"`
	Uptime         string    `json:"uptime"`
	StartedAt      time.Time `json:"started_at"`
}

// CrawlerInfo holds crawler-specific stats for the admin dashboard.
type CrawlerInfo struct {
	Workers       int    `json:"workers"`
	RateLimit     int    `json:"rate_limit"`
	MaxDepth      int    `json:"max_depth"`
	UserAgent     string `json:"user_agent"`
	TotalCrawled  int64  `json:"total_crawled"`
	TotalFailed   int64  `json:"total_failed"`
	ActiveWorkers int64  `json:"active_workers"`
	SeenURLs      int    `json:"seen_urls"`
}

// IndexerInfo holds indexer-specific stats for the admin dashboard.
type IndexerInfo struct {
	TotalIndexed      int64   `json:"total_indexed"`
	AvgQuality        float64 `json:"avg_quality"`
	AvgSpam           float64 `json:"avg_spam"`
	SpamRejected      int64   `json:"spam_rejected"`
	DuplicatesSkipped int64   `json:"duplicates_skipped"`
	EmptySkipped      int64   `json:"empty_skipped"`
}

// PeerInfo holds detailed info about a connected peer.
type PeerInfo struct {
	PeerID string   `json:"peer_id"`
	Addrs  []string `json:"addrs"`
}
