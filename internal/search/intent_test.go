package search

import (
	"testing"

	"github.com/doogle/doogle-v2/internal/models"
)

func TestIntentType_String(t *testing.T) {
	tests := []struct {
		it   IntentType
		want string
	}{
		{IntentInformational, "informational"},
		{IntentNavigational, "navigational"},
		{IntentTransactional, "transactional"},
		{IntentLocal, "local"},
		{IntentType(99), "informational"}, // unknown defaults to informational
	}
	for _, tt := range tests {
		if got := tt.it.String(); got != tt.want {
			t.Errorf("IntentType(%d).String() = %q, want %q", tt.it, got, tt.want)
		}
	}
}

func TestClassifyIntent_NavigationalBrand(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "github", Terms: []string{"github"}}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentNavigational {
		t.Errorf("got type %v, want Navigational", intent.Type)
	}
	if intent.Confidence < 0.8 {
		t.Errorf("confidence %f < 0.8", intent.Confidence)
	}
}

func TestClassifyIntent_NavigationalURL(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "github.com", Terms: []string{"github.com"}}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentNavigational {
		t.Errorf("got type %v, want Navigational", intent.Type)
	}
	if intent.Confidence < 0.9 {
		t.Errorf("confidence %f < 0.9", intent.Confidence)
	}
}

func TestClassifyIntent_NavigationalLogin(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "facebook login", Terms: []string{"facebook", "login"}}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentNavigational {
		t.Errorf("got type %v, want Navigational", intent.Type)
	}
}

func TestClassifyIntent_NavigationalSiteFilter(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "golang tutorial", Terms: []string{"golang", "tutorial"}, SiteDomain: "go.dev"}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentNavigational {
		t.Errorf("got type %v, want Navigational", intent.Type)
	}
	if intent.Confidence < 0.8 {
		t.Errorf("confidence %f < 0.8", intent.Confidence)
	}
}

func TestClassifyIntent_Informational(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "how to learn go", Terms: []string{"how", "to", "learn", "go"}}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentInformational {
		t.Errorf("got type %v, want Informational", intent.Type)
	}
	if intent.Confidence < 0.8 {
		t.Errorf("confidence %f < 0.8", intent.Confidence)
	}
}

func TestClassifyIntent_InformationalMultiWord(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "rust memory safety features", Terms: []string{"rust", "memory", "safety", "features"}}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentInformational {
		t.Errorf("got type %v, want Informational", intent.Type)
	}
	if intent.Confidence < 0.5 {
		t.Errorf("confidence %f < 0.5", intent.Confidence)
	}
}

func TestClassifyIntent_Transactional(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "buy laptop", Terms: []string{"buy", "laptop"}}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentTransactional {
		t.Errorf("got type %v, want Transactional", intent.Type)
	}
}

func TestClassifyIntent_TransactionalMultiple(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "buy cheap laptop discount", Terms: []string{"buy", "cheap", "laptop", "discount"}}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentTransactional {
		t.Errorf("got type %v, want Transactional", intent.Type)
	}
	// Multiple action words should yield higher confidence
	if intent.Confidence < 0.7 {
		t.Errorf("confidence %f < 0.7 for multiple transactional words", intent.Confidence)
	}
}

func TestClassifyIntent_Local(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "pizza near me", Terms: []string{"pizza", "near", "me"}}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentLocal {
		t.Errorf("got type %v, want Local", intent.Type)
	}
	if intent.Confidence < 0.8 {
		t.Errorf("confidence %f < 0.8", intent.Confidence)
	}
}

func TestClassifyIntent_DefaultShortQuery(t *testing.T) {
	pq := &models.ParsedQuery{Raw: "bicycle", Terms: []string{"bicycle"}}
	intent := ClassifyIntent(pq)
	if intent.Type != IntentInformational {
		t.Errorf("got type %v, want Informational (default)", intent.Type)
	}
	// Single non-brand word should have low confidence
	if intent.Confidence > 0.5 {
		t.Errorf("confidence %f > 0.5 for ambiguous single word", intent.Confidence)
	}
}
