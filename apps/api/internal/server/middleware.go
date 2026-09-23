package server

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// sessionCookieName is the cookie carrying the opaque session id (design D2).
const sessionCookieName = "session"

// securityHeaders sets baseline clickjacking/MIME-sniffing hardening on
// every response — registered before routing so there's no route-specific
// escape hatch (backlog #114). Not a full Content-Security-Policy: that
// needs an audit of the embedded React bundle for inline scripts/styles
// first, tracked as a separate follow-up. HSTS is only sent when the
// request actually arrived over HTTPS (requestIsHTTPS, backlog #112's
// helper) — sending it over a genuine plain-HTTP connection (local/dev)
// would be misleading, and browsers ignore it there anyway per spec.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if requestIsHTTPS(r) {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// defaultMaxBodyBytes bounds every /api/v1 request body not already
// covered by a tighter, purpose-specific limit (attachment/avatar uploads
// use their own MaxUploadBytes+multipartOverhead). Generous enough for a
// large JUnit XML report plus several inline base64-encoded screenshots
// (execution-import), but finite -- unlike decode[T]'s prior unbounded
// json.Decoder read (#164), which let an unauthenticated client (login,
// forgot-password, reset-password, setup all share decode[T]) send
// several very large bodies per minute per IP indefinitely, even under the
// existing login rate limiter, threatening memory exhaustion on what's
// documented as a single-machine, single-process deployment.
const defaultMaxBodyBytes = 32 * 1024 * 1024

// unauthenticatedMaxBodyBytes is the tight ceiling for the specific
// pre-authentication routes (#164's named attack surface): login,
// forgot-password, reset-password, and first-run setup each only ever
// carry an email/password pair, so there's no legitimate reason for any
// of them to need anywhere near defaultMaxBodyBytes.
const unauthenticatedMaxBodyBytes = 64 * 1024

// maxBodyBytes returns middleware that rejects a request body larger than
// limit, matching the http.MaxBytesReader pattern already used for
// attachment/avatar uploads (attachment_handlers.go, user_avatar_handlers.go).
func maxBodyBytes(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}

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

// rejectScopedAgentTokens blocks a project-scoped agent token from a route
// that any ordinary human actor may otherwise reach unrestricted (#161:
// GET /api/v1/users, needed by the assignee-picker/project-members UI for
// every project member, not just Tenant Admins -- so the route can't be
// locked down to requireTenantAdmin without breaking that). A scoped
// token's entire purpose is confinement to its own project; browsing the
// tenant-wide user directory has no legitimate use for one and directly
// contradicts that confinement guarantee (middleware.go's requirePermission
// enforces the same invariant for project-scoped resources).
func rejectScopedAgentTokens(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, ok := domain.ActorFromContext(r.Context())
		if ok && actor.ScopedProjectID != nil {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireNoPendingPasswordChange rejects every authenticated route with 403
// for an actor whose underlying user has a pending required password
// change (add-change-own-password), except a small allowlist: reading own
// profile (so the frontend's gate has something to render) and changing
// own password (the only way to clear the flag). The frontend already
// knows to show the gate from the login response's own mustChangePassword
// field — this exists as defense-in-depth against a client bypassing that
// gate, not as the mechanism the UI depends on. An agent/token actor's
// MustChangePassword is always false (AuthenticateToken never sets it), so
// this never affects API-token traffic.
func requireNoPendingPasswordChange(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, ok := domain.ActorFromContext(r.Context())
		if ok && actor.MustChangePassword && !passwordChangeAllowlisted(r) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "password change required"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func passwordChangeAllowlisted(r *http.Request) bool {
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/api/v1/users/me":
		return true
	case r.Method == http.MethodPost && r.URL.Path == "/api/v1/users/me/password":
		return true
	default:
		return false
	}
}

// projectIDResolver maps a request to the project it concerns — sometimes
// directly from the URL (projectIDParam), sometimes via one extra store
// lookup from a case/suite/run/folder/item id (add-project-rbac design.md
// D5). It takes h so it can reach h.svc without a package-level global.
type projectIDResolver func(h *api, r *http.Request) (string, error)

func projectIDParam(_ *api, r *http.Request) (string, error) {
	id := resolvedID(r, "projectKey")
	if id == "" {
		return "", store.ErrNotFound
	}
	return id, nil
}

func projectIDFromCase(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForCase(r.Context(), resolvedID(r, "caseKey"))
}

func projectIDFromSuite(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForSuite(r.Context(), resolvedID(r, "suiteKey"))
}

func projectIDFromRun(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForRun(r.Context(), resolvedID(r, "runKey"))
}

func projectIDFromFolder(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForFolder(r.Context(), chi.URLParam(r, "folderID"))
}

func projectIDFromItem(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForItem(r.Context(), chi.URLParam(r, "itemID"))
}

func projectIDFromCustomField(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForCustomField(r.Context(), chi.URLParam(r, "fieldID"))
}

func projectIDFromWebhook(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForWebhook(r.Context(), chi.URLParam(r, "webhookID"))
}

func projectIDFromStepGroup(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForStepGroup(r.Context(), chi.URLParam(r, "groupID"))
}

func projectIDFromResult(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForResult(r.Context(), chi.URLParam(r, "resultID"))
}

func projectIDFromAttachment(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForAttachment(r.Context(), chi.URLParam(r, "attachmentID"))
}

func projectIDFromRelease(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForRelease(r.Context(), resolvedID(r, "releaseKey"))
}

func projectIDFromTestPlan(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForTestPlan(r.Context(), resolvedID(r, "planKey"))
}

func projectIDFromRequirement(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForRequirement(r.Context(), resolvedID(r, "requirementKey"))
}

func projectIDFromImportJob(h *api, r *http.Request) (string, error) {
	return h.svc.ProjectIDForImportJob(r.Context(), chi.URLParam(r, "jobId"))
}

// projectIDFromAuditEntity resolves GET /audit's project the same way the
// other projectIDFrom* resolvers do for their own routes, but from query
// params (entityType/entityId) rather than a path param, since audit
// entries can belong to any entity type (#160). Entity types with no
// owning project (user, team, api_token, instance_settings) return
// store.ErrNotFound -- requirePermission already lets a Tenant Admin
// through before this resolver ever runs, so that's the only actor who can
// view those entities' history, matching how tenant-level management is
// gated everywhere else in this file. The actual entity-type switch lives
// in Service.ProjectIDForAuditEntity (project-activity-feed) -- shared with
// audit()'s own write-time project_id resolution, not duplicated here.
func projectIDFromAuditEntity(h *api, r *http.Request) (string, error) {
	entityType := r.URL.Query().Get("entityType")
	entityID := r.URL.Query().Get("entityId")
	return h.svc.ProjectIDForAuditEntity(r.Context(), entityType, entityID)
}

// --- Human-readable key resolution (add-human-readable-keys D4) ---
//
// resolveKey returns middleware that resolves a key-shaped path param
// (projectKey/caseKey/runKey/suiteKey) to its internal id via lookup,
// once, at the API boundary — storing the result in the request context
// for resolvedID to read. Everything downstream (permission resolvers,
// service methods, store methods) keeps operating on the internal id
// exactly as it did before this design. An unrecognized key 404s
// immediately, the same as any other unresolved identifier.

type resolvedIDContextKey struct{ param string }

func resolvedID(r *http.Request, param string) string {
	if id, ok := r.Context().Value(resolvedIDContextKey{param}).(string); ok {
		return id
	}
	return chi.URLParam(r, param)
}

func (h *api) resolveKey(param string, lookup func(ctx context.Context, key string) (string, error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, err := lookup(r.Context(), chi.URLParam(r, param))
			if err != nil {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			ctx := context.WithValue(r.Context(), resolvedIDContextKey{param}, id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// requirePublicProject rejects the request with 404 unless resolve's project
// is reachable anonymously: both the instance-wide kill switch
// (InstanceSettings.PublicProjectsEnabled) and the project's own
// PublicAccess flag must be true (enable-public-project-access). Unlike
// requirePermission, no Actor is involved — this gates the unauthenticated
// route group, mounted outside authenticate. 404, not 403, in every failure
// case (disabled instance-wide, not public, or nonexistent project) so
// existence is never leaked, matching the same "no membership → no access"
// non-disclosure the authenticated RBAC model already uses.
func (h *api) requirePublicProject(resolve projectIDResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			projectID, err := resolve(h, r)
			if err != nil {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			ok, err := h.svc.IsProjectPubliclyAccessible(r.Context(), projectID)
			if err != nil || !ok {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// requirePermission rejects the request with 403 unless the context's
// Actor's effective permissions on the project resolve identifies include
// perm — a Tenant Admin always passes (design.md D3/D6/D10). Replaces the
// original requireProjectRole(min, resolve): once roles became fully
// custom, there was no fixed reference role left to rank against, so
// enforcement checks a named permission flag instead of an ordinal.
func (h *api) requirePermission(perm domain.Permission, resolve projectIDResolver) func(http.Handler) http.Handler {
	return h.requirePermissionOpt(perm, resolve, true)
}

// requirePermissionEvenIfArchived is requirePermission without the
// archived-project write gate (enforce-archived-project-readonly) —
// reserved for routes that must stay reachable ON an archived project: its
// own lifecycle endpoints (updateProject, to allow unarchiving it;
// deleteProject, which already requires archived == true as its own
// precondition), and two pure reads gated at a stricter-than-read bar for
// unrelated reasons (getImportJob, folderDeletePreview) that would
// otherwise be incorrectly rejected by the gate.
func (h *api) requirePermissionEvenIfArchived(perm domain.Permission, resolve projectIDResolver) func(http.Handler) http.Handler {
	return h.requirePermissionOpt(perm, resolve, false)
}

func (h *api) requirePermissionOpt(perm domain.Permission, resolve projectIDResolver, blockArchived bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			actor, ok := domain.ActorFromContext(r.Context())
			if !ok {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
			// The archived-project write gate is the only reason a Tenant
			// Admin now ever needs projectID resolved — every other case
			// keeps the original bypass (skip resolve entirely) unchanged,
			// so an admin hitting a read route, or one of the 4 routes
			// that opted out via requirePermissionEvenIfArchived, sees
			// zero behavior change (enforce-archived-project-readonly).
			archivedCheckApplies := blockArchived && perm != domain.PermRead
			if actor.IsTenantAdmin && !archivedCheckApplies {
				next.ServeHTTP(w, r)
				return
			}
			projectID, err := resolve(h, r)
			if err != nil {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
				return
			}
			if !actor.IsTenantAdmin {
				// A scoped agent token (backlog #117, design.md D3) is
				// authorized only within its own granted project — never
				// falls through to EffectivePermissions, which would
				// resolve the *creator's* broader access instead.
				if actor.ScopedProjectID != nil {
					if *actor.ScopedProjectID != projectID || !actor.ScopedPermissions.Has(perm) {
						writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
						return
					}
				} else {
					perms, err := h.svc.EffectivePermissions(r.Context(), actor, projectID)
					if err != nil || !perms.Has(perm) {
						writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
						return
					}
				}
			}
			// Runs unconditionally, even for a Tenant Admin — no bypass
			// (enforce-archived-project-readonly design.md Decision 7).
			if archivedCheckApplies {
				if err := h.svc.EnsureProjectWritable(r.Context(), projectID); err != nil {
					h.respond(w, 0, nil, err)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
