package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDownloadGeoIPDBFrom_Success(t *testing.T) {
	content := "fake-mmdb-content-for-test"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(content))
	}))
	defer srv.Close()

	dest := filepath.Join(t.TempDir(), "sub", "GeoLite2-Country.mmdb")
	if err := downloadGeoIPDBFrom(srv.URL, dest); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("failed to read downloaded file: %v", err)
	}
	if string(data) != content {
		t.Fatalf("expected %q, got %q", content, string(data))
	}
}

func TestDownloadGeoIPDBFrom_CreatesMissingDir(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	dest := filepath.Join(t.TempDir(), "deep", "nested", "dir", "test.mmdb")
	if err := downloadGeoIPDBFrom(srv.URL, dest); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(dest); os.IsNotExist(err) {
		t.Fatal("expected file to exist after download")
	}
}

func TestDownloadGeoIPDBFrom_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	dest := filepath.Join(t.TempDir(), "test.mmdb")
	err := downloadGeoIPDBFrom(srv.URL, dest)
	if err == nil {
		t.Fatal("expected error for 404 response")
	}
	if err.Error() != "HTTP 404" {
		t.Fatalf("expected 'HTTP 404', got %q", err.Error())
	}
}

func TestDownloadGeoIPDBFrom_NetworkError(t *testing.T) {
	// Use an invalid URL to trigger a network error
	dest := filepath.Join(t.TempDir(), "test.mmdb")
	err := downloadGeoIPDBFrom("http://127.0.0.1:1", dest)
	if err == nil {
		t.Fatal("expected error for unreachable server")
	}
}

func TestDownloadGeoIPDBFrom_InvalidDestPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	// /dev/null/subdir can't be created
	err := downloadGeoIPDBFrom(srv.URL, "/dev/null/impossible/test.mmdb")
	if err == nil {
		t.Fatal("expected error for invalid dest path")
	}
}

func TestDownloadGeoIPDBFrom_EmptyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 200 OK but empty body
	}))
	defer srv.Close()

	dest := filepath.Join(t.TempDir(), "test.mmdb")
	if err := downloadGeoIPDBFrom(srv.URL, dest); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, err := os.Stat(dest)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() != 0 {
		t.Fatalf("expected empty file, got %d bytes", info.Size())
	}
}
