package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

type stubReadiness struct{ err error }

func (s stubReadiness) Ready(context.Context) error { return s.err }

func newTestServer(readyErr error) http.Handler {
	logger := slog.New(slog.DiscardHandler)
	return New(logger, stubReadiness{err: readyErr}, nil, 5, 5)
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

// /readyz is unauthenticated by design (a load balancer probes it before
// any session exists) — it must never leak the underlying error's raw
// text (internal hostnames, connection details, migration state) to that
// unauthenticated caller (backlog #115). The detail still belongs in the
// server-side log, just not the response body.
func TestReadinessDoesNotLeakUnderlyingErrorDetail(t *testing.T) {
	h := newTestServer(errors.New("dial tcp 10.0.4.17:5432: connect: connection refused"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if strings.Contains(rec.Body.String(), "10.0.4.17") {
		t.Errorf("response body leaked internal error detail: %s", rec.Body.String())
	}
}

// Every response — including the unauthenticated liveness probe, so the
// check has no route-specific escape hatch — must carry basic
// clickjacking/MIME-sniffing hardening (backlog #114). A full
// Content-Security-Policy is a separate, bigger follow-up (needs an audit
// of the embedded React bundle for inline scripts/styles first).
func TestSecurityHeadersPresentOnEveryResponse(t *testing.T) {
	h := newTestServer(nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if got := rec.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Errorf("X-Frame-Options = %q, want DENY", got)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("X-Content-Type-Options = %q, want nosniff", got)
	}
	if got := rec.Header().Get("Referrer-Policy"); got != "strict-origin-when-cross-origin" {
		t.Errorf("Referrer-Policy = %q, want strict-origin-when-cross-origin", got)
	}
}

// HSTS only makes sense (and is only honored by browsers) over an actually
// secure connection — sending it over what might be a genuine local/dev
// plain-HTTP connection would be misleading, so it's gated the same way
// the session cookie's Secure flag is (backlog #112's requestIsHTTPS).
func TestHSTSOnlySentOverHTTPS(t *testing.T) {
	h := newTestServer(nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	h.ServeHTTP(rec, req)
	if got := rec.Header().Get("Strict-Transport-Security"); got == "" {
		t.Error("expected Strict-Transport-Security when the request is HTTPS")
	}

	recPlain := httptest.NewRecorder()
	h.ServeHTTP(recPlain, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if got := recPlain.Header().Get("Strict-Transport-Security"); got != "" {
		t.Errorf("Strict-Transport-Security = %q, want empty over plain HTTP", got)
	}
}

func TestMetaEndpoint(t *testing.T) {
	// handleMeta reads the instance_settings row (enable-public-project-access),
	// so this needs a real service backed by the test database, unlike the
	// liveness/readiness tests above.
	svc := service.New(store.New(testutil.Pool(t, "server_meta")))
	h := New(slog.New(slog.DiscardHandler), stubReadiness{err: nil}, svc, 5, 5)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("GET /api/v1/meta = %d, want 200", rec.Code)
	}
}

// TestMetaSetupRequiredReflectsInstanceState covers add-first-run-setup's
// GET /api/v1/meta.setupRequired field: true on an empty instance, false
// once any user exists — regardless of how that user was created.
func TestMetaSetupRequiredReflectsInstanceState(t *testing.T) {
	pool := testutil.Pool(t, "server_meta")
	svc := service.New(store.New(pool))
	h := New(slog.New(slog.DiscardHandler), stubReadiness{err: nil}, svc, 5, 5)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil))
	var meta map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &meta); err != nil {
		t.Fatalf("decoding meta response: %v", err)
	}
	if meta["setupRequired"] != true {
		t.Errorf("setupRequired = %v on an empty instance, want true", meta["setupRequired"])
	}

	if err := svc.BootstrapAdmin(context.Background(), "admin@example.com", "correcthorse"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil))
	meta = nil
	if err := json.Unmarshal(rec.Body.Bytes(), &meta); err != nil {
		t.Fatalf("decoding meta response: %v", err)
	}
	if meta["setupRequired"] != false {
		t.Errorf("setupRequired = %v once a user exists, want false", meta["setupRequired"])
	}
}
