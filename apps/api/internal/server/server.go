// Package server wires the HTTP router, middleware, and system endpoints.
package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/web"
)

// ReadinessChecker reports whether the service's dependencies are healthy.
type ReadinessChecker interface {
	Ready(ctx context.Context) error
}

func New(logger *slog.Logger, readiness ReadinessChecker, svc *service.Service) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(securityHeaders)

	r.Get("/healthz", handleLiveness)
	r.Get("/readyz", handleReadiness(logger, readiness))

	h := &api{logger: logger, svc: svc}

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/meta", handleMeta(svc))
		mountAuth(r, h)
		mountPublicAPI(r, h)

		r.Group(func(r chi.Router) {
			r.Use(authenticate(svc))
			mountAPI(r, h)
			mountIdentity(r, h)
			mountTeams(r, h)
			mountRoles(r, h)
			r.With(requireTenantAdmin).Patch("/instance-settings", h.updateInstanceSettings)
		})
	})

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
// Reveals nothing sensitive.
func handleMeta(svc *service.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		settings, err := svc.InstanceSettings(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"name":                  "TestPulse",
			"version":               "0.0.1",
			"publicProjectsEnabled": settings.PublicProjectsEnabled,
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
