package models

import (
	"crypto/sha256"
	"encoding/hex"
	"time"
)

// Document represents a crawled and indexed web page.
type Document struct {
	ID          string    `json:"id"`
	URL         string    `json:"url"`
	Domain      string    `json:"domain"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Content     string    `json:"content"`
	ContentHash string    `json:"content_hash"`
	ContentSize int       `json:"content_size"`
	Links       []Link    `json:"links,omitempty"`
	Images      []Image   `json:"images,omitempty"`
	Headings    []Heading `json:"headings,omitempty"`
	StatusCode  int       `json:"status_code"`
	Depth       int       `json:"depth"`
	WordCount   int       `json:"word_count"`
	CrawledAt   time.Time `json:"crawled_at"`
	IndexedAt   time.Time `json:"indexed_at"`

	// Metadata
	Language    string   `json:"language,omitempty"`
	Categories  []string `json:"categories,omitempty"`
	Keywords    []string `json:"keywords,omitempty"`
	OGTitle     string   `json:"og_title,omitempty"`
	OGDesc      string   `json:"og_description,omitempty"`
	Canonical   string   `json:"canonical,omitempty"`
	IsHTTPS     bool     `json:"is_https"`

	// Quality scores (set by indexer)
	EEATScore    float64 `json:"eeat_score"`
	QualityScore float64 `json:"quality_score"`
	SpamScore    float64 `json:"spam_score"`
	LinkScore    float64 `json:"link_score"`
	SEOScore     float64 `json:"seo_score"`

	// Readability (set by indexer)
	ReadabilityScore    float64 `json:"readability_score"`
	FleschReadingEase   float64 `json:"flesch_reading_ease"`
	FleschKincaidGrade  float64 `json:"flesch_kincaid_grade"`
	CitationScore       float64 `json:"citation_score"`
	AuthorCredibility   float64 `json:"author_credibility"`

	// Freshness (set by indexer)
	FreshnessScore  float64 `json:"freshness_score"`
	IsTimeSensitive bool    `json:"is_time_sensitive"`
	IsEvergreen     bool    `json:"is_evergreen"`

	// PageRank (set by PageRank computer)
	PageRankScore float64 `json:"pagerank_score"`

	// Composite
	RelevanceScore float64 `json:"relevance_score"`
}

// Link represents a discovered hyperlink.
type Link struct {
	URL        string `json:"url"`
	Text       string `json:"text"`
	IsExternal bool   `json:"is_external"`
	NoFollow   bool   `json:"nofollow,omitempty"`
}

// Image represents an extracted image.
type Image struct {
	URL   string `json:"url"`
	Alt   string `json:"alt"`
	Title string `json:"title,omitempty"`
}

// Heading represents an HTML heading element.
type Heading struct {
	Level int    `json:"level"` // 1-6
	Text  string `json:"text"`
}

// ComputeHash computes a SHA-256 hash of the document content.
func (d *Document) ComputeHash() {
	h := sha256.Sum256([]byte(d.Content))
	d.ContentHash = hex.EncodeToString(h[:])
}

// DocumentID generates a deterministic document ID from its URL.
func DocumentID(url string) string {
	h := sha256.Sum256([]byte(url))
	return hex.EncodeToString(h[:16])
}
