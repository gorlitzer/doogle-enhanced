package main

import "testing"

func TestTruncateCLI_Short(t *testing.T) {
	got := truncateCLI("hello", 10)
	if got != "hello" {
		t.Fatalf("expected 'hello', got %q", got)
	}
}

func TestTruncateCLI_Exact(t *testing.T) {
	got := truncateCLI("hello", 5)
	if got != "hello" {
		t.Fatalf("expected 'hello', got %q", got)
	}
}

func TestTruncateCLI_Truncated(t *testing.T) {
	got := truncateCLI("hello world this is long", 10)
	if got != "hello w..." {
		t.Fatalf("expected 'hello w...', got %q", got)
	}
	if len(got) != 10 {
		t.Fatalf("expected len=10, got %d", len(got))
	}
}

func TestTruncateCLI_VeryShort(t *testing.T) {
	got := truncateCLI("hello", 3)
	if got != "hel" {
		t.Fatalf("expected 'hel', got %q", got)
	}
}
