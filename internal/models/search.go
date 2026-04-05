package models

import (
	"time"
)

// ParsedQuery represents a structured, analyzed search query.
type ParsedQuery struct {
	Raw          string              // original query string
	Terms        []string // cleaned, stop-words removed
	Phrases      []string // from "quoted strings"
	SiteDomain   string   // from site:example.com
	Language     string   // from lang:xx filter (empty = any)
	Country      string   // from country:XX filter (empty = any)
	ExcludeTerms []string // from -term (NOT operator)
	OrGroups     [][]string          // groups of OR'd terms
	InTitle      string              // from intitle:term
	InURL        string              // from inurl:term
	InText       string              // from intext:term or inbody:term
	FileTypes    []string            // from filetype:ext or ext:ext
	Before       string              // from before:YYYY-MM-DD
	After        string              // from after:YYYY-MM-DD
	HasHTTPS     bool                // from has:https
	UseFuzzy     bool                // true for short queries (≤3 terms)
	UseOR        bool                // true to relax AND to OR (query relaxation fallback)
	CleanedQuery string              // fallback plain string
	Synonyms     []string            // synonym expansions for query terms
	PeerFilter   string              // from peer:PEERID — restrict to origin peer
	ExcludePeers []string            // from -peer:PEERID — exclude origin peers
}

// SearchRequest represents a search query.
type SearchRequest struct {
	Query    string `json:"query"`
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
}

// InstantAnswer represents a computed answer shown above search results.
type InstantAnswer struct {
	Type   string `json:"type"`             // "calculator", "conversion", "time", "date", "days_until", "featured_snippet"
	Query  string `json:"query"`
	Answer string `json:"answer"`
	Detail string `json:"detail,omitempty"`
	Source string `json:"source,omitempty"` // URL for featured snippets
}

// SearchResponse contains search results.
type SearchResponse struct {
	Query      string         `json:"query"`
	Results    []SearchResult `json:"results"`
	Total      int            `json:"total"`
	Page       int            `json:"page"`
	PageSize   int            `json:"page_size"`
	TookMs     int64          `json:"took_ms"`
	PeersAsked     int            `json:"peers_asked,omitempty"`
	SearXNGResults int            `json:"searxng_results,omitempty"`

	// Search intelligence
	Suggestion    string        `json:"suggestion,omitempty"`     // "Did you mean: X?"
	Intent        string        `json:"intent,omitempty"`         // informational, navigational, transactional, local
	SearchMode    string        `json:"search_mode,omitempty"`    // "bm25", "hybrid"
	EntityCard    *EntityCard   `json:"entity_card,omitempty"`    // knowledge graph card
	RelatedTopics []string      `json:"related_topics,omitempty"` // topic cluster labels

	// Round 2 features
	FeaturedSnippet *InstantAnswer `json:"featured_snippet,omitempty"`
	RelatedSearches []string       `json:"related_searches,omitempty"`
}

// SearchResult represents a single search hit.
type SearchResult struct {
	URL          string  `json:"url"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	Domain       string  `json:"domain"`
	Language     string  `json:"language,omitempty"`
	Country      string  `json:"country,omitempty"`
	Score        float64 `json:"score"`
	PeerID         string  `json:"peer_id,omitempty"`
	PeerName       string  `json:"peer_name,omitempty"`
	OriginPeerID   string  `json:"origin_peer_id,omitempty"`
	OriginPeerName string  `json:"origin_peer_name,omitempty"`
	Source         string  `json:"source,omitempty"` // "doogle" (default), "searxng"

	// Scoring signals (used by ranker, exposed for transparency)
	PageRankScore     float64   `json:"pagerank_score,omitempty"`
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
	StaticScore       float64   `json:"static_score,omitempty"`
	CrawledAt         time.Time `json:"crawled_at,omitempty"`
	IsTimeSensitive      bool    `json:"is_time_sensitive,omitempty"`
	IsEvergreen          bool    `json:"is_evergreen,omitempty"`
	DomainAuthorityScore float64 `json:"domain_authority_score,omitempty"`
	URLQualityScore      float64 `json:"url_quality_score,omitempty"`
	VectorSimilarity     float64 `json:"vector_similarity,omitempty"`
	PerfScore            float64 `json:"perf_score,omitempty"`
	MobileScore          float64 `json:"mobile_score,omitempty"`

	// Rich snippets
	SchemaType     string           `json:"schema_type,omitempty"`
	StructuredData []StructuredItem `json:"structured_data,omitempty"`

	// Trust: true if this document is under quarantine review (24h voting window)
	Quarantined       bool   `json:"quarantined,omitempty"`
	QuarantineReason  string `json:"quarantine_reason,omitempty"`
}

// EntityCard represents a knowledge graph card for an entity.
type EntityCard struct {
	Name            string            `json:"name"`
	Type            string            `json:"type"`
	Description     string            `json:"description"`
	Properties      map[string]string `json:"properties,omitempty"`
	RelatedEntities []EntityCardRef   `json:"related_entities,omitempty"`
	DocCount        int               `json:"doc_count"`
}

// EntityCardRef is a reference to a related entity.
type EntityCardRef struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// TrendItem represents a trending item with velocity metrics.
type TrendItem struct {
	Name          string  `json:"name"`
	CurrentRate   float64 `json:"current_rate"`
	AverageRate   float64 `json:"average_rate"`
	VelocityRatio float64 `json:"velocity_ratio"`
	Volume        int64   `json:"volume"`
}

// TrendsResponse holds trending queries and domains.
type TrendsResponse struct {
	TrendingQueries []TrendItem `json:"trending_queries"`
	TrendingDomains []TrendItem `json:"trending_domains"`
	ComputedAt      time.Time   `json:"computed_at"`
}

// NodeStatus represents the current state of a node.
type NodeStatus struct {
	PeerID         string    `json:"peer_id"`
	NodeName       string    `json:"node_name,omitempty"`
	Country        string    `json:"country,omitempty"`
	NodeType       string    `json:"node_type,omitempty"`
	Version        string    `json:"version,omitempty"`
	Commit         string    `json:"commit,omitempty"`
	BuildDate      string    `json:"build_date,omitempty"`
	Addrs          []string  `json:"addrs"`
	ConnectedPeers int       `json:"connected_peers"`
	PeerList       []string  `json:"peer_list,omitempty"`
	IndexedDocs    int       `json:"indexed_docs"`
	CrawledURLs    int64     `json:"crawled_urls"`
	URLsInQueue    int       `json:"urls_in_queue"`
	Uptime         string    `json:"uptime"`
	StartedAt      time.Time `json:"started_at"`
	LocalDocs      int       `json:"local_docs"`
	PeerDocs       int       `json:"peer_docs"`
	OwnedDomains   int       `json:"owned_domains"`
	ForwardedTasks int64     `json:"forwarded_tasks"`
	ReceivedTasks  int64     `json:"received_tasks"`
	UpdateNeeded   bool      `json:"update_needed,omitempty"`

	// Fleet (omitted when standalone)
	FleetRole          string `json:"fleet_role,omitempty"`           // "coordinator" or "worker"
	FleetAPIToken      string `json:"fleet_api_token,omitempty"`      // coordinator only
	FleetCoordinatorID string `json:"fleet_coordinator_id,omitempty"` // worker only
	FleetSecretFile    string `json:"fleet_secret_file,omitempty"`    // coordinator only
	FleetSecretHex     string `json:"fleet_secret_hex,omitempty"`     // coordinator only (localhost)
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
	JSRendered        int64 `json:"js_rendered"`
	ForwardedTasks    int64 `json:"forwarded_tasks"`
	ReceivedFromPeers int64 `json:"received_from_peers"`
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

// CrawlEvent represents a single crawl action for the live feed.
type CrawlEvent struct {
	Seq         uint64    `json:"seq"`
	URL         string    `json:"url"`
	Domain      string    `json:"domain"`
	Title       string    `json:"title,omitempty"`
	Status      string    `json:"status"`
	Error       string    `json:"error,omitempty"`
	StatusCode  int       `json:"status_code,omitempty"`
	ContentSize int       `json:"content_size,omitempty"`
	Depth       int       `json:"depth"`
	Timestamp   time.Time `json:"timestamp"`
}

// StorageInfo holds disk usage stats for the admin dashboard.
type StorageInfo struct {
	TotalBytes  int64  `json:"total_bytes"`
	BleveBytes  int64  `json:"bleve_bytes"`
	BadgerBytes int64  `json:"badger_bytes"`
	OtherBytes  int64  `json:"other_bytes"`
	FreeBytes   int64  `json:"free_bytes"` // -1 if unavailable
	DataDir     string `json:"data_dir"`
}

// ExplorerStats holds contribution stats for a single peer on the leaderboard.
type ExplorerStats struct {
	PeerID     string    `json:"peer_id"`
	NodeName   string    `json:"node_name,omitempty"`
	Country    string    `json:"country,omitempty"`
	DocCount   int       `json:"doc_count"`
	TrustScore float64   `json:"trust_score"`
	IsLocal    bool      `json:"is_local"`
	FirstSeen  time.Time `json:"first_seen,omitempty"`
	LastSeen    time.Time `json:"last_seen,omitempty"`
	DomainCount int       `json:"domain_count,omitempty"`
}

// LeaderboardResponse is the API response for the WebExplorers leaderboard.
type LeaderboardResponse struct {
	Explorers   []ExplorerStats `json:"explorers"`
	TotalDocs   int             `json:"total_docs"`
	LocalPeerID string          `json:"local_peer_id"`
}

// RelayStats holds stats for a single relay (light) node on the leaderboard.
type RelayStats struct {
	PeerID        string    `json:"peer_id"`
	NodeName      string    `json:"node_name,omitempty"`
	Country       string    `json:"country,omitempty"`
	DocsHosted    int       `json:"docs_hosted"`
	QueriesServed int64     `json:"queries_served"`
	Uptime        string    `json:"uptime,omitempty"`
	UptimeSeconds int64     `json:"uptime_seconds,omitempty"`
	TrustScore    float64   `json:"trust_score"`
	ConnectedPeers int      `json:"connected_peers"`
	IsLocal       bool      `json:"is_local"`
	FirstSeen     time.Time `json:"first_seen,omitempty"`
	LastSeen      time.Time `json:"last_seen,omitempty"`
}

// RelayLeaderboardResponse is the API response for the relay node leaderboard.
type RelayLeaderboardResponse struct {
	Relays      []RelayStats `json:"relays"`
	TotalDocs   int          `json:"total_docs"`
	LocalPeerID string       `json:"local_peer_id"`
}

// DomainOwnership shows which domains this node owns in the shard ring.
type DomainOwnership struct {
	TotalDomains int                `json:"total_domains"`
	OwnedDomains int                `json:"owned_domains"`
	Domains      []DomainAssignment `json:"domains"`
}

// DomainAssignment maps a domain to its shard owner.
type DomainAssignment struct {
	Domain  string `json:"domain"`
	OwnerID string `json:"owner_id"`
	IsLocal bool   `json:"is_local"`
}

// PeerInfo holds detailed info about a connected peer.
type PeerInfo struct {
	PeerID   string   `json:"peer_id"`
	NodeName string   `json:"node_name,omitempty"`
	Country  string   `json:"country,omitempty"`
	Version  string   `json:"version,omitempty"`
	Addrs    []string `json:"addrs"`
}
