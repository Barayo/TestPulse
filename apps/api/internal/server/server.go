// Package server wires the HTTP router, middleware, and system endpoints.
package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/Barayo/TestPulse/apps/api/internal/mcp"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/web"
)

// ReadinessChecker reports whether the service's dependencies are healthy.
type ReadinessChecker interface {
	Ready(ctx context.Context) error
}

// SSOConfig bundles what the server layer needs to (re)build an
// OIDCAuthenticator on demand (add-sso-oidc design.md D8) — a nil SSOConfig
// (or a zero-value one) means SSO starts unconfigured, same as passing nil
// for a manager alone used to mean.
type SSOConfig struct {
	Manager       *OIDCManager
	PublicURL     string
	EncryptionKey string
}

func New(logger *slog.Logger, readiness ReadinessChecker, svc *service.Service, loginRateLimitPerMinute float64, loginRateLimitBurst int, sso *SSOConfig, mcpEnabled bool) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(securityHeaders)

	r.Get("/healthz", handleLiveness)
	r.Get("/readyz", handleReadiness(logger, readiness))

	if sso == nil {
		sso = &SSOConfig{}
	}
	if sso.Manager == nil {
		sso.Manager = NewOIDCManager()
	}
	h := &api{logger: logger, svc: svc, oidcManager: sso.Manager, publicURL: sso.PublicURL, encryptionKey: sso.EncryptionKey}

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(maxBodyBytes(defaultMaxBodyBytes))

		r.Get("/meta", handleMeta(svc, sso.Manager, mcpEnabled))
		r.With(maxBodyBytes(unauthenticatedMaxBodyBytes)).Post("/setup", h.setupFirstAdmin)
		mountAuth(r, h, loginRateLimitPerMinute, loginRateLimitBurst)
		mountPublicAPI(r, h)

		r.Group(func(r chi.Router) {
			r.Use(authenticate(svc))
			r.Use(requireNoPendingPasswordChange)
			mountAPI(r, h)
			mountIdentity(r, h)
			mountTeams(r, h)
			mountRoles(r, h)
			mountCustomFields(r, h)
			mountWebhooks(r, h)
			mountStepGroups(r, h)
			mountOIDCTeamMappings(r, h)
			r.With(requireTenantAdmin).Get("/instance-settings", h.getInstanceSettings)
			r.With(requireTenantAdmin).Patch("/instance-settings", h.updateInstanceSettings)
		})
	})

	// /mcp sits outside /api/v1 (its own protocol, not a REST resource) but
	// inside the same authenticated group below — reusing `authenticate`
	// directly rather than a second auth implementation (add-mcp-server
	// design.md). TESTPULSE_MCP_ENABLED gates the mount itself: disabled
	// means /mcp isn't a route at all, not a 403 on every request.
	if mcpEnabled {
		r.Group(func(r chi.Router) {
			r.Use(authenticate(svc))
			r.Use(requireNoPendingPasswordChange)
			r.Mount("/mcp", mcp.NewHTTPHandler(svc))
		})
	}

	// Everything else is the embedded web UI (SPA fallback included).
	r.NotFound(web.Handler().ServeHTTP)

	return r
}

// handleLiveness reports process health only; it must stay independent of
// dependency state so Kubernetes does not restart pods on database outages.
func handleLiveness(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleReadiness(logger *slog.Logger, readiness ReadinessChecker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := readiness.Ready(r.Context()); err != nil {
			// The detail (DB host/connection error, migration state) stays
			// server-side only — /readyz is unauthenticated, probed by a
			// load balancer before any session exists (backlog #115).
			logger.Warn("readiness check failed", "error", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"status": "unavailable",
				"reason": "not ready",
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// handleMeta is unauthenticated and includes publicProjectsEnabled
// (enable-public-project-access) — the instance-wide kill switch, read by
// both the anonymous public frontend and the authenticated Project Settings
// page (to decide whether to gray out its own "Public access" toggle).
// Reveals nothing sensitive. mcpEnabled (mcp-admin-discoverability-card)
// mirrors the same param New() already gates the /mcp mount with, so the
// Instance Settings MCP card can show real enabled/disabled state instead
// of unconditionally claiming the server is available.
func handleMeta(svc *service.Service, oidcManager *OIDCManager, mcpEnabled bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		settings, err := svc.InstanceSettings(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		hasAnyUser, err := svc.HasAnyUser(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		passwordResetEnabled, err := svc.PasswordResetEnabled(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		ssoEnabled := oidcManager.Get() != nil
		body := map[string]any{
			"name":                  "TestPulse",
			"version":               "0.0.1",
			"publicProjectsEnabled": settings.PublicProjectsEnabled,
			"passwordResetEnabled":  passwordResetEnabled,
			"setupRequired":         !hasAnyUser,
			"colorTheme":            settings.ColorTheme,
			"ssoEnabled":            ssoEnabled,
			"ssoOnly":               ssoEnabled && settings.OIDCOnly,
			"jiraSiteUrl":           settings.JiraSiteURL,
			"defaultLandingView":    settings.DefaultLandingView,
			"mcpEnabled":            mcpEnabled,
		}
		if settings.ColorTheme == "custom" && settings.CustomPalette != nil {
			body["customPalette"] = settings.CustomPalette
		}
		writeJSON(w, http.StatusOK, body)
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
