package server

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// sessionCookieName is the cookie carrying the opaque session id (design D2).
const sessionCookieName = "session"

// authenticate resolves the request's Actor from a Bearer token or a session
// cookie, in that order (design D6), and rejects the request with 401 if
// neither resolves to a valid, non-revoked, non-expired actor.
func authenticate(svc *service.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			actor, ok := resolveActor(r, svc)
			if !ok {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
			next.ServeHTTP(w, r.WithContext(domain.WithActor(r.Context(), actor)))
		})
	}
}

func resolveActor(r *http.Request, svc *service.Service) (domain.Actor, bool) {
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		actor, err := svc.AuthenticateToken(r.Context(), strings.TrimPrefix(auth, "Bearer "))
		return actor, err == nil
	}
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		actor, aerr := svc.AuthenticateSession(r.Context(), cookie.Value)
		return actor, aerr == nil
	}
	return domain.Actor{}, false
}

// requireTenantAdmin rejects the request with 403 unless the context's
// Actor (set by authenticate, which must run first) is a Tenant Admin.
// Replaces the old instance-wide requireRole(domain.RoleAdmin)
// (add-project-rbac).
func requireTenantAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, ok := domain.ActorFromContext(r.Context())
		if !ok || !actor.IsTenantAdmin {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// projectIDResolver maps a request to the project it concerns — sometimes
// directly from the URL (projectIDParam), sometimes via one extra store
// lookup from a case/suite/run/folder/item id (add-project-rbac design.md
// D5). It takes h so it can reach h.svc without a package-level global.
type projectIDResolver func(h *api, r *http.Request) (string, error)

func projectIDParam(_ *api, r *http.Request) (string, error) {
	id := chi.URLParam(r, "projectID")
	if id == "" {
		return "", store.ErrNotFound
	}
	return id, nil
}

func projectIDFromCase(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForCase(r.Context(), chi.URLParam(r, "caseID"))
}

func projectIDFromSuite(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForSuite(r.Context(), chi.URLParam(r, "suiteID"))
}

func projectIDFromRun(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForRun(r.Context(), chi.URLParam(r, "runID"))
}

func projectIDFromFolder(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForFolder(r.Context(), chi.URLParam(r, "folderID"))
}

func projectIDFromItem(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForItem(r.Context(), chi.URLParam(r, "itemID"))
}

// requirePermission rejects the request with 403 unless the context's
// Actor's effective permissions on the project resolve identifies include
// perm — a Tenant Admin always passes (design.md D3/D6/D10). Replaces the
// original requireProjectRole(min, resolve): once roles became fully
// custom, there was no fixed reference role left to rank against, so
// enforcement checks a named permission flag instead of an ordinal.
func (h *api) requirePermission(perm domain.Permission, resolve projectIDResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			actor, ok := domain.ActorFromContext(r.Context())
			if !ok {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
			if actor.IsTenantAdmin {
				next.ServeHTTP(w, r)
				return
			}
			projectID, err := resolve(h, r)
			if err != nil {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			perms, err := h.svc.EffectivePermissions(r.Context(), actor, projectID)
			if err != nil || !perms.Has(perm) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
