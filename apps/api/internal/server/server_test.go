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

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

type stubReadiness struct{ err error }

func (s stubReadiness) Ready(context.Context) error { return s.err }

func newTestServer(readyErr error) http.Handler {
	logger := slog.New(slog.DiscardHandler)
	return New(logger, stubReadiness{err: readyErr}, nil, 5, 5, nil, true)
}

// /mcp is gated by the mcpEnabled param (add-mcp-server design.md:
// TESTPULSE_MCP_ENABLED, default true). An unauthenticated POST to a
// mounted /mcp is rejected by the same authenticate middleware REST uses
// (401 JSON body, never the SPA's index.html); when disabled, /mcp isn't a
// route at all and falls through to the embedded web handler's SPA
// fallback, same as any other unmounted path.
func TestMCPMountedWhenEnabled(t *testing.T) {
	svc := service.New(store.New(testutil.Pool(t, "server_mcp_enabled")))
	h := New(slog.New(slog.DiscardHandler), stubReadiness{err: nil}, svc, 5, 5, nil, true)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("POST /mcp with mcpEnabled=true, no auth = %d, want 401 (mounted behind authenticate)", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json (the SPA fallback would send text/html)", ct)
	}
}

func TestMCPNotMountedWhenDisabled(t *testing.T) {
	svc := service.New(store.New(testutil.Pool(t, "server_mcp_disabled")))
	h := New(slog.New(slog.DiscardHandler), stubReadiness{err: nil}, svc, 5, 5, nil, false)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if ct := rec.Header().Get("Content-Type"); ct == "application/json" {
		t.Errorf("Content-Type = %q with mcpEnabled=false, want the SPA fallback (not the MCP handler)", ct)
	}
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
	h := New(slog.New(slog.DiscardHandler), stubReadiness{err: nil}, svc, 5, 5, nil, true)
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
	h := New(slog.New(slog.DiscardHandler), stubReadiness{err: nil}, svc, 5, 5, nil, true)

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

// TestMetaColorThemeDefaultsToTealAndCarriesCustomPaletteWhenActive covers
// add-color-theme-customization's GET /api/v1/meta.colorTheme/customPalette
// fields — visible to every visitor, not only Tenant Admins, since a
// palette re-themes the app for everyone.
func TestMetaColorThemeDefaultsToTealAndCarriesCustomPaletteWhenActive(t *testing.T) {
	pool := testutil.Pool(t, "server_meta")
	svc := service.New(store.New(pool))
	h := New(slog.New(slog.DiscardHandler), stubReadiness{err: nil}, svc, 5, 5, nil, true)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil))
	var meta map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &meta); err != nil {
		t.Fatalf("decoding meta response: %v", err)
	}
	if meta["colorTheme"] != "teal" {
		t.Errorf("colorTheme = %v on a fresh instance, want \"teal\"", meta["colorTheme"])
	}
	if meta["customPalette"] != nil {
		t.Errorf("customPalette = %v on a fresh instance, want absent/null", meta["customPalette"])
	}

	side := domain.CustomPaletteMode{
		Background: "#F8F7FA", Foreground: "#160B2E", Card: "#FFFFFF",
		Primary: "#4514B8", PrimaryForeground: "#FFFFFF", Muted: "#EFEDF5",
		MutedForeground: "#605B6B", Accent: "#EFEDF5", Border: "#E0DCEC", Input: "#E0DCEC",
	}
	theme := "custom"
	if _, err := svc.UpdateInstanceSettings(context.Background(), domain.InstanceSettingsUpdate{
		ColorTheme:    &theme,
		CustomPalette: &domain.CustomPalette{Light: side, Dark: side},
	}); err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil))
	meta = nil
	if err := json.Unmarshal(rec.Body.Bytes(), &meta); err != nil {
		t.Fatalf("decoding meta response: %v", err)
	}
	if meta["colorTheme"] != "custom" {
		t.Errorf("colorTheme = %v, want \"custom\"", meta["colorTheme"])
	}
	customPalette, _ := meta["customPalette"].(map[string]any)
	light, _ := customPalette["light"].(map[string]any)
	if light["primary"] != "#4514B8" {
		t.Errorf("customPalette.light.primary = %v, want \"#4514B8\"", light["primary"])
	}

	// Switching back to a preset must stop surfacing customPalette in Meta
	// — it's still stored (re-opening the custom editor later pre-fills
	// from it), but Meta only needs it while colorTheme is actually
	// "custom"; leaving it in the payload otherwise is stale/misleading.
	tealTheme := "teal"
	if _, err := svc.UpdateInstanceSettings(context.Background(), domain.InstanceSettingsUpdate{ColorTheme: &tealTheme}); err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil))
	meta = nil
	if err := json.Unmarshal(rec.Body.Bytes(), &meta); err != nil {
		t.Fatalf("decoding meta response: %v", err)
	}
	if _, present := meta["customPalette"]; present {
		t.Errorf("customPalette = %v present after switching to teal, want absent", meta["customPalette"])
	}
}
