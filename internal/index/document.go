package index

import (
	"time"
)

// IndexDocument is the Bleve-indexed representation of a web page.
type IndexDocument struct {
	ID          string    `json:"id"`
	URL         string    `json:"url"`
	Domain      string    `json:"domain"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Content     string    `json:"content"`
	ContentHash string    `json:"content_hash"`
	ContentSize int       `json:"content_size"`
	StatusCode  int       `json:"status_code"`
	Depth       int       `json:"depth"`
	WordCount   int       `json:"word_count"`
	CrawledAt   time.Time `json:"crawled_at"`
	IndexedAt   time.Time `json:"indexed_at"`

	// Metadata
	Language   string `json:"language"`
	Country    string `json:"country"` // ISO 3166-1 alpha-2
	Categories string `json:"categories"` // comma-separated for Bleve
	Keywords   string `json:"keywords"`   // comma-separated for Bleve

	// Summary (extractive)
	Summary string `json:"summary"`

	// Anchor text from inbound links
	AnchorText string `json:"anchor_text"`

	// New searchable fields
	URLText      string `json:"url_text"`      // readable words from URL path
	HeadingsText string `json:"headings_text"` // concatenated h1-h3 text

	// Scoring
	PageRankScore      float64 `json:"pagerank_score"`
	EEATScore          float64 `json:"eeat_score"`
	QualityScore       float64 `json:"quality_score"`
	SpamScore          float64 `json:"spam_score"`
	LinkScore          float64 `json:"link_score"`
	SEOScore           float64 `json:"seo_score"`
	ReadabilityScore   float64 `json:"readability_score"`
	CitationScore      float64 `json:"citation_score"`
	FreshnessScore     float64 `json:"freshness_score"`
	AuthorCredibility  float64 `json:"author_credibility"`
	RelevanceScore     float64 `json:"relevance_score"`
	StaticScore          float64 `json:"static_score"`
	DomainAuthorityScore float64 `json:"domain_authority_score"`
	URLQualityScore      float64 `json:"url_quality_score"`

	// Provenance — which peer originally indexed this document
	OriginPeerID string `json:"origin_peer_id"`

	// Index generation (for incremental reindexing)
	Generation uint64 `json:"generation"`

	// Flags
	IsHTTPS         bool `json:"is_https"`
	IsTimeSensitive bool `json:"is_time_sensitive"`
	IsEvergreen     bool `json:"is_evergreen"`

	// Image search: concatenated alt text + captions for full-text search
	ImageText  string `json:"image_text"`
	ImageCount int    `json:"image_count"`

	// Structured data: schema type for filtering
	SchemaType     string `json:"schema_type"`
	StructuredText string `json:"structured_text"` // flattened structured data for search

	// Performance & mobile scores
	PerfScore   float64 `json:"perf_score"`
	MobileScore float64 `json:"mobile_score"`
}

// Type implements bleve.Classifier. All documents use the default mapping;
// language-specific analysis is applied at query time via LangAnalyzer().
func (d *IndexDocument) Type() string {
	return "_default"
}
