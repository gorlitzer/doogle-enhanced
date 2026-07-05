package index

import "testing"

// TestTFIDFEmbedder_RealIDF is the regression test for the constant-IDF bug:
// a term appearing in every document must have a strictly lower IDF than a rare
// term, otherwise the "TF-IDF" vectors are effectively TF-only.
func TestTFIDFEmbedder_RealIDF(t *testing.T) {
	e := NewTFIDFEmbedder()
	// "common" appears in all 4 docs; "quantum" in just one.
	e.AddDocument("common apple banana")
	e.AddDocument("common cherry date")
	e.AddDocument("common elderberry fig")
	e.AddDocument("common grape quantum")
	e.Finalize()

	idfCommon := e.IDF("common")
	idfRare := e.IDF("quantum")

	if !(idfRare > idfCommon) {
		t.Fatalf("expected rare term IDF (%.4f) > common term IDF (%.4f)", idfRare, idfCommon)
	}
	if idfCommon <= 0 {
		t.Fatalf("expected positive IDF for common term, got %.4f", idfCommon)
	}
}
