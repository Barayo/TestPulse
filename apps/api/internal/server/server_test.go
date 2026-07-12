package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

type stubReadiness struct{ err error }

func (s stubReadiness) Ready(context.Context) error { return s.err }

func newTestServer(readyErr error) http.Handler {
	logger := slog.New(slog.DiscardHandler)
	return New(logger, stubReadiness{err: readyErr})
}

func TestLivenessAlwaysOK(t *testing.T) {
	// Liveness must succeed even when dependencies are down.
	h := newTestServer(errors.New("database unreachable"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("GET /healthz = %d, want 200", rec.Code)
	}
}

func TestReadinessOKWhenDependenciesHealthy(t *testing.T) {
	h := newTestServer(nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("GET /readyz = %d, want 200", rec.Code)
	}
}

func TestReadinessUnavailableWhenDependencyFails(t *testing.T) {
	h := newTestServer(errors.New("database unreachable"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("GET /readyz = %d, want 503", rec.Code)
	}
}

func TestMetaEndpoint(t *testing.T) {
	h := newTestServer(nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("GET /api/v1/meta = %d, want 200", rec.Code)
	}
}
