package indexer

import (
	"encoding/binary"
	"log"
	"net/url"
	"strings"
	"sync/atomic"
	"time"
	"unicode"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

// Indexer is the full document processing pipeline:
// analyze → score → deduplicate → enrich → index.
type Indexer struct {
	store       index.Store
	batch       *index.BatchIndexer
	genStore    *store.GenerationStore
	bs          *store.BadgerStore
	scorer      *Scorer
	dedup       *DuplicateDetector
	analyzer    *Analyzer
	readability *ReadabilityAnalyzer
	freshness   *FreshnessAnalyzer
	verifier    *ContentVerifier
	summarizer  *Summarizer

	// Intelligence subsystems (set via setters after construction)
	embedder    Embedder
	vectorStore VectorStore
	entityStore EntityStore

	// Stats tracking
	totalIndexed      atomic.Int64
	spamRejected      atomic.Int64
	duplicatesSkipped atomic.Int64
	emptySkipped      atomic.Int64
	qualitySum        atomic.Int64 // scaled by 10000 for precision
	spamSum           atomic.Int64 // scaled by 10000 for precision
}

// Embedder is the interface for computing document embeddings.
type Embedder interface {
	Embed(text string) ([]float32, error)
}

// VectorStore is the interface for storing document embeddings.
type VectorStore interface {
	Upsert(docID string, embedding []float32, metadata map[string]string) error
}

// EntityStore is the interface for storing entity information.
type EntityStore interface {
	AddDocumentEntities(docID string, entities []store.TypedEntity) error
}

const indexerTotalKey = "meta:indexer:total_indexed"

// New creates a new indexer with all analysis subsystems.
// If batch is nil, documents are written one at a time (backward compatible).
// If genStore is nil, generation tracking is disabled.
// If bs is nil, stats persistence is disabled.
func New(store index.Store, batch *index.BatchIndexer, genStore *store.GenerationStore, bs *store.BadgerStore) *Indexer {
	var dedup *DuplicateDetector
	if bs != nil {
		dedup = NewPersistentDuplicateDetector(bs)
	} else {
		dedup = NewDuplicateDetector()
	}

	ix := &Indexer{
		store:       store,
		batch:       batch,
		genStore:    genStore,
		bs:          bs,
		scorer:      NewScorer(),
		dedup:       dedup,
		analyzer:    NewAnalyzer(),
		readability: NewReadabilityAnalyzer(),
		freshness:   NewFreshnessAnalyzer(),
		summarizer:  NewSummarizer(),
	}
	ix.loadStats()
	return ix
}

func (ix *Indexer) loadStats() {
	if ix.bs == nil {
		return
	}
	val, err := ix.bs.Get([]byte(indexerTotalKey))
	if err != nil || len(val) < 8 {
		return
	}
	n := int64(binary.BigEndian.Uint64(val))
	ix.totalIndexed.Store(n)
	log.Printf("indexer: restored totalIndexed: %d", n)
}

func (ix *Indexer) persistTotalIndexed(val int64) {
	if ix.bs == nil {
		return
	}
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(val))
	_ = ix.bs.Set([]byte(indexerTotalKey), buf)
}

// SetContentVerifier enables Ed25519 content signing for indexed documents.
func (ix *Indexer) SetContentVerifier(cv *ContentVerifier) {
	ix.verifier = cv
}

// SetEmbedder sets the sentence embedding provider for semantic indexing.
func (ix *Indexer) SetEmbedder(e Embedder) {
	ix.embedder = e
}

// SetVectorStore sets the vector store for embedding persistence.
func (ix *Indexer) SetVectorStore(vs VectorStore) {
	ix.vectorStore = vs
}

// SetEntityStore sets the entity store for knowledge graph population.
func (ix *Indexer) SetEntityStore(es EntityStore) {
	ix.entityStore = es
}

// FlushStats unconditionally persists indexer stats to BadgerDB.
func (ix *Indexer) FlushStats() {
	ix.persistTotalIndexed(ix.totalIndexed.Load())
}

// Stats returns current indexer statistics.
func (ix *Indexer) Stats() *models.IndexerInfo {
	total := ix.totalIndexed.Load()
	var avgQuality, avgSpam float64
	if total > 0 {
		avgQuality = float64(ix.qualitySum.Load()) / float64(total) / 10000.0
		avgSpam = float64(ix.spamSum.Load()) / float64(total) / 10000.0
	}
	return &models.IndexerInfo{
		TotalIndexed:      total,
		AvgQuality:        avgQuality,
		AvgSpam:           avgSpam,
		SpamRejected:      ix.spamRejected.Load(),
		DuplicatesSkipped: ix.duplicatesSkipped.Load(),
		EmptySkipped:      ix.emptySkipped.Load(),
	}
}

// Index processes a crawled document through the full pipeline.
func (ix *Indexer) Index(doc *models.Document) error {
	// 1. Skip empty content
	if len(doc.Content) == 0 && len(doc.Title) == 0 {
		ix.emptySkipped.Add(1)
		log.Printf("indexer: skipping empty document %s", doc.URL)
		return nil
	}

	// 2. Duplicate detection via content fingerprinting
	if dup, existingID := ix.dedup.IsDuplicate(doc.ID, doc.Content); dup {
		ix.duplicatesSkipped.Add(1)
		log.Printf("indexer: duplicate of %s, skipping %s", existingID, doc.URL)
		return nil
	}

	// 3. Enrich document with NLP analysis
	ix.enrich(doc)

	// 4. Score the document
	scores := ix.scorer.Score(doc)
	doc.EEATScore = scores.EEAT
	doc.QualityScore = scores.Quality
	doc.SpamScore = scores.Spam
	doc.LinkScore = scores.Link
	doc.SEOScore = scores.SEO
	doc.RelevanceScore = scores.Relevance
	doc.URLQualityScore = scores.URLQuality

	// 5. Reject high-spam
	if scores.Spam > 0.7 {
		ix.spamRejected.Add(1)
		log.Printf("indexer: spam detected (%.2f) for %s, skipping", scores.Spam, doc.URL)
		return nil
	}

	// 5b. Content verification — sign content hash with Ed25519
	if ix.verifier != nil && doc.ContentSig == "" {
		ix.verifier.Sign(doc)
	}

	// 6. Convert to index document
	idxDoc := ix.toIndexDocument(doc)

	// 7. Pre-compute static score: quality * spam factor (updated weights)
	qualitySignal := 0.0
	qualitySignal += scores.EEAT * 0.15
	qualitySignal += scores.Quality * 0.10
	qualitySignal += doc.PageRankScore * 0.15
	qualitySignal += idxDoc.DomainAuthorityScore * 0.10
	qualitySignal += scores.URLQuality * 0.05
	qualitySignal += doc.ReadabilityScore * 0.08
	qualitySignal += doc.CitationScore * 0.08
	qualitySignal += scores.Link * 0.05
	qualitySignal += scores.SEO * 0.05
	qualitySignal += doc.AuthorCredibility * 0.05
	qualitySignal += scores.Relevance * 0.06
	idxDoc.StaticScore = (0.5 + qualitySignal*2.0) * (1.0 - doc.SpamScore*0.8)

	// 8. Set generation
	if ix.genStore != nil {
		idxDoc.Generation = ix.genStore.Current()
	}

	// 9. Write to index (batched or single)
	if ix.batch != nil {
		ix.batch.Add(idxDoc)
	} else {
		if err := ix.store.Index(idxDoc); err != nil {
			return err
		}
	}

	// 10. Compute and store embedding (async-safe, non-blocking)
	if ix.embedder != nil && ix.vectorStore != nil {
		embeddingText := doc.Title
		if doc.Description != "" {
			embeddingText += ". " + doc.Description
		} else if doc.Summary != "" {
			embeddingText += ". " + doc.Summary
		}
		if embeddingText != "" {
			if vec, err := ix.embedder.Embed(embeddingText); err == nil {
				meta := map[string]string{"url": doc.URL, "domain": doc.Domain, "title": doc.Title}
				_ = ix.vectorStore.Upsert(doc.ID, vec, meta)
			}
		}
	}

	// 11. Store entities in knowledge graph
	if ix.entityStore != nil {
		entities := ix.analyzer.ExtractEntitiesEnhanced(doc.Content, doc.Title)
		if len(entities) > 0 {
			_ = ix.entityStore.AddDocumentEntities(doc.ID, entities)
		}
	}

	// 12. Track stats
	total := ix.totalIndexed.Add(1)
	ix.qualitySum.Add(int64(scores.Quality * 10000))
	ix.spamSum.Add(int64(scores.Spam * 10000))
	if total%100 == 0 {
		ix.persistTotalIndexed(total)
	}

	log.Printf("indexer: indexed %s [eeat=%.2f quality=%.2f spam=%.2f seo=%.2f static=%.2f]",
		doc.URL, scores.EEAT, scores.Quality, scores.Spam, scores.SEO, idxDoc.StaticScore)
	return nil
}

// enrich performs NLP analysis and populates document metadata.
func (ix *Indexer) enrich(doc *models.Document) {
	// Word count
	doc.WordCount = ix.analyzer.WordCount(doc.Content)

	// Language detection
	doc.Language = ix.analyzer.DetectLanguage(doc.Content)

	// Content categories
	doc.Categories = ix.analyzer.ClassifyContent(doc.Content)

	// Keyword extraction (top 15)
	keywords := ix.analyzer.ExtractKeywords(doc.Content, 15)
	for _, kw := range keywords {
		doc.Keywords = append(doc.Keywords, kw.Word)
	}

	// HTTPS detection
	doc.IsHTTPS = strings.HasPrefix(doc.URL, "https://")

	// Readability analysis
	readMetrics := ix.readability.Analyze(doc.Content)
	doc.ReadabilityScore = readMetrics.ReadabilityScore
	doc.FleschReadingEase = readMetrics.FleschReadingEase
	doc.FleschKincaidGrade = readMetrics.FleschKincaidGrade

	// Citation analysis
	citMetrics := ix.readability.AnalyzeCitations(doc.Content)
	doc.CitationScore = citMetrics.CitationScore

	// Author credibility
	authMetrics := ix.readability.AnalyzeAuthorCredibility(doc.Content)
	doc.AuthorCredibility = authMetrics.CredibilityScore

	// Freshness analysis
	freshMetrics := ix.freshness.Analyze(doc.Title, doc.Content)
	doc.FreshnessScore = freshMetrics.FreshnessScore
	doc.IsTimeSensitive = freshMetrics.IsTimeSensitive
	doc.IsEvergreen = freshMetrics.IsEvergreen

	// Extractive summarization (for docs with >100 words)
	if doc.WordCount > 100 && ix.summarizer != nil {
		doc.Summary = ix.summarizer.SummarizeWithTitle(doc.Content, doc.Title, 3)
	}
}

func (ix *Indexer) toIndexDocument(doc *models.Document) *index.IndexDocument {
	idxDoc := &index.IndexDocument{
		ID:          doc.ID,
		URL:         doc.URL,
		Domain:      doc.Domain,
		Title:       doc.Title,
		Description: doc.Description,
		Content:     doc.Content,
		ContentHash: doc.ContentHash,
		ContentSize: doc.ContentSize,
		StatusCode:  doc.StatusCode,
		Depth:       doc.Depth,
		WordCount:   doc.WordCount,
		CrawledAt:   doc.CrawledAt,
		IndexedAt:   time.Now(),

		Language:   doc.Language,
		Categories: strings.Join(doc.Categories, ","),
		Keywords:   strings.Join(doc.Keywords, ","),

		PageRankScore:     doc.PageRankScore,
		EEATScore:         doc.EEATScore,
		QualityScore:      doc.QualityScore,
		SpamScore:         doc.SpamScore,
		LinkScore:         doc.LinkScore,
		SEOScore:          doc.SEOScore,
		ReadabilityScore:  doc.ReadabilityScore,
		CitationScore:     doc.CitationScore,
		FreshnessScore:    doc.FreshnessScore,
		AuthorCredibility: doc.AuthorCredibility,
		RelevanceScore:    doc.RelevanceScore,
		URLQualityScore:   doc.URLQualityScore,

		IsHTTPS:         doc.IsHTTPS,
		IsTimeSensitive: doc.IsTimeSensitive,
		IsEvergreen:     doc.IsEvergreen,

		OriginPeerID: doc.OriginPeerID,
	}

	// Summary
	idxDoc.Summary = doc.Summary

	// Populate URL text: extract readable words from URL path
	idxDoc.URLText = extractURLText(doc.URL)

	// Populate headings text: concatenate h1-h3 headings
	idxDoc.HeadingsText = extractHeadingsText(doc.Headings)

	// Image search: concatenate alt text + captions
	idxDoc.ImageText = extractImageText(doc.Images)
	idxDoc.ImageCount = len(doc.Images)

	// Structured data: schema type + flattened text
	idxDoc.SchemaType = doc.SchemaType
	idxDoc.StructuredText = flattenStructuredData(doc.StructuredData)

	return idxDoc
}

// extractURLText extracts readable words from a URL path for full-text search.
func extractURLText(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}

	path := strings.Trim(u.Path, "/")
	if path == "" {
		return ""
	}

	// Replace separators with spaces
	r := strings.NewReplacer("/", " ", "-", " ", "_", " ", ".", " ")
	words := r.Replace(path)

	// Filter out non-alphabetic tokens
	var parts []string
	for _, w := range strings.Fields(words) {
		cleaned := strings.TrimFunc(w, func(r rune) bool {
			return !unicode.IsLetter(r)
		})
		if len(cleaned) >= 2 {
			parts = append(parts, strings.ToLower(cleaned))
		}
	}

	return strings.Join(parts, " ")
}

// extractHeadingsText concatenates h1-h3 heading texts for indexing.
func extractHeadingsText(headings []models.Heading) string {
	var parts []string
	for _, h := range headings {
		if h.Level <= 3 && h.Text != "" {
			parts = append(parts, h.Text)
		}
	}
	return strings.Join(parts, " ")
}

// extractImageText concatenates alt text, titles, and captions from images
// to enable image search by text description.
func extractImageText(images []models.Image) string {
	var parts []string
	for _, img := range images {
		if img.Alt != "" {
			parts = append(parts, img.Alt)
		}
		if img.Title != "" {
			parts = append(parts, img.Title)
		}
		if img.Context != "" {
			parts = append(parts, img.Context)
		}
	}
	return strings.Join(parts, " ")
}

// flattenStructuredData converts structured data items into searchable text.
func flattenStructuredData(items []models.StructuredItem) string {
	var parts []string
	for _, item := range items {
		parts = append(parts, item.Type)
		for key, val := range item.Properties {
			if len(val) > 0 && len(val) <= 200 {
				parts = append(parts, key+": "+val)
			}
		}
	}
	result := strings.Join(parts, " ")
	if len(result) > 2000 {
		result = result[:2000]
	}
	return result
}
