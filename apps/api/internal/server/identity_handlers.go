package server

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/time/rate"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/sampledata"
)

// mountAuth registers the unauthenticated auth routes — login is how a
// client obtains a session in the first place, so it cannot itself require
// one (design D6); logout is likewise open, and reads whatever session
// cookie is present (or none) rather than requiring a valid one. login
// alone is rate-limited (logout has nothing worth brute-forcing).
//
// perMinute/burst come from config.Config.LoginRateLimitPerMinute/Burst —
// production defaults to 5/5 (a real brute-force mitigation, backlog #113),
// but a same-process caller doing many legitimate logins in quick
// succession (the E2E suite, single worker) needs a higher ceiling; that's
// set via TESTPULSE_LOGIN_RATE_LIMIT_PER_MINUTE/_BURST in CI rather than
// weakening the production default.
func mountAuth(r chi.Router, h *api, perMinute float64, burst int) {
	loginLimiter := newLoginRateLimiter(rate.Limit(perMinute/60), burst)
	r.With(loginLimiter.middleware).Post("/auth/login", h.login)
	r.Post("/auth/logout", h.logout)

	// forgot-password is the same abuse surface as login — unauthenticated,
	// triggers real work (a token + an email send) — so it gets its own
	// limiter at the same shape rather than sharing login's bucket
	// (add-forgot-password design.md).
	forgotPasswordLimiter := newLoginRateLimiter(rate.Limit(perMinute/60), burst)
	r.With(forgotPasswordLimiter.middleware).Post("/auth/forgot-password", h.forgotPassword)
	r.Post("/auth/reset-password", h.resetPassword)

	// OIDC/SSO (add-sso-oidc) — h.oidcAuth is nil whenever OIDC isn't
	// configured, in which case both handlers 404.
	r.Get("/auth/oidc/login", h.oidcLogin)
	r.Get("/auth/oidc/callback", h.oidcCallback)
}

// mountIdentity registers the users/tokens/audit routes. The caller mounts
// it behind the authenticate middleware (server.go); requireTenantAdmin
// further restricts user management to Tenant Admins (authorization spec).
func mountIdentity(r chi.Router, h *api) {
	r.Route("/users", func(r chi.Router) {
		r.With(rejectScopedAgentTokens).Get("/", h.listUsers)
		r.Get("/me", h.currentUser)
		r.Patch("/me", h.updateCurrentUserProfile)
		r.Post("/me/password", h.changeOwnPassword)
		r.Post("/me/avatar", h.updateCurrentUserAvatar)
		r.Delete("/me/avatar", h.removeCurrentUserAvatar)
		r.Get("/{userId}/avatar", h.getUserAvatar)
		r.With(requireTenantAdmin).Post("/", h.createUser)
		r.With(requireTenantAdmin).Patch("/{userId}", h.updateUser)
		r.With(requireTenantAdmin).Delete("/{userId}", h.deleteUser)
		r.With(requireTenantAdmin).Get("/{userId}/deletion-preview", h.userDeletionPreview)
		r.With(requireTenantAdmin).Post("/{userId}/password-reset-email", h.adminSendPasswordResetEmail)
		r.With(requireTenantAdmin).Post("/{userId}/generate-temporary-password", h.adminGenerateTemporaryPassword)
	})
	r.Route("/tokens", func(r chi.Router) {
		r.Get("/", h.listTokens)
		r.Post("/", h.createToken)
		r.Delete("/{tokenId}", h.revokeToken)
	})
	r.With(h.requirePermission(domain.PermRead, projectIDFromAuditEntity)).Get("/audit", h.listAuditEntries)
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

type setupInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// setupFirstAdmin is unauthenticated, like login — it's how a still-empty
// instance gets its first session in the first place (add-first-run-setup).
// Unlike login, it's also self-closing: Service.SetupFirstAdmin rejects
// with a ConflictError (mapped to 409 by respond) once any user exists.
func (h *api) setupFirstAdmin(w http.ResponseWriter, r *http.Request) {
	in, err := decode[setupInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	sess, user, err := h.svc.SetupFirstAdmin(r.Context(), in.Email, in.Password)
	if err != nil {
		h.respond(w, http.StatusOK, nil, err)
		return
	}
	setSessionCookie(w, r, sess)
	h.seedSampleProjectIfEmpty(r.Context())
	h.respond(w, http.StatusOK, user, nil)
}

// seedSampleProjectIfEmpty mirrors main.go's boot-time seed step (there,
// gated on BootstrapAdmin instead) — an instance that reaches
// first-run-setup has zero users at boot, so that boot-time attempt has
// nobody to attribute the Sample Project to and never retries (it's a
// one-shot startup check). Calling this again once an admin actually
// exists closes that gap; HasAnyProject's own idempotency guard makes it
// safe to call unconditionally. Failure is logged, never fatal — the same
// as at boot.
func (h *api) seedSampleProjectIfEmpty(ctx context.Context) {
	has, err := h.svc.HasAnyProject(ctx)
	if err != nil {
		h.logger.Warn("checking for existing projects before seeding sample project", "error", err)
		return
	}
	if has {
		return
	}
	if err := sampledata.Seed(ctx, h.svc); err != nil {
		h.logger.Warn("seeding sample project", "error", err)
		return
	}
	h.logger.Info("sample project seeded")
}

type forgotPasswordInput struct {
	Email string `json:"email"`
}

// forgotPassword always responds 200 regardless of outcome — unknown
// email, deactivated account, or SMTP not configured all look identical to
// the caller (design.md's enumeration-resistance decision). A genuine
// unexpected error (e.g. the database) is logged server-side rather than
// surfaced, since the response can't reveal anything about it either.
func (h *api) forgotPassword(w http.ResponseWriter, r *http.Request) {
	in, err := decode[forgotPasswordInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	if err := h.svc.ForgotPassword(r.Context(), in.Email); err != nil {
		h.logger.Error("forgot-password request failed", "error", err)
	}
	w.WriteHeader(http.StatusOK)
}

type resetPasswordInput struct {
	Token       string `json:"token"`
	NewPassword string `json:"newPassword"`
}

func (h *api) resetPassword(w http.ResponseWriter, r *http.Request) {
	in, err := decode[resetPasswordInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	err = h.svc.ResetPassword(r.Context(), in.Token, in.NewPassword)
	h.respond(w, http.StatusNoContent, nil, err)
}

type changeOwnPasswordInput struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// changeOwnPassword is the self-service path (add-change-own-password) —
// mounted authenticated, unlike forgotPassword/resetPassword.
func (h *api) changeOwnPassword(w http.ResponseWriter, r *http.Request) {
	in, err := decode[changeOwnPasswordInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	actor, _ := domain.ActorFromContext(r.Context())
	err = h.svc.ChangeOwnPassword(r.Context(), actor, in.CurrentPassword, in.NewPassword)
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_ = h.svc.Logout(r.Context(), cookie.Value)
	}
	clearSessionCookie(w, r)
	w.WriteHeader(http.StatusNoContent)
}

// requestIsHTTPS reports whether the request reached the app over HTTPS —
// either terminated by this process itself (r.TLS), or by a reverse proxy
// in front of it that sets X-Forwarded-Proto (the real testpulse.fly.dev
// deployment: fly.toml sets force_https with a plain-HTTP internal_port,
// so r.TLS is always nil there and this header is the only signal
// available; Fly's edge proxy sets it, so this is trustworthy in that
// deployment. A self-hosted deployment behind a different proxy must set
// the same header for this to hold — see docs/deployment.md).
func requestIsHTTPS(r *http.Request) bool {
	return r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
}

// setSessionCookie marks the cookie Secure whenever the request arrived
// over HTTPS (backlog #112 — checking r.TLS alone silently dropped Secure
// in production, since Fly terminates TLS at its edge proxy) — so the
// cookie remains usable during local/dev plain-HTTP use, and is Secure
// wherever the deployment is actually served over HTTPS, terminated
// locally or by a proxy in front.
func setSessionCookie(w http.ResponseWriter, r *http.Request, sess domain.Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sess.ID,
		Path:     "/",
		HttpOnly: true,
		Secure:   requestIsHTTPS(r),
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
		Secure:   requestIsHTTPS(r),
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
	IsTenantAdmin         *bool   `json:"isTenantAdmin"`
	Deactivate            bool    `json:"deactivate"`
	Reactivate            bool    `json:"reactivate"`
	Email                 *string `json:"email"`
	RequirePasswordChange *bool   `json:"requirePasswordChange"`
}

func (h *api) updateUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	in, err := decode[userUpdate](r)
	if err != nil {
		badBody(h, w)
		return
	}
	actor, _ := domain.ActorFromContext(r.Context())
	if in.Email != nil {
		if _, err := h.svc.UpdateUserEmail(r.Context(), actor, userID, *in.Email); err != nil {
			h.respond(w, 0, nil, err)
			return
		}
	}
	if in.RequirePasswordChange != nil {
		if err := h.svc.SetRequirePasswordChange(r.Context(), actor, userID, *in.RequirePasswordChange); err != nil {
			h.respond(w, 0, nil, err)
			return
		}
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

func (h *api) deleteUser(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	userID := chi.URLParam(r, "userId")
	err := h.svc.DeleteUser(r.Context(), actor, userID)
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) userDeletionPreview(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	userID := chi.URLParam(r, "userId")
	preview, err := h.svc.UserDeletionPreview(r.Context(), actor, userID)
	h.respond(w, http.StatusOK, preview, err)
}

// adminSendPasswordResetEmail triggers the same reset-email flow
// forgotPassword uses, addressed at a known account rather than an email
// the caller supplied — Tenant-Admin-only (add-change-own-password).
func (h *api) adminSendPasswordResetEmail(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	userID := chi.URLParam(r, "userId")
	err := h.svc.SendPasswordResetEmail(r.Context(), actor, userID)
	h.respond(w, http.StatusNoContent, nil, err)
}

// adminGenerateTemporaryPassword is the SMTP-less fallback — the raw value
// is returned once and never retrievable again (add-change-own-password).
func (h *api) adminGenerateTemporaryPassword(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	userID := chi.URLParam(r, "userId")
	raw, err := h.svc.GenerateTemporaryPassword(r.Context(), actor, userID)
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}
	h.respond(w, http.StatusOK, map[string]string{"password": raw}, nil)
}

// --- API tokens ---

type tokenInput struct {
	Name string `json:"name"`
	// ProjectID/RoleID: both omitted creates an unscoped token (full
	// inheritance, unchanged default behavior); both must be set together
	// to scope the token to that project + role (backlog #117).
	ProjectID *string `json:"projectId"`
	RoleID    *string `json:"roleId"`
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
	full, tok, err := h.svc.CreateToken(r.Context(), actor, in.Name, in.ProjectID, in.RoleID)
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
