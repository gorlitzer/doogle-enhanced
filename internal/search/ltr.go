package search

import (
	"encoding/json"
	"math"
	"sync"
	"time"

	"github.com/doogle/doogle-v2/internal/models"
)

// FeatureCount is the number of ranking features extracted from each document.
const FeatureCount = 14

// FeatureNames maps feature indices to human-readable names.
var FeatureNames = [FeatureCount]string{
	"bm25", "eeat", "quality", "pagerank", "domain_authority",
	"url_quality", "readability", "citation", "link", "seo",
	"author_credibility", "relevance", "freshness", "spam",
}

// ExtractFeatures builds a feature vector from a search result.
func ExtractFeatures(r *models.SearchResult) [FeatureCount]float64 {
	return [FeatureCount]float64{
		r.Score,                                                                    // 0: bm25
		r.EEATScore,                                                                // 1: eeat
		r.QualityScore,                                                             // 2: quality
		r.PageRankScore,                                                            // 3: pagerank
		r.DomainAuthorityScore,                                                     // 4: domain_authority
		r.URLQualityScore,                                                          // 5: url_quality
		r.ReadabilityScore,                                                         // 6: readability
		r.CitationScore,                                                            // 7: citation
		r.LinkScore,                                                                // 8: link
		r.SEOScore,                                                                 // 9: seo
		r.AuthorCredibility,                                                        // 10: author_credibility
		r.RelevanceScore,                                                           // 11: relevance
		graduatedFreshnessScore(r.CrawledAt, r.IsTimeSensitive, r.IsEvergreen),     // 12: freshness
		r.SpamScore,                                                                // 13: spam (negative signal)
	}
}

// ClickPair is a pairwise training example: the user preferred doc A over doc B.
type ClickPair struct {
	Winner [FeatureCount]float64
	Loser  [FeatureCount]float64
}

// ----- Decision stump (weak learner) -----

type stump struct {
	Feature   int     `json:"f"` // feature index to split on
	Threshold float64 `json:"t"` // split threshold
	LeftVal   float64 `json:"l"` // prediction if feature <= threshold
	RightVal  float64 `json:"r"` // prediction if feature > threshold
}

func (s *stump) predict(features [FeatureCount]float64) float64 {
	if features[s.Feature] <= s.Threshold {
		return s.LeftVal
	}
	return s.RightVal
}

// ----- LTR Model (ensemble of stumps) -----

// LTRModel is a gradient-boosted ensemble of decision stumps for learn-to-rank.
type LTRModel struct {
	mu         sync.RWMutex
	Trees      []stump   `json:"trees"`
	LearningRate float64 `json:"lr"`
	TrainedAt  time.Time `json:"trained_at"`
	TrainPairs int       `json:"train_pairs"`
}

// MinClickPairs is the minimum number of click pairs required to train a model.
// Below this threshold, the hand-tuned ranker is used.
const MinClickPairs = 200

// Predict scores a document feature vector using the ensemble.
func (m *LTRModel) Predict(features [FeatureCount]float64) float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	score := 0.0
	for i := range m.Trees {
		score += m.LearningRate * m.Trees[i].predict(features)
	}
	return score
}

// Ready returns true if the model has been trained and is usable.
func (m *LTRModel) Ready() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.Trees) > 0
}

// MarshalJSON serializes the model for storage.
func (m *LTRModel) MarshalJSON() ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	type alias LTRModel
	return json.Marshal((*alias)(m))
}

// UnmarshalJSON deserializes a stored model.
func (m *LTRModel) UnmarshalJSON(data []byte) error {
	type alias LTRModel
	var a alias
	if err := json.Unmarshal(data, &a); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Trees = a.Trees
	m.LearningRate = a.LearningRate
	m.TrainedAt = a.TrainedAt
	m.TrainPairs = a.TrainPairs
	return nil
}

// ----- Training -----

// TrainConfig controls the gradient-boosted training process.
type TrainConfig struct {
	NumTrees     int     // number of boosting rounds (default: 100)
	LearningRate float64 // shrinkage factor (default: 0.1)
}

// DefaultTrainConfig returns sensible defaults for learn-to-rank.
func DefaultTrainConfig() TrainConfig {
	return TrainConfig{
		NumTrees:     100,
		LearningRate: 0.1,
	}
}

// Train builds an LTR model from pairwise click data using gradient boosting
// with a pairwise logistic loss (RankNet-style).
//
// For each pair (winner, loser), the loss is:
//
//	L = log(1 + exp(-(score_winner - score_loser)))
//
// The gradient w.r.t. each document score drives the stump fitting.
func Train(pairs []ClickPair, cfg TrainConfig) *LTRModel {
	if len(pairs) == 0 {
		return &LTRModel{}
	}
	if cfg.NumTrees == 0 {
		cfg.NumTrees = 100
	}
	if cfg.LearningRate == 0 {
		cfg.LearningRate = 0.1
	}

	n := len(pairs)
	// Current ensemble scores for each winner and loser
	winScores := make([]float64, n)
	loseScores := make([]float64, n)

	// Residuals (negative gradient of pairwise loss) for winners and losers
	winResiduals := make([]float64, n)
	loseResiduals := make([]float64, n)

	trees := make([]stump, 0, cfg.NumTrees)

	for round := 0; round < cfg.NumTrees; round++ {
		// Compute residuals from pairwise logistic loss
		for i := range pairs {
			diff := winScores[i] - loseScores[i]
			sigma := sigmoid(-diff) // probability of misranking
			// Gradient: push winner score up, loser score down
			winResiduals[i] = sigma
			loseResiduals[i] = -sigma
		}

		// Fit a stump to the combined residuals
		best := fitStump(pairs, winResiduals, loseResiduals)
		trees = append(trees, best)

		// Update ensemble scores
		for i := range pairs {
			winScores[i] += cfg.LearningRate * best.predict(pairs[i].Winner)
			loseScores[i] += cfg.LearningRate * best.predict(pairs[i].Loser)
		}
	}

	return &LTRModel{
		Trees:        trees,
		LearningRate: cfg.LearningRate,
		TrainedAt:    time.Now(),
		TrainPairs:   n,
	}
}

// fitStump finds the best single-feature split that minimizes residual variance.
func fitStump(pairs []ClickPair, winResiduals, loseResiduals []float64) stump {
	bestFeature := 0
	bestThreshold := 0.0
	bestScore := math.Inf(1)
	bestLeftVal := 0.0
	bestRightVal := 0.0

	n := len(pairs)

	for f := 0; f < FeatureCount; f++ {
		// Collect all feature values and corresponding residuals
		points := make([]valRes, 0, 2*n)
		for i := range pairs {
			points = append(points,
				valRes{pairs[i].Winner[f], winResiduals[i]},
				valRes{pairs[i].Loser[f], loseResiduals[i]},
			)
		}

		// Try a few candidate thresholds (quantiles) for speed
		thresholds := quantileThresholds(points, 20)

		for _, thresh := range thresholds {
			var leftSum, rightSum float64
			var leftCount, rightCount int

			for _, p := range points {
				if p.val <= thresh {
					leftSum += p.residual
					leftCount++
				} else {
					rightSum += p.residual
					rightCount++
				}
			}

			if leftCount == 0 || rightCount == 0 {
				continue
			}

			leftMean := leftSum / float64(leftCount)
			rightMean := rightSum / float64(rightCount)

			// Variance reduction score (lower is better)
			var score float64
			for _, p := range points {
				var pred float64
				if p.val <= thresh {
					pred = leftMean
				} else {
					pred = rightMean
				}
				diff := p.residual - pred
				score += diff * diff
			}

			if score < bestScore {
				bestScore = score
				bestFeature = f
				bestThreshold = thresh
				bestLeftVal = leftMean
				bestRightVal = rightMean
			}
		}
	}

	return stump{
		Feature:   bestFeature,
		Threshold: bestThreshold,
		LeftVal:   bestLeftVal,
		RightVal:  bestRightVal,
	}
}

// quantileThresholds returns up to k evenly-spaced thresholds from sorted values.
func quantileThresholds(points []valRes, k int) []float64 {
	if len(points) == 0 {
		return nil
	}
	// Deduplicate and sort values
	seen := make(map[float64]bool)
	var vals []float64
	for _, p := range points {
		if !seen[p.val] {
			seen[p.val] = true
			vals = append(vals, p.val)
		}
	}
	sortFloat64s(vals)

	if len(vals) <= k {
		return vals
	}

	step := float64(len(vals)-1) / float64(k-1)
	thresholds := make([]float64, 0, k)
	for i := 0; i < k; i++ {
		idx := int(math.Round(float64(i) * step))
		thresholds = append(thresholds, vals[idx])
	}
	return thresholds
}

type valRes struct {
	val      float64
	residual float64
}

func sortFloat64s(a []float64) {
	// Simple insertion sort for small slices, stdlib sort for larger
	if len(a) < 32 {
		for i := 1; i < len(a); i++ {
			for j := i; j > 0 && a[j] < a[j-1]; j-- {
				a[j], a[j-1] = a[j-1], a[j]
			}
		}
		return
	}
	// For larger slices, use a quicksort approach
	qsort(a, 0, len(a)-1)
}

func qsort(a []float64, lo, hi int) {
	if lo >= hi {
		return
	}
	pivot := a[(lo+hi)/2]
	i, j := lo, hi
	for i <= j {
		for a[i] < pivot {
			i++
		}
		for a[j] > pivot {
			j--
		}
		if i <= j {
			a[i], a[j] = a[j], a[i]
			i++
			j--
		}
	}
	qsort(a, lo, j)
	qsort(a, i, hi)
}

func sigmoid(x float64) float64 {
	return 1.0 / (1.0 + math.Exp(-x))
}
