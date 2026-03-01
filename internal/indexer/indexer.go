package indexer

import (
	"log"
	"strings"
	"sync/atomic"
	"time"

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
	scorer      *Scorer
	dedup       *DuplicateDetector
	analyzer    *Analyzer
	readability *ReadabilityAnalyzer
	freshness   *FreshnessAnalyzer

	// Stats tracking
	totalIndexed      atomic.Int64
	spamRejected      atomic.Int64
	duplicatesSkipped atomic.Int64
	emptySkipped      atomic.Int64
	qualitySum        atomic.Int64 // scaled by 10000 for precision
	spamSum           atomic.Int64 // scaled by 10000 for precision
}

// New creates a new indexer with all analysis subsystems.
// If batch is nil, documents are written one at a time (backward compatible).
// If genStore is nil, generation tracking is disabled.
func New(store index.Store, batch *index.BatchIndexer, genStore *store.GenerationStore) *Indexer {
	return &Indexer{
		store:       store,
		batch:       batch,
		genStore:    genStore,
		scorer:      NewScorer(),
		dedup:       NewDuplicateDetector(),
		analyzer:    NewAnalyzer(),
		readability: NewReadabilityAnalyzer(),
		freshness:   NewFreshnessAnalyzer(),
	}
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

	// 5. Reject high-spam
	if scores.Spam > 0.7 {
		ix.spamRejected.Add(1)
		log.Printf("indexer: spam detected (%.2f) for %s, skipping", scores.Spam, doc.URL)
		return nil
	}

	// 6. Convert to index document
	idxDoc := ix.toIndexDocument(doc)

	// 7. Pre-compute static score: quality * spam factor
	qualitySignal := 0.0
	qualitySignal += scores.EEAT * 0.20
	qualitySignal += scores.Quality * 0.20
	qualitySignal += doc.PageRankScore * 0.20
	qualitySignal += doc.ReadabilityScore * 0.08
	qualitySignal += doc.CitationScore * 0.08
	qualitySignal += scores.Link * 0.05
	qualitySignal += scores.SEO * 0.08
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

	// 10. Track stats
	ix.totalIndexed.Add(1)
	ix.qualitySum.Add(int64(scores.Quality * 10000))
	ix.spamSum.Add(int64(scores.Spam * 10000))

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
}

func (ix *Indexer) toIndexDocument(doc *models.Document) *index.IndexDocument {
	return &index.IndexDocument{
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

		IsHTTPS:         doc.IsHTTPS,
		IsTimeSensitive: doc.IsTimeSensitive,
		IsEvergreen:     doc.IsEvergreen,
	}
}
