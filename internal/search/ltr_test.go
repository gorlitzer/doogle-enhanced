package search

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

func TestExtractFeatures(t *testing.T) {
	r := &models.SearchResult{
		Score:                1.5,
		EEATScore:            0.8,
		QualityScore:         0.7,
		PageRankScore:        0.6,
		DomainAuthorityScore: 0.5,
		URLQualityScore:      0.4,
		ReadabilityScore:     0.3,
		CitationScore:        0.2,
		LinkScore:            0.1,
		SEOScore:             0.9,
		AuthorCredibility:    0.85,
		RelevanceScore:       0.75,
		CrawledAt:            time.Now(),
		SpamScore:            0.05,
	}

	features := ExtractFeatures(r)
	if features[0] != 1.5 {
		t.Fatalf("expected bm25=1.5, got %.2f", features[0])
	}
	if features[1] != 0.8 {
		t.Fatalf("expected eeat=0.8, got %.2f", features[1])
	}
	if features[13] != 0.05 {
		t.Fatalf("expected spam=0.05, got %.2f", features[13])
	}
}

func TestLTRModel_TrainAndPredict(t *testing.T) {
	// Create synthetic click pairs
	pairs := make([]ClickPair, 300)
	for i := range pairs {
		var winner, loser [FeatureCount]float64
		// Winner has higher quality scores
		winner[0] = 1.0 + float64(i%10)*0.1  // bm25
		winner[2] = 0.8                        // quality
		winner[3] = 0.7                        // pagerank
		loser[0] = 0.5 + float64(i%10)*0.05
		loser[2] = 0.3
		loser[3] = 0.2
		pairs[i] = ClickPair{Winner: winner, Loser: loser}
	}

	cfg := TrainConfig{NumTrees: 50, LearningRate: 0.1}
	model := Train(pairs, cfg)

	if !model.Ready() {
		t.Fatal("expected model to be ready after training")
	}
	if model.TrainPairs != 300 {
		t.Fatalf("expected 300 train pairs, got %d", model.TrainPairs)
	}

	// Winner features should score higher than loser features
	var winFeatures, loseFeatures [FeatureCount]float64
	winFeatures[0] = 1.0
	winFeatures[2] = 0.8
	winFeatures[3] = 0.7
	loseFeatures[0] = 0.5
	loseFeatures[2] = 0.3
	loseFeatures[3] = 0.2

	winScore := model.Predict(winFeatures)
	loseScore := model.Predict(loseFeatures)
	if winScore <= loseScore {
		t.Fatalf("expected winner score (%.4f) > loser score (%.4f)", winScore, loseScore)
	}
}

func TestLTRModel_EmptyPairs(t *testing.T) {
	model := Train(nil, DefaultTrainConfig())
	if model.Ready() {
		t.Fatal("expected model NOT ready with no training data")
	}
}

func TestLTRModel_MarshalJSON(t *testing.T) {
	pairs := make([]ClickPair, 50)
	for i := range pairs {
		pairs[i].Winner[0] = 1.0
		pairs[i].Loser[0] = 0.5
	}
	model := Train(pairs, TrainConfig{NumTrees: 10, LearningRate: 0.1})

	data, err := json.Marshal(model)
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}

	var loaded LTRModel
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("UnmarshalJSON: %v", err)
	}

	if len(loaded.Trees) != len(model.Trees) {
		t.Fatalf("expected %d trees after roundtrip, got %d", len(model.Trees), len(loaded.Trees))
	}
	if loaded.LearningRate != model.LearningRate {
		t.Fatalf("learning rate mismatch after roundtrip")
	}

	// Predictions should match
	var features [FeatureCount]float64
	features[0] = 0.75
	orig := model.Predict(features)
	roundtrip := loaded.Predict(features)
	if orig != roundtrip {
		t.Fatalf("prediction mismatch after roundtrip: %.4f vs %.4f", orig, roundtrip)
	}
}

func TestDefaultTrainConfig(t *testing.T) {
	cfg := DefaultTrainConfig()
	if cfg.NumTrees != 100 {
		t.Fatalf("expected 100 trees, got %d", cfg.NumTrees)
	}
	if cfg.LearningRate != 0.1 {
		t.Fatalf("expected lr=0.1, got %.2f", cfg.LearningRate)
	}
}
