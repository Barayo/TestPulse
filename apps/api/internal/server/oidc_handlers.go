package server

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// oidcStateCookieName carries the same value as the `state` query param,
// set at oidcLogin time and checked at oidcCallback time (design.md D2
// revision) — binds the callback to the specific browser that started the
// flow, closing an OAuth login-CSRF gap a validly-signed `state` alone
// doesn't: signing only proves *this server* issued it, not that the
// browser presenting the callback is the one that requested it.
const oidcStateCookieName = "oidc_state"

// OIDCAuthenticatorConfig carries everything needed to talk to an external
// OIDC provider — kept as plain fields rather than importing the config
// package, so this package stays decoupled from it.
type OIDCAuthenticatorConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	// PublicURL builds the exact redirect_uri registered with the IdP
	// (must be absolute and stable) — see design.md D1.
	PublicURL string
	// GroupClaim is the ID-token claim name whose values feed both the
	// Tenant Admin mapping and the Team mapping (design.md D5/D10).
	GroupClaim string
	// StateSigningKey signs/verifies the OIDC `state` param (design.md D2)
	// — TESTPULSE_ENCRYPTION_KEY, not the OAuth client secret, since the
	// client secret is now admin-editable at runtime (D1) and rotating it
	// would invalidate any in-flight login.
	StateSigningKey string
}

// OIDCAuthenticator wraps a discovered OIDC provider (add-sso-oidc) —
// (re)built whenever SSO settings are saved (design.md D8), never mutated
// in place; the current one is read through OIDCManager.
type OIDCAuthenticator struct {
	oauth2Config    oauth2.Config
	verifier        *oidc.IDTokenVerifier
	groupClaim      string
	stateSigningKey string
}

// NewOIDCAuthenticator discovers the provider at cfg.Issuer and builds the
// oauth2/OIDC client config. Returns an error if discovery fails — the
// caller decides whether that's a fatal startup error (never, since D8) or
// a rejected settings-save (PATCH /instance-settings, design.md D8).
func NewOIDCAuthenticator(ctx context.Context, cfg OIDCAuthenticatorConfig) (*OIDCAuthenticator, error) {
	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return nil, err
	}
	return &OIDCAuthenticator{
		oauth2Config: oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			Endpoint:     provider.Endpoint(),
			RedirectURL:  strings.TrimRight(cfg.PublicURL, "/") + "/api/v1/auth/oidc/callback",
			Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
		},
		verifier:        provider.Verifier(&oidc.Config{ClientID: cfg.ClientID}),
		groupClaim:      cfg.GroupClaim,
		stateSigningKey: cfg.StateSigningKey,
	}, nil
}

func randomNonce() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// oidcLogin starts the Authorization Code + PKCE flow: a fresh PKCE
// verifier and nonce are generated, then packed into a signed `state`
// (design.md D2) rather than stored server-side, so no cookie or DB row is
// needed to carry them to the callback.
func (h *api) oidcLogin(w http.ResponseWriter, r *http.Request) {
	auth := h.oidcManager.Get()
	if auth == nil {
		http.NotFound(w, r)
		return
	}
	verifier := oauth2.GenerateVerifier()
	nonce, err := randomNonce()
	if err != nil {
		h.logger.Error("generating oidc nonce", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	state, err := service.SignOIDCState(auth.stateSigningKey, verifier, nonce, time.Now().Add(service.OIDCStateTTL))
	if err != nil {
		h.logger.Error("signing oidc state", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Bound to this browser (design.md D2 revision) — HttpOnly so it's
	// invisible to script, SameSite=Lax so it still round-trips through the
	// IdP's top-level redirect back to us.
	http.SetCookie(w, &http.Cookie{
		Name:     oidcStateCookieName,
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		Secure:   requestIsHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(service.OIDCStateTTL.Seconds()),
	})
	authURL := auth.oauth2Config.AuthCodeURL(state,
		oauth2.S256ChallengeOption(verifier),
		oidc.Nonce(nonce),
	)
	http.Redirect(w, r, authURL, http.StatusFound)
}

// oidcCallback exchanges the authorization code for tokens, verifies the ID
// token (signature, issuer, audience via auth.verifier, nonce explicitly),
// resolves/JIT-provisions the account, and logs the user in exactly like a
// password login would.
func (h *api) oidcCallback(w http.ResponseWriter, r *http.Request) {
	auth := h.oidcManager.Get()
	if auth == nil {
		http.NotFound(w, r)
		return
	}
	state := r.URL.Query().Get("state")
	verifier, nonce, err := service.VerifyOIDCState(auth.stateSigningKey, state, time.Now())
	if err != nil {
		http.Error(w, "invalid or expired state", http.StatusUnauthorized)
		return
	}
	stateCookie, err := r.Cookie(oidcStateCookieName)
	if err != nil || !hmac.Equal([]byte(stateCookie.Value), []byte(state)) {
		http.Error(w, "missing or mismatched oidc state cookie", http.StatusUnauthorized)
		return
	}
	// Single-use: clear it now that it's been checked, whether or not the
	// rest of the callback succeeds. Attributes mirror the cookie's own
	// original Set-Cookie (line ~113-121) — a clearing Set-Cookie with
	// different Secure/HttpOnly/SameSite is itself flagged by CodeQL
	// (go/cookie-secure-not-set) as a cookie sent without Secure, and
	// matching attributes is also what makes the deletion reliable.
	http.SetCookie(w, &http.Cookie{
		Name:     oidcStateCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   requestIsHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})

	code := r.URL.Query().Get("code")
	token, err := auth.oauth2Config.Exchange(r.Context(), code, oauth2.VerifierOption(verifier))
	if err != nil {
		http.Error(w, "invalid authorization code", http.StatusUnauthorized)
		return
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		http.Error(w, "no id_token in token response", http.StatusUnauthorized)
		return
	}
	idToken, err := auth.verifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		http.Error(w, "invalid id token", http.StatusUnauthorized)
		return
	}
	if idToken.Nonce != nonce {
		http.Error(w, "nonce mismatch", http.StatusUnauthorized)
		return
	}

	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := idToken.Claims(&claims); err != nil {
		http.Error(w, "invalid id token claims", http.StatusUnauthorized)
		return
	}

	sess, _, err := h.svc.OIDCLogin(r.Context(), service.OIDCClaims{
		Subject:          idToken.Subject,
		Email:            claims.Email,
		EmailVerified:    claims.EmailVerified,
		GroupClaimValues: extractGroupClaimValues(idToken, auth.groupClaim),
	})
	if err != nil {
		h.respond(w, http.StatusUnauthorized, nil, err)
		return
	}
	setSessionCookie(w, r, sess)
	http.Redirect(w, r, "/", http.StatusFound)
}

// extractGroupClaimValues reads an arbitrary ID-token claim by name,
// normalizing either a single string value or a JSON array of strings
// (the common shape for a "groups"/"roles" claim) into a flat []string for
// Service.OIDCLogin to match against the configured admin/Team values.
func extractGroupClaimValues(idToken *oidc.IDToken, claimName string) []string {
	if claimName == "" {
		return nil
	}
	var raw map[string]any
	if err := idToken.Claims(&raw); err != nil {
		return nil
	}
	switch v := raw[claimName].(type) {
	case string:
		return []string{v}
	case []any:
		out := make([]string, 0, len(v))
		for _, e := range v {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}
