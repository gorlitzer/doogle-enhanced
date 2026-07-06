package search

import (
	"encoding/json"
	"log/slog"
	"sort"
	"time"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/store"
)

const ltrModelKey = "ltr:model:v2"

// LTRTrainer periodically trains a learn-to-rank model from click data.
type LTRTrainer struct {
	clickStore *store.ClickStore
	bleveStore index.Store
	badger     *store.BadgerStore
	interval   time.Duration
	embedder   *index.TFIDFEmbedder
}

// NewLTRTrainer creates a trainer that runs on the given interval.
func NewLTRTrainer(clicks *store.ClickStore, bleve index.Store, badger *store.BadgerStore, interval time.Duration) *LTRTrainer {
	return &LTRTrainer{
		clickStore: clicks,
		bleveStore: bleve,
		badger:     badger,
		interval:   interval,
	}
}

// SetEmbedder sets the TF-IDF embedder for query-document similarity features.
func (t *LTRTrainer) SetEmbedder(e *index.TFIDFEmbedder) {
	t.embedder = e
}

// LoadModel attempts to load a previously trained model from BadgerDB.
// Returns nil if no model exists.
func (t *LTRTrainer) LoadModel() *LTRModel {
	data, err := t.badger.Get([]byte(ltrModelKey))
	if err != nil || data == nil {
		return nil
	}
	var m LTRModel
	if err := json.Unmarshal(data, &m); err != nil {
		slog.Warn("ltr: failed to load model", "error", err)
		return nil
	}
	// Discard model if feature count has changed
	if m.FeatureCountV != 0 && m.FeatureCountV != FeatureCount {
		slog.Info("ltr: discarding saved model (feature count changed)", "saved", m.FeatureCountV, "current", FeatureCount)
		return nil
	}
	slog.Info("ltr: loaded model", "trees", len(m.Trees), "pairs", m.TrainPairs, "trained_at", m.TrainedAt.Format(time.RFC3339))
	return &m
}

// SaveModel persists the model to BadgerDB.
func (t *LTRTrainer) SaveModel(m *LTRModel) error {
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return t.badger.Set([]byte(ltrModelKey), data)
}

// TrainFromClicks builds click pairs from the click store and trains a model.
// Returns nil if insufficient training data.
func (t *LTRTrainer) TrainFromClicks() *LTRModel {
	allClicks := t.clickStore.AllClicks()

	pairs := t.buildClickPairs(allClicks)
	if len(pairs) < MinClickPairs {
		slog.Debug("ltr: insufficient click pairs", "have", len(pairs), "need", MinClickPairs)
		return nil
	}

	slog.Info("ltr: training model", "pairs", len(pairs))
	start := time.Now()
	model := Train(pairs, DefaultTrainConfig())
	slog.Info("ltr: training complete", "trees", len(model.Trees), "duration", time.Since(start).Round(time.Millisecond))

	return model
}

// buildClickPairs generates pairwise training examples from click data.
//
// For each query, URLs are sorted by click count. Each (higher-clicked, lower-clicked)
// pair becomes a training example. The feature vectors are obtained by searching
// the Bleve index for the query and matching URLs to results.
func (t *LTRTrainer) buildClickPairs(allClicks map[string][]store.ClickRecord) []ClickPair {
	var pairs []ClickPair

	for query, records := range allClicks {
		if len(records) < 2 {
			continue
		}

		// Sort by clicks descending
		sort.Slice(records, func(i, j int) bool {
			return records[i].Clicks > records[j].Clicks
		})

		// Get feature vectors by searching the index for this query
		featureMap := t.getFeatureVectors(query, records)
		if len(featureMap) < 2 {
			continue
		}

		// Generate pairwise examples: more-clicked beats less-clicked
		for i := 0; i < len(records); i++ {
			winFeatures, ok1 := featureMap[records[i].URL]
			if !ok1 {
				continue
			}
			for j := i + 1; j < len(records); j++ {
				if records[i].Clicks <= records[j].Clicks {
					continue // same click count, no preference signal
				}
				loseFeatures, ok2 := featureMap[records[j].URL]
				if !ok2 {
					continue
				}
				pairs = append(pairs, ClickPair{
					Winner: winFeatures,
					Loser:  loseFeatures,
				})
			}
		}
	}

	return pairs
}

// getFeatureVectors searches the index for a query and maps URLs to feature vectors.
func (t *LTRTrainer) getFeatureVectors(query string, records []store.ClickRecord) map[string][FeatureCount]float64 {
	// Search for the query to get current scoring signals
	pq := ParseQuery(query)
	if pq.CleanedQuery == "" && len(pq.Phrases) == 0 {
		return nil
	}

	hits, _, err := t.bleveStore.SearchAdvanced(pq, 0, 100)
	if err != nil || len(hits) == 0 {
		return nil
	}

	// Build URL → features map from search results.
	//
	// IMPORTANT: train and serve must use the SAME feature extractor. Inference
	// (ranker.computeLTRScore) only has the document-side signals, so it uses
	// ExtractFeatures (features 0–13). Previously training used
	// ExtractFeaturesWithQuery (28 features incl. query-interaction signals
	// 14–27), so the model learned to split on features that were always 0 at
	// serving time — a train/serve skew that degraded the served ranking. Train
	// on the same 14 features until the query context is threaded into inference
	// (tracked follow-up).
	urlFeatures := make(map[string][FeatureCount]float64, len(hits))
	for _, hit := range hits {
		r := models.SearchResult{
			URL:                  hit.Doc.URL,
			Score:                hit.Score,
			EEATScore:            hit.Doc.EEATScore,
			QualityScore:         hit.Doc.QualityScore,
			PageRankScore:        hit.Doc.PageRankScore,
			DomainAuthorityScore: hit.Doc.DomainAuthorityScore,
			URLQualityScore:      hit.Doc.URLQualityScore,
			ReadabilityScore:     hit.Doc.ReadabilityScore,
			CitationScore:        hit.Doc.CitationScore,
			LinkScore:            hit.Doc.LinkScore,
			SEOScore:             hit.Doc.SEOScore,
			AuthorCredibility:    hit.Doc.AuthorCredibility,
			RelevanceScore:       hit.Doc.RelevanceScore,
			SpamScore:            hit.Doc.SpamScore,
			CrawledAt:            hit.Doc.CrawledAt,
			IsTimeSensitive:      hit.Doc.IsTimeSensitive,
			IsEvergreen:          hit.Doc.IsEvergreen,
			PerfScore:            hit.Doc.PerfScore,
			MobileScore:          hit.Doc.MobileScore,
		}
		urlFeatures[hit.Doc.URL] = ExtractFeatures(&r)
	}

	return urlFeatures
}

// Run starts the periodic training loop. It blocks until ctx is done.
func (t *LTRTrainer) Run(done <-chan struct{}) {
	// Try loading a previously trained model on startup
	if m := t.LoadModel(); m != nil {
		ActiveLTRModel = m
	}

	ticker := time.NewTicker(t.interval)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			if model := t.TrainFromClicks(); model != nil {
				ActiveLTRModel = model
				if err := t.SaveModel(model); err != nil {
					slog.Warn("ltr: failed to save model", "error", err)
				} else {
					slog.Info("ltr: model saved", "trees", len(model.Trees), "pairs", model.TrainPairs)
				}
			}
		}
	}
}
