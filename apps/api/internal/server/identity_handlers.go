package server

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// mountAuth registers the unauthenticated auth routes — login is how a
// client obtains a session in the first place, so it cannot itself require
// one (design D6); logout is likewise open, and reads whatever session
// cookie is present (or none) rather than requiring a valid one.
func mountAuth(r chi.Router, h *api) {
	r.Post("/auth/login", h.login)
	r.Post("/auth/logout", h.logout)
}

// mountIdentity registers the users/tokens/audit routes. The caller mounts
// it behind the authenticate middleware (server.go); requireTenantAdmin
// further restricts user management to Tenant Admins (authorization spec).
func mountIdentity(r chi.Router, h *api) {
	r.Route("/users", func(r chi.Router) {
		r.Get("/", h.listUsers)
		r.Get("/me", h.currentUser)
		r.Patch("/me", h.updateCurrentUserProfile)
		r.Post("/me/avatar", h.updateCurrentUserAvatar)
		r.Delete("/me/avatar", h.removeCurrentUserAvatar)
		r.Get("/{userId}/avatar", h.getUserAvatar)
		r.With(requireTenantAdmin).Post("/", h.createUser)
		r.With(requireTenantAdmin).Patch("/{userId}", h.updateUser)
	})
	r.Route("/tokens", func(r chi.Router) {
		r.Get("/", h.listTokens)
		r.Post("/", h.createToken)
		r.Delete("/{tokenId}", h.revokeToken)
	})
	r.Get("/audit", h.listAuditEntries)
}

type loginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *api) login(w http.ResponseWriter, r *http.Request) {
	in, err := decode[loginInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	sess, user, err := h.svc.Login(r.Context(), in.Email, in.Password)
	if err != nil {
		h.respond(w, http.StatusOK, nil, err)
		return
	}
	setSessionCookie(w, r, sess)
	h.respond(w, http.StatusOK, user, nil)
}

func (h *api) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_ = h.svc.Logout(r.Context(), cookie.Value)
	}
	clearSessionCookie(w, r)
	w.WriteHeader(http.StatusNoContent)
}

// setSessionCookie marks the cookie Secure only when the request itself
// arrived over TLS — so the cookie remains usable during local/dev HTTP
// use today and becomes Secure automatically once TLS termination ships
// (backlog: HTTPS/TLS support).
func setSessionCookie(w http.ResponseWriter, r *http.Request, sess domain.Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sess.ID,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		Expires:  sess.ExpiresAt,
	})
}

func clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
	})
}

// --- Users ---

type userInput struct {
	Email         string `json:"email"`
	Password      string `json:"password"`
	IsTenantAdmin bool   `json:"isTenantAdmin"`
}

func (h *api) listUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.svc.ListUsers(r.Context())
	h.respond(w, http.StatusOK, users, err)
}

// currentUser backs the web UI's session check on load: is there a valid
// session, and who does it belong to.
func (h *api) currentUser(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	if actor.Kind != domain.ActorKindUser {
		// The web UI only ever authenticates via session cookie (design D7);
		// a bearer-token actor hitting this route has no backing user row.
		h.respond(w, http.StatusOK, domain.User{ID: actor.ID, Email: actor.DisplayName, IsTenantAdmin: actor.IsTenantAdmin}, nil)
		return
	}
	user, err := h.svc.GetUser(r.Context(), actor.ID)
	h.respond(w, http.StatusOK, user, err)
}

type userProfileUpdate struct {
	DisplayName *string `json:"displayName"`
	AvatarKey   *string `json:"avatarKey"`
	Timezone    *string `json:"timezone"`
}

func (h *api) updateCurrentUserProfile(w http.ResponseWriter, r *http.Request) {
	in, err := decode[userProfileUpdate](r)
	if err != nil {
		badBody(h, w)
		return
	}
	actor, _ := domain.ActorFromContext(r.Context())
	user, err := h.svc.UpdateOwnProfile(r.Context(), actor, domain.UserProfileUpdate{
		DisplayName: in.DisplayName,
		AvatarKey:   in.AvatarKey,
		Timezone:    in.Timezone,
	})
	h.respond(w, http.StatusOK, user, err)
}

func (h *api) createUser(w http.ResponseWriter, r *http.Request) {
	in, err := decode[userInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	user, err := h.svc.CreateUser(r.Context(), in.Email, in.Password, in.IsTenantAdmin)
	h.respond(w, http.StatusCreated, user, err)
}

type userUpdate struct {
	IsTenantAdmin *bool `json:"isTenantAdmin"`
	Deactivate    bool  `json:"deactivate"`
	Reactivate    bool  `json:"reactivate"`
}

func (h *api) updateUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	in, err := decode[userUpdate](r)
	if err != nil {
		badBody(h, w)
		return
	}
	if in.IsTenantAdmin != nil {
		if err := h.svc.SetTenantAdmin(r.Context(), userID, *in.IsTenantAdmin); err != nil {
			h.respond(w, 0, nil, err)
			return
		}
	}
	if in.Deactivate {
		if err := h.svc.DeactivateUser(r.Context(), userID); err != nil {
			h.respond(w, 0, nil, err)
			return
		}
	}
	if in.Reactivate {
		if err := h.svc.ReactivateUser(r.Context(), userID); err != nil {
			h.respond(w, 0, nil, err)
			return
		}
	}
	h.respond(w, http.StatusNoContent, nil, nil)
}

// --- API tokens ---

type tokenInput struct {
	Name string `json:"name"`
}

func (h *api) listTokens(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		tokens, err := h.svc.ListOwnTokens(r.Context(), actor)
		h.respond(w, http.StatusOK, tokens, err)
		return
	}
	tokens, err := h.svc.ListTokensForUser(r.Context(), actor, userID)
	h.respond(w, http.StatusOK, tokens, err)
}

func (h *api) createToken(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	in, err := decode[tokenInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	full, tok, err := h.svc.CreateToken(r.Context(), actor, in.Name)
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}
	h.respond(w, http.StatusCreated, tokenCreatedResponse(tok, full), nil)
}

func tokenCreatedResponse(tok domain.ApiToken, full string) map[string]any {
	return map[string]any{
		"id":        tok.ID,
		"createdBy": tok.CreatedBy,
		"name":      tok.Name,
		"prefix":    tok.Prefix,
		"revokedAt": tok.RevokedAt,
		"createdAt": tok.CreatedAt,
		"token":     full,
	}
}

func (h *api) revokeToken(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	tokenID := chi.URLParam(r, "tokenId")
	err := h.svc.RevokeToken(r.Context(), actor, tokenID)
	h.respond(w, http.StatusNoContent, nil, err)
}

// --- Audit ---

func (h *api) listAuditEntries(w http.ResponseWriter, r *http.Request) {
	entityType := r.URL.Query().Get("entityType")
	entityID := r.URL.Query().Get("entityId")
	entries, err := h.svc.AuditHistory(r.Context(), entityType, entityID)
	h.respond(w, http.StatusOK, entries, err)
}
