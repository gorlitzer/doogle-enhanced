package index

import (
	"strings"
	"testing"
)

func TestExpandWithTranslations(t *testing.T) {
	t.Run("known word", func(t *testing.T) {
		result := expandWithTranslations("house")
		if !strings.Contains(result, "haus") {
			t.Fatalf("expected German translation 'haus' in expanded text, got: %s", result)
		}
		if !strings.Contains(result, "maison") {
			t.Fatalf("expected French translation 'maison' in expanded text, got: %s", result)
		}
		if !strings.Contains(result, "casa") {
			t.Fatalf("expected Spanish translation 'casa' in expanded text, got: %s", result)
		}
	})

	t.Run("unknown word passthrough", func(t *testing.T) {
		result := expandWithTranslations("xylophone")
		if result != "xylophone" {
			t.Fatalf("expected unknown word unchanged, got: %s", result)
		}
	})

	t.Run("multi-word expansion", func(t *testing.T) {
		result := expandWithTranslations("free software")
		if !strings.Contains(result, "kostenlos") || !strings.Contains(result, "gratuit") {
			t.Fatalf("expected translations for 'free', got: %s", result)
		}
		if !strings.Contains(result, "logiciel") {
			t.Fatalf("expected French translation for 'software', got: %s", result)
		}
	})

	t.Run("reverse direction", func(t *testing.T) {
		// German → should inject English
		result := expandWithTranslations("haus")
		if !strings.Contains(result, "house") {
			t.Fatalf("expected English translation 'house' for German input, got: %s", result)
		}
	})
}

func TestMultilingualEmbedder_Embed(t *testing.T) {
	base := NewTFIDFEmbedder()
	base.AddDocument("house garden building")
	base.AddDocument("maison jardin")
	base.Finalize()

	ml := NewMultilingualEmbedder(base)

	// English query
	enVec, err := ml.Embed("house")
	if err != nil {
		t.Fatalf("Embed English: %v", err)
	}
	if len(enVec) == 0 {
		t.Fatal("expected non-empty embedding")
	}

	// German query for same concept
	deVec, err := ml.Embed("haus")
	if err != nil {
		t.Fatalf("Embed German: %v", err)
	}

	// Both should produce non-zero vectors
	enNonZero := false
	deNonZero := false
	for _, v := range enVec {
		if v != 0 {
			enNonZero = true
			break
		}
	}
	for _, v := range deVec {
		if v != 0 {
			deNonZero = true
			break
		}
	}
	if !enNonZero {
		t.Fatal("expected non-zero English embedding")
	}
	if !deNonZero {
		t.Fatal("expected non-zero German embedding")
	}

	// The vectors should share dimensions due to cross-lingual mapping
	// Both "house" and "haus" expand to include each other's translations
	sharedDims := 0
	for i := range enVec {
		if enVec[i] != 0 && deVec[i] != 0 {
			sharedDims++
		}
	}
	if sharedDims == 0 {
		t.Fatal("expected shared vector dimensions between 'house' and 'haus'")
	}
}

func TestMultilingualEmbedder_EmbedBatch(t *testing.T) {
	base := NewTFIDFEmbedder()
	base.AddDocument("search engine")
	base.Finalize()

	ml := NewMultilingualEmbedder(base)
	results, err := ml.EmbedBatch([]string{"search", "suche", "recherche"})
	if err != nil {
		t.Fatalf("EmbedBatch: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}
}

func TestCrossLingualMapCoverage(t *testing.T) {
	// Verify the map is populated
	if len(crossLingualMap) == 0 {
		t.Fatal("crossLingualMap is empty")
	}

	// Check some expected entries
	expected := []string{"search", "computer", "network", "house", "water"}
	for _, word := range expected {
		translations, ok := crossLingualMap[word]
		if !ok {
			t.Errorf("expected %q in crossLingualMap", word)
			continue
		}
		if len(translations) < 3 {
			t.Errorf("expected >= 3 translations for %q, got %d", word, len(translations))
		}
	}
}
