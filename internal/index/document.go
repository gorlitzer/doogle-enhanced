package index

import "time"

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
	Categories string `json:"categories"` // comma-separated for Bleve
	Keywords   string `json:"keywords"`   // comma-separated for Bleve

	// Anchor text from inbound links
	AnchorText string `json:"anchor_text"`

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

	// Flags
	IsHTTPS         bool `json:"is_https"`
	IsTimeSensitive bool `json:"is_time_sensitive"`
	IsEvergreen     bool `json:"is_evergreen"`
}
