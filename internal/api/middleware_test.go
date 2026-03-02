package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBearerAuth_ValidHeader(t *testing.T) {
	token := "test-fleet-token-abc123"
	handler := BearerAuth(token)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))

	req := httptest.NewRequest("GET", "/api/fleet/nodes", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestBearerAuth_ValidQueryParam(t *testing.T) {
	token := "test-fleet-token-abc123"
	handler := BearerAuth(token)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/fleet/nodes?_token="+token, nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 with query param, got %d", w.Code)
	}
}

func TestBearerAuth_MissingToken(t *testing.T) {
	token := "test-fleet-token-abc123"
	handler := BearerAuth(token)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/api/fleet/nodes", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestBearerAuth_WrongToken(t *testing.T) {
	token := "correct-token"
	handler := BearerAuth(token)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/api/fleet/nodes", nil)
	req.Header.Set("Authorization", "Bearer wrong-token")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestBearerAuth_EmptyBearerPrefix(t *testing.T) {
	token := "my-token"
	handler := BearerAuth(token)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/api/fleet/nodes", nil)
	req.Header.Set("Authorization", "Basic abc123") // wrong scheme
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong auth scheme, got %d", w.Code)
	}
}

func TestBearerAuth_HeaderPrecedence(t *testing.T) {
	token := "correct-token"
	handler := BearerAuth(token)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Both header and query param, header takes precedence.
	req := httptest.NewRequest("GET", "/api/fleet/nodes?_token=wrong-token", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 when header is correct, got %d", w.Code)
	}
}
