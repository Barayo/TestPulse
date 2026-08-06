package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

type stubReadiness struct{ err error }

func (s stubReadiness) Ready(context.Context) error { return s.err }

func newTestServer(readyErr error) http.Handler {
	logger := slog.New(slog.DiscardHandler)
	return New(logger, stubReadiness{err: readyErr}, nil)
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
	// handleMeta reads the instance_settings row (enable-public-project-access),
	// so this needs a real service backed by the test database, unlike the
	// liveness/readiness tests above.
	svc := service.New(store.New(testutil.Pool(t, "server_meta")))
	h := New(slog.New(slog.DiscardHandler), stubReadiness{err: nil}, svc)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("GET /api/v1/meta = %d, want 200", rec.Code)
	}
}
