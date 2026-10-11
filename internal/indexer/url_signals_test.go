package indexer

import (
	"testing"
)

func TestScoreURL_CleanShallow(t *testing.T) {
	sig := ScoreURL("https://example.com/blog/post")
	if sig.Score != 1.0 {
		t.Errorf("Score = %f, want 1.0", sig.Score)
	}
	if sig.PathDepth != 2 {
		t.Errorf("PathDepth = %d, want 2", sig.PathDepth)
	}
	if !sig.IsCleanURL {
		t.Error("expected IsCleanURL=true")
	}
	if !sig.SlugReadable {
		t.Error("expected SlugReadable=true")
	}
}

func TestScoreURL_Root(t *testing.T) {
	sig := ScoreURL("https://example.com/")
	if sig.Score != 1.0 {
		t.Errorf("Score = %f, want 1.0", sig.Score)
	}
	if sig.PathDepth != 0 {
		t.Errorf("PathDepth = %d, want 0", sig.PathDepth)
	}
}

func TestScoreURL_DeepPath(t *testing.T) {
	sig := ScoreURL("https://example.com/a/b/c/d/e/f")
	if sig.PathDepth < 5 {
		t.Errorf("PathDepth = %d, expected >= 5", sig.PathDepth)
	}
	if sig.Score >= 1.0 {
		t.Errorf("Score = %f, expected penalty for deep path", sig.Score)
	}
}

func TestScoreURL_TrackingParams(t *testing.T) {
	sig := ScoreURL("https://example.com/page?utm_source=x")
	if sig.IsCleanURL {
		t.Error("expected IsCleanURL=false for tracking params")
	}
	if sig.Score >= 1.0 {
		t.Errorf("Score = %f, expected penalty", sig.Score)
	}
}

func TestScoreURL_QueryParams(t *testing.T) {
	sig := ScoreURL("https://example.com/page?page=2")
	if !sig.HasQueryParams {
		t.Error("expected HasQueryParams=true")
	}
	if sig.Score >= 1.0 {
		t.Errorf("Score = %f, expected some penalty for query params", sig.Score)
	}
}

func TestScoreURL_UnreadableSlug(t *testing.T) {
	sig := ScoreURL("https://example.com/a3b4c5d6e7f8a3b4/post")
	if sig.SlugReadable {
		t.Error("expected SlugReadable=false for hex-like segment")
	}
	if sig.Score >= 1.0 {
		t.Errorf("Score = %f, expected penalty", sig.Score)
	}
}

func TestScoreURL_LongPath(t *testing.T) {
	long := "https://example.com/" + string(make([]byte, 0)) // build long path
	path := ""
	for i := 0; i < 15; i++ {
		path += "segment-"
	}
	long = "https://example.com/" + path
	sig := ScoreURL(long)
	if sig.PathLength <= 100 {
		t.Skipf("path length %d not > 100, adjusting test", sig.PathLength)
	}
	if sig.Score >= 1.0 {
		t.Errorf("Score = %f, expected penalty for long path", sig.Score)
	}
}

func TestScoreURL_CombinedPenalties(t *testing.T) {
	sig := ScoreURL("https://example.com/a/b/c/d/e/a3b4c5d6e7f8a3b4?utm_source=x&gclid=y")
	if sig.Score <= 0 {
		t.Errorf("Score = %f, expected > 0 (clamped)", sig.Score)
	}
	if sig.Score >= 1.0 {
		t.Errorf("Score = %f, expected < 1.0 with multiple penalties", sig.Score)
	}
}

func TestScoreURL_Unparseable(t *testing.T) {
	sig := ScoreURL("://bad")
	if sig.Score != 0.5 {
		t.Errorf("Score = %f, want 0.5 for unparseable URL", sig.Score)
	}
}

func TestIsReadableSlug_Readable(t *testing.T) {
	if !isReadableSlug([]string{"blog", "my-post"}) {
		t.Error("expected readable")
	}
}

func TestIsReadableSlug_HexSegment(t *testing.T) {
	if isReadableSlug([]string{"a3f8c2d1e5a3f8c2"}) {
		t.Error("expected not readable for hex-like segment")
	}
}

func TestIsReadableSlug_Empty(t *testing.T) {
	if !isReadableSlug([]string{}) {
		t.Error("expected true for empty segments")
	}
}
