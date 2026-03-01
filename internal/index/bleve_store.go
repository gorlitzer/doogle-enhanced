package index

import (
	"fmt"
	"log"
	"time"

	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/analysis/analyzer/custom"
	"github.com/blevesearch/bleve/v2/analysis/lang/en"
	"github.com/blevesearch/bleve/v2/analysis/token/lowercase"
	"github.com/blevesearch/bleve/v2/analysis/tokenizer/unicode"
	"github.com/blevesearch/bleve/v2/mapping"

	// Register analysis components
	_ "github.com/blevesearch/bleve/v2/analysis/token/stop"

	"github.com/doogle/doogle-v2/internal/models"
)

const analyzerName = "doogle_en"

// BleveStore implements Store using Bleve full-text search.
type BleveStore struct {
	index bleve.Index
	path  string
}

// NewBleveStore opens or creates a Bleve index at the given path.
func NewBleveStore(path string) (*BleveStore, error) {
	// Try opening existing index
	idx, err := bleve.Open(path)
	if err == nil {
		log.Printf("bleve: opened existing index at %s", path)
		return &BleveStore{index: idx, path: path}, nil
	}

	// Create new index with custom mapping
	indexMapping, err := buildMapping()
	if err != nil {
		return nil, fmt.Errorf("build mapping: %w", err)
	}

	idx, err = bleve.New(path, indexMapping)
	if err != nil {
		return nil, fmt.Errorf("create bleve index: %w", err)
	}

	log.Printf("bleve: created new index at %s", path)
	return &BleveStore{index: idx, path: path}, nil
}

func buildMapping() (*mapping.IndexMappingImpl, error) {
	indexMapping := bleve.NewIndexMapping()

	// Custom English analyzer with stemming
	err := indexMapping.AddCustomAnalyzer(analyzerName, map[string]interface{}{
		"type":      custom.Name,
		"tokenizer": unicode.Name,
		"token_filters": []string{
			lowercase.Name,
			en.StopName,
			en.SnowballStemmerName,
		},
	})
	if err != nil {
		return nil, err
	}

	indexMapping.DefaultAnalyzer = analyzerName

	// Document mapping
	docMapping := bleve.NewDocumentMapping()

	// Text fields with the custom analyzer
	textField := bleve.NewTextFieldMapping()
	textField.Analyzer = analyzerName

	// Title and description use the same mapping — boosting is applied at query time
	titleField := bleve.NewTextFieldMapping()
	titleField.Analyzer = analyzerName

	descField := bleve.NewTextFieldMapping()
	descField.Analyzer = analyzerName

	// Keyword fields (not analyzed, stored as-is)
	keywordField := bleve.NewKeywordFieldMapping()

	// Numeric fields
	numericField := bleve.NewNumericFieldMapping()

	// Boolean fields (stored as numeric in Bleve)
	boolField := bleve.NewBooleanFieldMapping()

	// Date fields
	dateField := bleve.NewDateTimeFieldMapping()

	// --- Primary text fields (searched with BM25) ---
	docMapping.AddFieldMappingsAt("title", titleField)
	docMapping.AddFieldMappingsAt("description", descField)
	docMapping.AddFieldMappingsAt("content", textField)
	docMapping.AddFieldMappingsAt("keywords", textField)
	docMapping.AddFieldMappingsAt("categories", textField)

	// Anchor text from inbound links
	anchorField := bleve.NewTextFieldMapping()
	anchorField.Analyzer = analyzerName
	docMapping.AddFieldMappingsAt("anchor_text", anchorField)

	// --- Keyword / identifier fields ---
	docMapping.AddFieldMappingsAt("url", keywordField)
	docMapping.AddFieldMappingsAt("domain", keywordField)
	docMapping.AddFieldMappingsAt("content_hash", keywordField)
	docMapping.AddFieldMappingsAt("language", keywordField)

	// --- Numeric fields ---
	docMapping.AddFieldMappingsAt("content_size", numericField)
	docMapping.AddFieldMappingsAt("word_count", numericField)
	docMapping.AddFieldMappingsAt("status_code", numericField)
	docMapping.AddFieldMappingsAt("depth", numericField)

	// Scoring fields
	docMapping.AddFieldMappingsAt("pagerank_score", numericField)
	docMapping.AddFieldMappingsAt("eeat_score", numericField)
	docMapping.AddFieldMappingsAt("quality_score", numericField)
	docMapping.AddFieldMappingsAt("spam_score", numericField)
	docMapping.AddFieldMappingsAt("link_score", numericField)
	docMapping.AddFieldMappingsAt("seo_score", numericField)
	docMapping.AddFieldMappingsAt("readability_score", numericField)
	docMapping.AddFieldMappingsAt("citation_score", numericField)
	docMapping.AddFieldMappingsAt("freshness_score", numericField)
	docMapping.AddFieldMappingsAt("author_credibility", numericField)
	docMapping.AddFieldMappingsAt("relevance_score", numericField)

	// --- Boolean fields ---
	docMapping.AddFieldMappingsAt("is_https", boolField)
	docMapping.AddFieldMappingsAt("is_time_sensitive", boolField)
	docMapping.AddFieldMappingsAt("is_evergreen", boolField)

	// --- Date fields ---
	docMapping.AddFieldMappingsAt("crawled_at", dateField)
	docMapping.AddFieldMappingsAt("indexed_at", dateField)

	indexMapping.DefaultMapping = docMapping

	return indexMapping, nil
}

// Index adds or updates a document in the index.
func (bs *BleveStore) Index(doc *IndexDocument) error {
	doc.IndexedAt = time.Now()
	return bs.index.Index(doc.ID, doc)
}

// Search performs a BM25 search with boosted title matching.
func (bs *BleveStore) Search(query string, offset, limit int) ([]SearchHit, int, error) {
	// Query-time field boosting: title 3x, description 1.5x, content 1x
	titleQ := bleve.NewMatchQuery(query)
	titleQ.SetField("title")
	titleQ.SetBoost(3.0)

	descQ := bleve.NewMatchQuery(query)
	descQ.SetField("description")
	descQ.SetBoost(1.5)

	contentQ := bleve.NewMatchQuery(query)
	contentQ.SetField("content")
	contentQ.SetBoost(1.0)

	q := bleve.NewDisjunctionQuery(titleQ, descQ, contentQ)

	searchReq := bleve.NewSearchRequestOptions(q, limit, offset, false)
	searchReq.Fields = []string{"*"}
	searchReq.SortBy([]string{"_score"})

	result, err := bs.index.Search(searchReq)
	if err != nil {
		return nil, 0, fmt.Errorf("bleve search: %w", err)
	}

	var hits []SearchHit
	for _, match := range result.Hits {
		doc := fieldsToDoc(match.ID, match.Fields)
		hits = append(hits, SearchHit{
			ID:    match.ID,
			Score: match.Score,
			Doc:   doc,
		})
	}

	return hits, int(result.Total), nil
}

// SearchAdvanced performs a structured search using a ParsedQuery.
func (bs *BleveStore) SearchAdvanced(pq *models.ParsedQuery, offset, limit int) ([]SearchHit, int, error) {
	q := BuildQuery(pq)

	searchReq := bleve.NewSearchRequestOptions(q, limit, offset, false)
	searchReq.Fields = []string{"*"}
	searchReq.SortBy([]string{"_score"})

	result, err := bs.index.Search(searchReq)
	if err != nil {
		return nil, 0, fmt.Errorf("bleve advanced search: %w", err)
	}

	var hits []SearchHit
	for _, match := range result.Hits {
		doc := fieldsToDoc(match.ID, match.Fields)
		hits = append(hits, SearchHit{
			ID:    match.ID,
			Score: match.Score,
			Doc:   doc,
		})
	}

	return hits, int(result.Total), nil
}

// DocCount returns the number of indexed documents.
func (bs *BleveStore) DocCount() (uint64, error) {
	return bs.index.DocCount()
}

// Get retrieves a single document by ID.
func (bs *BleveStore) Get(id string) (*IndexDocument, error) {
	q := bleve.NewDocIDQuery([]string{id})
	req := bleve.NewSearchRequest(q)
	req.Fields = []string{"*"}
	req.Size = 1

	result, err := bs.index.Search(req)
	if err != nil {
		return nil, fmt.Errorf("bleve get: %w", err)
	}
	if len(result.Hits) == 0 {
		return nil, fmt.Errorf("document not found: %s", id)
	}

	return fieldsToDoc(result.Hits[0].ID, result.Hits[0].Fields), nil
}

// ListRecent returns documents sorted by indexed_at descending.
func (bs *BleveStore) ListRecent(offset, limit int) ([]IndexDocument, int, error) {
	q := bleve.NewMatchAllQuery()
	req := bleve.NewSearchRequestOptions(q, limit, offset, false)
	req.Fields = []string{"*"}
	req.SortBy([]string{"-indexed_at"})

	result, err := bs.index.Search(req)
	if err != nil {
		return nil, 0, fmt.Errorf("bleve list: %w", err)
	}

	docs := make([]IndexDocument, 0, len(result.Hits))
	for _, hit := range result.Hits {
		doc := fieldsToDoc(hit.ID, hit.Fields)
		docs = append(docs, *doc)
	}

	return docs, int(result.Total), nil
}

// Close closes the Bleve index.
func (bs *BleveStore) Close() error {
	log.Println("bleve: closing index")
	return bs.index.Close()
}

func fieldsToDoc(id string, fields map[string]interface{}) *IndexDocument {
	doc := &IndexDocument{ID: id}

	// String fields
	doc.URL = fieldString(fields, "url")
	doc.Domain = fieldString(fields, "domain")
	doc.Title = fieldString(fields, "title")
	doc.Description = fieldString(fields, "description")
	doc.Content = fieldString(fields, "content")
	doc.ContentHash = fieldString(fields, "content_hash")
	doc.Language = fieldString(fields, "language")
	doc.Categories = fieldString(fields, "categories")
	doc.Keywords = fieldString(fields, "keywords")
	doc.AnchorText = fieldString(fields, "anchor_text")

	// Integer fields (Bleve returns numerics as float64)
	doc.ContentSize = fieldInt(fields, "content_size")
	doc.WordCount = fieldInt(fields, "word_count")
	doc.StatusCode = fieldInt(fields, "status_code")
	doc.Depth = fieldInt(fields, "depth")

	// Float fields — scores
	doc.PageRankScore = fieldFloat(fields, "pagerank_score")
	doc.EEATScore = fieldFloat(fields, "eeat_score")
	doc.QualityScore = fieldFloat(fields, "quality_score")
	doc.SpamScore = fieldFloat(fields, "spam_score")
	doc.LinkScore = fieldFloat(fields, "link_score")
	doc.SEOScore = fieldFloat(fields, "seo_score")
	doc.ReadabilityScore = fieldFloat(fields, "readability_score")
	doc.CitationScore = fieldFloat(fields, "citation_score")
	doc.FreshnessScore = fieldFloat(fields, "freshness_score")
	doc.AuthorCredibility = fieldFloat(fields, "author_credibility")
	doc.RelevanceScore = fieldFloat(fields, "relevance_score")

	// Boolean fields
	doc.IsHTTPS = fieldBool(fields, "is_https")
	doc.IsTimeSensitive = fieldBool(fields, "is_time_sensitive")
	doc.IsEvergreen = fieldBool(fields, "is_evergreen")

	// Date fields
	doc.CrawledAt = fieldTime(fields, "crawled_at")
	doc.IndexedAt = fieldTime(fields, "indexed_at")

	return doc
}

// --- field extraction helpers ---

func fieldString(fields map[string]interface{}, key string) string {
	if v, ok := fields[key]; ok {
		return fmt.Sprint(v)
	}
	return ""
}

func fieldFloat(fields map[string]interface{}, key string) float64 {
	if v, ok := fields[key]; ok {
		if f, ok := v.(float64); ok {
			return f
		}
	}
	return 0
}

func fieldInt(fields map[string]interface{}, key string) int {
	if v, ok := fields[key]; ok {
		if f, ok := v.(float64); ok {
			return int(f)
		}
	}
	return 0
}

func fieldBool(fields map[string]interface{}, key string) bool {
	if v, ok := fields[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}

func fieldTime(fields map[string]interface{}, key string) time.Time {
	if v, ok := fields[key]; ok {
		if s, ok := v.(string); ok {
			t, _ := time.Parse(time.RFC3339, s)
			return t
		}
	}
	return time.Time{}
}
