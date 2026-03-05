package index

import (
	"fmt"
	"log"
	"time"

	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/analysis/analyzer/custom"
	"github.com/blevesearch/bleve/v2/analysis/lang/da"
	"github.com/blevesearch/bleve/v2/analysis/lang/de"
	"github.com/blevesearch/bleve/v2/analysis/lang/en"
	"github.com/blevesearch/bleve/v2/analysis/lang/es"
	"github.com/blevesearch/bleve/v2/analysis/lang/fi"
	"github.com/blevesearch/bleve/v2/analysis/lang/fr"
	"github.com/blevesearch/bleve/v2/analysis/lang/hu"
	"github.com/blevesearch/bleve/v2/analysis/lang/it"
	"github.com/blevesearch/bleve/v2/analysis/lang/nl"
	"github.com/blevesearch/bleve/v2/analysis/lang/no"
	"github.com/blevesearch/bleve/v2/analysis/lang/pt"
	"github.com/blevesearch/bleve/v2/analysis/lang/ro"
	"github.com/blevesearch/bleve/v2/analysis/lang/ru"
	"github.com/blevesearch/bleve/v2/analysis/lang/sv"
	"github.com/blevesearch/bleve/v2/analysis/lang/tr"
	"github.com/blevesearch/bleve/v2/analysis/token/lowercase"
	"github.com/blevesearch/bleve/v2/analysis/tokenizer/unicode"
	"github.com/blevesearch/bleve/v2/mapping"

	// Register analysis components
	_ "github.com/blevesearch/bleve/v2/analysis/token/stop"

	"github.com/doogle/doogle-v2/internal/models"
)

const analyzerName = "doogle_en"

// supportedLangs maps ISO 639-1 language codes to their Bleve analyzer names.
var supportedLangs = map[string]string{
	"de": de.AnalyzerName,
	"fr": fr.AnalyzerName,
	"es": es.AnalyzerName,
	"it": it.AnalyzerName,
	"pt": pt.AnalyzerName,
	"nl": nl.AnalyzerName,
	"ru": ru.AnalyzerName,
	"sv": sv.AnalyzerName,
	"da": da.AnalyzerName,
	"fi": fi.AnalyzerName,
	"hu": hu.AnalyzerName,
	"ro": ro.AnalyzerName,
	"tr": tr.AnalyzerName,
	"no": no.AnalyzerName,
}

// LangAnalyzer returns the Bleve analyzer name for a language code, or "" if unsupported.
func LangAnalyzer(lang string) string {
	return supportedLangs[lang]
}

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

// buildDocMapping creates a document mapping using the given analyzer for text fields.
func buildDocMapping(analyzer string) *mapping.DocumentMapping {
	docMapping := bleve.NewDocumentMapping()

	// Text fields with the specified analyzer
	textField := bleve.NewTextFieldMapping()
	textField.Analyzer = analyzer

	titleField := bleve.NewTextFieldMapping()
	titleField.Analyzer = analyzer

	descField := bleve.NewTextFieldMapping()
	descField.Analyzer = analyzer

	anchorField := bleve.NewTextFieldMapping()
	anchorField.Analyzer = analyzer

	// Keyword fields (not analyzed, stored as-is)
	keywordField := bleve.NewKeywordFieldMapping()

	// Numeric fields
	numericField := bleve.NewNumericFieldMapping()

	// Boolean fields
	boolField := bleve.NewBooleanFieldMapping()

	// Date fields
	dateField := bleve.NewDateTimeFieldMapping()

	// New searchable fields
	urlTextField := bleve.NewTextFieldMapping()
	urlTextField.Analyzer = analyzer

	headingsTextField := bleve.NewTextFieldMapping()
	headingsTextField.Analyzer = analyzer

	summaryField := bleve.NewTextFieldMapping()
	summaryField.Analyzer = analyzer

	// --- Primary text fields ---
	docMapping.AddFieldMappingsAt("title", titleField)
	docMapping.AddFieldMappingsAt("description", descField)
	docMapping.AddFieldMappingsAt("content", textField)
	docMapping.AddFieldMappingsAt("summary", summaryField)
	docMapping.AddFieldMappingsAt("keywords", textField)
	docMapping.AddFieldMappingsAt("categories", textField)
	docMapping.AddFieldMappingsAt("anchor_text", anchorField)
	docMapping.AddFieldMappingsAt("url_text", urlTextField)
	docMapping.AddFieldMappingsAt("headings_text", headingsTextField)

	// --- Keyword / identifier fields ---
	docMapping.AddFieldMappingsAt("url", keywordField)
	docMapping.AddFieldMappingsAt("domain", keywordField)
	docMapping.AddFieldMappingsAt("content_hash", keywordField)
	docMapping.AddFieldMappingsAt("language", keywordField)
	docMapping.AddFieldMappingsAt("origin_peer_id", keywordField)

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
	docMapping.AddFieldMappingsAt("static_score", numericField)
	docMapping.AddFieldMappingsAt("domain_authority_score", numericField)
	docMapping.AddFieldMappingsAt("url_quality_score", numericField)
	docMapping.AddFieldMappingsAt("generation", numericField)

	// --- Boolean fields ---
	docMapping.AddFieldMappingsAt("is_https", boolField)
	docMapping.AddFieldMappingsAt("is_time_sensitive", boolField)
	docMapping.AddFieldMappingsAt("is_evergreen", boolField)

	// --- Date fields ---
	docMapping.AddFieldMappingsAt("crawled_at", dateField)
	docMapping.AddFieldMappingsAt("indexed_at", dateField)

	return docMapping
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

	// Default document mapping (English) — language-specific analysis
	// is applied at query time via LangAnalyzer(), not via type mappings.
	indexMapping.DefaultMapping = buildDocMapping(analyzerName)

	return indexMapping, nil
}

// Index adds or updates a document in the index.
func (bs *BleveStore) Index(doc *IndexDocument) error {
	doc.IndexedAt = time.Now()
	return bs.index.Index(doc.ID, doc)
}

// IndexBatch writes multiple documents to the index in a single batch operation.
func (bs *BleveStore) IndexBatch(docs []*IndexDocument) error {
	batch := bs.index.NewBatch()
	now := time.Now()
	for _, doc := range docs {
		doc.IndexedAt = now
		batch.Index(doc.ID, doc)
	}
	return bs.index.Batch(batch)
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

// Delete removes a document from the index by ID.
func (bs *BleveStore) Delete(id string) error {
	return bs.index.Delete(id)
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

// ListAll iterates all documents in the index using cursor pagination.
// The callback receives each document; return false to stop iteration.
func (bs *BleveStore) ListAll(callback func(doc *IndexDocument) bool) error {
	pageSize := 100
	offset := 0

	for {
		q := bleve.NewMatchAllQuery()
		req := bleve.NewSearchRequestOptions(q, pageSize, offset, false)
		req.Fields = []string{"*"}
		req.SortBy([]string{"_id"})

		result, err := bs.index.Search(req)
		if err != nil {
			return fmt.Errorf("bleve list all: %w", err)
		}
		if len(result.Hits) == 0 {
			break
		}

		for _, hit := range result.Hits {
			doc := fieldsToDoc(hit.ID, hit.Fields)
			if !callback(doc) {
				return nil
			}
		}

		offset += len(result.Hits)
		if uint64(offset) >= result.Total {
			break
		}
	}
	return nil
}

// ListIDsByDomain returns all document IDs belonging to the given domain.
func (bs *BleveStore) ListIDsByDomain(domain string) ([]string, error) {
	q := bleve.NewTermQuery(domain)
	q.SetField("domain")

	var ids []string
	pageSize := 500
	offset := 0

	for {
		req := bleve.NewSearchRequestOptions(q, pageSize, offset, false)
		req.Fields = []string{} // we only need IDs
		req.SortBy([]string{"_id"})

		result, err := bs.index.Search(req)
		if err != nil {
			return nil, fmt.Errorf("bleve list IDs by domain: %w", err)
		}
		if len(result.Hits) == 0 {
			break
		}

		for _, hit := range result.Hits {
			ids = append(ids, hit.ID)
		}

		offset += len(result.Hits)
		if uint64(offset) >= result.Total {
			break
		}
	}
	return ids, nil
}

// ListDomains returns all distinct domains in the index using a term facet.
func (bs *BleveStore) ListDomains() ([]string, error) {
	q := bleve.NewMatchAllQuery()
	req := bleve.NewSearchRequestOptions(q, 0, 0, false)

	facet := bleve.NewFacetRequest("domain", 100000)
	req.AddFacet("domains", facet)

	result, err := bs.index.Search(req)
	if err != nil {
		return nil, fmt.Errorf("bleve list domains: %w", err)
	}

	domainFacet, ok := result.Facets["domains"]
	if !ok {
		return nil, nil
	}

	domains := make([]string, 0, len(domainFacet.Terms.Terms()))
	for _, term := range domainFacet.Terms.Terms() {
		domains = append(domains, term.Term)
	}
	return domains, nil
}

// ListRecentByPeer returns documents from a specific origin peer, sorted by indexed_at desc.
func (bs *BleveStore) ListRecentByPeer(peerID string, offset, limit int) ([]IndexDocument, int, error) {
	q := bleve.NewTermQuery(peerID)
	q.SetField("origin_peer_id")

	req := bleve.NewSearchRequestOptions(q, limit, offset, false)
	req.Fields = []string{"*"}
	req.SortBy([]string{"-indexed_at"})

	result, err := bs.index.Search(req)
	if err != nil {
		return nil, 0, fmt.Errorf("bleve list by peer: %w", err)
	}

	docs := make([]IndexDocument, 0, len(result.Hits))
	for _, hit := range result.Hits {
		doc := fieldsToDoc(hit.ID, hit.Fields)
		docs = append(docs, *doc)
	}

	return docs, int(result.Total), nil
}

// CountByPeer returns the number of local and remote documents.
// Documents with an empty origin_peer_id or matching selfPeerID are counted as local.
func (bs *BleveStore) CountByPeer(selfPeerID string) (local int, remote int, err error) {
	q := bleve.NewMatchAllQuery()
	req := bleve.NewSearchRequestOptions(q, 0, 0, false)

	facet := bleve.NewFacetRequest("origin_peer_id", 10000)
	req.AddFacet("origins", facet)

	result, err := bs.index.Search(req)
	if err != nil {
		return 0, 0, fmt.Errorf("bleve count by peer: %w", err)
	}

	total := int(result.Total)
	originFacet, ok := result.Facets["origins"]
	if !ok {
		// No facet data — treat everything as local
		return total, 0, nil
	}

	// Count docs that match selfPeerID
	for _, term := range originFacet.Terms.Terms() {
		if term.Term == selfPeerID {
			local += term.Count
		} else {
			remote += term.Count
		}
	}

	// "Other" (missing field / empty string) = pre-migration docs = local
	local += originFacet.Other + originFacet.Missing

	return local, remote, nil
}

// DocCountsByPeer returns a map of peer ID → document count for every origin peer.
// Documents with an empty or missing origin_peer_id are grouped under the "" key.
func (bs *BleveStore) DocCountsByPeer() (map[string]int, error) {
	q := bleve.NewMatchAllQuery()
	req := bleve.NewSearchRequestOptions(q, 0, 0, false)

	facet := bleve.NewFacetRequest("origin_peer_id", 10000)
	req.AddFacet("origins", facet)

	result, err := bs.index.Search(req)
	if err != nil {
		return nil, fmt.Errorf("bleve doc counts by peer: %w", err)
	}

	counts := make(map[string]int)
	originFacet, ok := result.Facets["origins"]
	if !ok {
		// No facet data — all docs are unattributed
		counts[""] = int(result.Total)
		return counts, nil
	}

	for _, term := range originFacet.Terms.Terms() {
		counts[term.Term] = term.Count
	}
	// Missing/empty origin
	if originFacet.Other+originFacet.Missing > 0 {
		counts[""] += originFacet.Other + originFacet.Missing
	}

	return counts, nil
}

// BleveIndex returns the underlying bleve.Index for direct access (e.g., spell checking).
func (bs *BleveStore) BleveIndex() bleve.Index {
	return bs.index
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
	doc.Summary = fieldString(fields, "summary")
	doc.AnchorText = fieldString(fields, "anchor_text")
	doc.URLText = fieldString(fields, "url_text")
	doc.HeadingsText = fieldString(fields, "headings_text")
	doc.OriginPeerID = fieldString(fields, "origin_peer_id")

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
	doc.StaticScore = fieldFloat(fields, "static_score")
	doc.DomainAuthorityScore = fieldFloat(fields, "domain_authority_score")
	doc.URLQualityScore = fieldFloat(fields, "url_quality_score")
	doc.Generation = uint64(fieldFloat(fields, "generation"))

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
