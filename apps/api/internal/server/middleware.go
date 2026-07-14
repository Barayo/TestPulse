package server

import (
	"net/http"
	"strings"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
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

// requireRole rejects the request with 403 unless the context's Actor
// (set by authenticate, which must run first) has exactly the given role.
func requireRole(role domain.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			actor, ok := domain.ActorFromContext(r.Context())
			if !ok || actor.Role != role {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
