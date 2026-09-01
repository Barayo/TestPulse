package server_test

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/server"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// oidcTestStateSigningKey stands in for TESTPULSE_ENCRYPTION_KEY (design.md
// D2's revision — state is signed with the encryption key, not the OAuth
// client secret, since the client secret is now admin-editable at runtime).
const oidcTestStateSigningKey = "test-encryption-key"

// oidcServer builds a server with a real OIDCAuthenticator (discovered
// against a fake IdP) already Set on its OIDCManager — simulating "a
// Tenant Admin already saved working SSO settings" without going through
// the settings-save handler itself (that flow has its own tests).
func oidcServer(t *testing.T, idp *fakeIdP) (http.Handler, *service.Service) {
	t.Helper()
	pool := testutil.Pool(t, "server")
	svc := service.New(store.New(pool))
	manager := server.NewOIDCManager()
	auth, err := server.NewOIDCAuthenticator(context.Background(), server.OIDCAuthenticatorConfig{
		Issuer: idp.server.URL, ClientID: "test-client", ClientSecret: "test-client-secret",
		PublicURL: "https://testpulse.example.com", GroupClaim: "groups",
		StateSigningKey: oidcTestStateSigningKey,
	})
	if err != nil {
		t.Fatalf("NewOIDCAuthenticator: %v", err)
	}
	manager.Set(auth)
	return server.New(slog.New(slog.DiscardHandler), ok{}, svc, 5, 5, &server.SSOConfig{Manager: manager}, true), svc
}

// oidcStateCookie extracts the state-binding cookie (design.md D2 revision
// — bound to the browser that started the flow, closing an OAuth login-CSRF
// gap) from an oidcLogin response, for tests to carry forward onto the
// matching callback request the same way a real browser would.
func oidcStateCookie(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == "oidc_state" {
			return c
		}
	}
	t.Fatal("no oidc_state cookie set by oidcLogin")
	return nil
}

func TestScenario_PasswordLoginRejectedOverHTTPWhenSSOOnlyEnabled(t *testing.T) {
	idp := newFakeIdP(t)
	pool := testutil.Pool(t, "server")
	st := store.New(pool)
	svc := service.New(st)
	if err := svc.BootstrapAdmin(context.Background(), "sso-only-http@example.com", "correcthorsebatterystaple1"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	issuer, clientID := idp.server.URL, "test-client"
	oidcOnly := true
	if _, err := st.InstanceSettings.Update(context.Background(), domain.InstanceSettingsUpdate{
		OIDCIssuer: &issuer, OIDCClientID: &clientID, OIDCOnly: &oidcOnly,
	}); err != nil {
		t.Fatalf("arranging SSO-only: %v", err)
	}
	if err := st.InstanceSettings.SetOIDCClientSecret(context.Background(), []byte("encrypted")); err != nil {
		t.Fatalf("arranging SSO-only (secret): %v", err)
	}

	manager := server.NewOIDCManager()
	auth, err := server.NewOIDCAuthenticator(context.Background(), server.OIDCAuthenticatorConfig{
		Issuer: idp.server.URL, ClientID: "test-client", ClientSecret: "test-client-secret",
		PublicURL: "https://testpulse.example.com", StateSigningKey: oidcTestStateSigningKey,
	})
	if err != nil {
		t.Fatalf("NewOIDCAuthenticator: %v", err)
	}
	manager.Set(auth)
	h := server.New(slog.New(slog.DiscardHandler), ok{}, svc, 5, 5, &server.SSOConfig{Manager: manager}, true)

	var errBody struct{ Error string }
	call(t, h, "POST", "/api/v1/auth/login", jmap{
		"email": "sso-only-http@example.com", "password": "correcthorsebatterystaple1",
	}, 401, &errBody)
}

func TestScenario_OIDCNotConfiguredReturns404(t *testing.T) {
	pool := testutil.Pool(t, "server")
	svc := service.New(store.New(pool))
	h := server.New(slog.New(slog.DiscardHandler), ok{}, svc, 5, 5, nil, true)

	call(t, h, "GET", "/api/v1/auth/oidc/login", nil, 404, nil)
	call(t, h, "GET", "/api/v1/auth/oidc/callback", nil, 404, nil)

	var meta map[string]any
	call(t, h, "GET", "/api/v1/meta", nil, 200, &meta)
	if meta["ssoEnabled"] != false {
		t.Errorf("ssoEnabled = %v, want false", meta["ssoEnabled"])
	}
}

func TestScenario_OIDCMetaReportsEnabledAndOnly(t *testing.T) {
	idp := newFakeIdP(t)
	pool := testutil.Pool(t, "server")
	st := store.New(pool)
	svc := service.New(st)
	issuer, clientID := idp.server.URL, "test-client"
	oidcOnly := true
	if _, err := st.InstanceSettings.Update(context.Background(), domain.InstanceSettingsUpdate{
		OIDCIssuer: &issuer, OIDCClientID: &clientID, OIDCOnly: &oidcOnly,
	}); err != nil {
		t.Fatalf("arranging settings: %v", err)
	}
	if err := st.InstanceSettings.SetOIDCClientSecret(context.Background(), []byte("encrypted")); err != nil {
		t.Fatalf("arranging settings (secret): %v", err)
	}

	manager := server.NewOIDCManager()
	auth, err := server.NewOIDCAuthenticator(context.Background(), server.OIDCAuthenticatorConfig{
		Issuer: idp.server.URL, ClientID: "test-client", ClientSecret: "test-client-secret",
		PublicURL: "https://testpulse.example.com", StateSigningKey: oidcTestStateSigningKey,
	})
	if err != nil {
		t.Fatalf("NewOIDCAuthenticator: %v", err)
	}
	manager.Set(auth)
	h := server.New(slog.New(slog.DiscardHandler), ok{}, svc, 5, 5, &server.SSOConfig{Manager: manager}, true)

	var meta map[string]any
	call(t, h, "GET", "/api/v1/meta", nil, 200, &meta)
	if meta["ssoEnabled"] != true {
		t.Errorf("ssoEnabled = %v, want true", meta["ssoEnabled"])
	}
	if meta["ssoOnly"] != true {
		t.Errorf("ssoOnly = %v, want true", meta["ssoOnly"])
	}
}

func TestScenario_OIDCLoginRedirectsToAuthorizationEndpoint(t *testing.T) {
	idp := newFakeIdP(t)
	h, _ := oidcServer(t, idp)

	req := httptest.NewRequest("GET", "/api/v1/auth/oidc/login", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusFound)
	}
	loc, err := url.Parse(rec.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parsing Location: %v", err)
	}
	if got := loc.Scheme + "://" + loc.Host + loc.Path; got != idp.server.URL+"/authorize" {
		t.Errorf("redirect target = %q, want %s/authorize", got, idp.server.URL)
	}
	q := loc.Query()
	if q.Get("client_id") != "test-client" {
		t.Errorf("client_id = %q", q.Get("client_id"))
	}
	if q.Get("response_type") != "code" {
		t.Errorf("response_type = %q, want code", q.Get("response_type"))
	}
	if q.Get("code_challenge") == "" || q.Get("code_challenge_method") != "S256" {
		t.Errorf("missing/wrong PKCE challenge: %q / %q", q.Get("code_challenge"), q.Get("code_challenge_method"))
	}
	if q.Get("state") == "" {
		t.Error("missing state")
	}
	if q.Get("nonce") == "" {
		t.Error("missing nonce")
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "oidc_state" || cookies[0].Value == "" {
		t.Fatalf("cookies = %+v, want exactly one oidc_state cookie", cookies)
	}
	if !cookies[0].HttpOnly {
		t.Error("oidc_state cookie must be HttpOnly")
	}
}

func TestScenario_OIDCCallbackCompletesLoginAndSetsSessionCookie(t *testing.T) {
	idp := newFakeIdP(t)
	h, _ := oidcServer(t, idp)

	loginReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/login", nil)
	loginRec := httptest.NewRecorder()
	h.ServeHTTP(loginRec, loginReq)
	loc, _ := url.Parse(loginRec.Header().Get("Location"))
	state := loc.Query().Get("state")
	stateCookie := oidcStateCookie(t, loginRec)

	_, nonce, err := service.VerifyOIDCState(oidcTestStateSigningKey, state, time.Now())
	if err != nil {
		t.Fatalf("VerifyOIDCState: %v", err)
	}

	idp.withNextIDTokenClaims(map[string]any{
		"sub": "user-sub-1", "email": "sso-e2e@example.com", "email_verified": true, "nonce": nonce,
	})

	cbReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/callback?code=any-code&state="+url.QueryEscape(state), nil)
	cbReq.AddCookie(stateCookie)
	cbRec := httptest.NewRecorder()
	h.ServeHTTP(cbRec, cbReq)

	if cbRec.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d; body: %s", cbRec.Code, http.StatusFound, cbRec.Body.String())
	}
	if cbRec.Header().Get("Location") != "/" {
		t.Errorf("Location = %q, want /", cbRec.Header().Get("Location"))
	}
	var sawSession bool
	for _, c := range cbRec.Result().Cookies() {
		if c.Name == "session" {
			sawSession = true
		}
	}
	if !sawSession {
		t.Fatalf("cookies = %+v, want a session cookie among them", cbRec.Result().Cookies())
	}
}

func TestScenario_OIDCCallbackRejectsTamperedState(t *testing.T) {
	idp := newFakeIdP(t)
	h, _ := oidcServer(t, idp)

	req := httptest.NewRequest("GET", "/api/v1/auth/oidc/callback?code=any-code&state=tampered.garbage", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

// TestScenario_OIDCCallbackRejectsMissingStateCookie is the login-CSRF
// regression test: a validly-signed `state` alone must not be enough to
// complete login — it must also be presented by the same browser that
// started the flow (design.md D2 revision).
func TestScenario_OIDCCallbackRejectsMissingStateCookie(t *testing.T) {
	idp := newFakeIdP(t)
	h, _ := oidcServer(t, idp)

	loginReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/login", nil)
	loginRec := httptest.NewRecorder()
	h.ServeHTTP(loginRec, loginReq)
	loc, _ := url.Parse(loginRec.Header().Get("Location"))
	state := loc.Query().Get("state")
	_, nonce, _ := service.VerifyOIDCState(oidcTestStateSigningKey, state, time.Now())

	// A claims set that would otherwise complete login successfully — this
	// test proves the missing cookie alone is what blocks it, not some
	// other incidental mismatch.
	idp.withNextIDTokenClaims(map[string]any{
		"sub": "csrf-victim-sub", "email": "csrf-missing-cookie@example.com", "email_verified": true, "nonce": nonce,
	})

	// No cookie attached — simulates an attacker replaying a validly-signed
	// state (e.g. from their own login attempt) against a victim's browser.
	cbReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/callback?code=any-code&state="+url.QueryEscape(state), nil)
	cbRec := httptest.NewRecorder()
	h.ServeHTTP(cbRec, cbReq)

	if cbRec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", cbRec.Code, http.StatusUnauthorized)
	}
}

func TestScenario_OIDCCallbackRejectsMismatchedStateCookie(t *testing.T) {
	idp := newFakeIdP(t)
	h, _ := oidcServer(t, idp)

	loginReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/login", nil)
	loginRec := httptest.NewRecorder()
	h.ServeHTTP(loginRec, loginReq)
	loc, _ := url.Parse(loginRec.Header().Get("Location"))
	state := loc.Query().Get("state")
	_, nonce, _ := service.VerifyOIDCState(oidcTestStateSigningKey, state, time.Now())

	idp.withNextIDTokenClaims(map[string]any{
		"sub": "csrf-victim-sub-2", "email": "csrf-mismatched-cookie@example.com", "email_verified": true, "nonce": nonce,
	})

	cbReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/callback?code=any-code&state="+url.QueryEscape(state), nil)
	cbReq.AddCookie(&http.Cookie{Name: "oidc_state", Value: "not-the-real-state-value"})
	cbRec := httptest.NewRecorder()
	h.ServeHTTP(cbRec, cbReq)

	if cbRec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", cbRec.Code, http.StatusUnauthorized)
	}
}

func TestScenario_OIDCCallbackRejectsWrongAudienceIDToken(t *testing.T) {
	idp := newFakeIdP(t)
	h, _ := oidcServer(t, idp)

	loginReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/login", nil)
	loginRec := httptest.NewRecorder()
	h.ServeHTTP(loginRec, loginReq)
	loc, _ := url.Parse(loginRec.Header().Get("Location"))
	state := loc.Query().Get("state")
	stateCookie := oidcStateCookie(t, loginRec)
	_, nonce, _ := service.VerifyOIDCState(oidcTestStateSigningKey, state, time.Now())

	// Wrong audience: a real IdP would never issue this for our client.
	idp.withNextIDTokenClaims(map[string]any{
		"sub": "user-sub-2", "email": "wrong-aud@example.com", "email_verified": true, "nonce": nonce,
		"aud": "someone-elses-client",
	})

	cbReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/callback?code=any-code&state="+url.QueryEscape(state), nil)
	cbReq.AddCookie(stateCookie)
	cbRec := httptest.NewRecorder()
	h.ServeHTTP(cbRec, cbReq)

	if cbRec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", cbRec.Code, http.StatusUnauthorized)
	}
}

func TestScenario_OIDCCallbackAppliesAdminClaimMapping(t *testing.T) {
	idp := newFakeIdP(t)
	pool := testutil.Pool(t, "server")
	st := store.New(pool)
	svc := service.New(st)
	adminValues := []string{"admins"}
	if _, err := st.InstanceSettings.Update(context.Background(), domain.InstanceSettingsUpdate{OIDCAdminClaimValues: &adminValues}); err != nil {
		t.Fatalf("arranging admin claim values: %v", err)
	}

	manager := server.NewOIDCManager()
	auth, err := server.NewOIDCAuthenticator(context.Background(), server.OIDCAuthenticatorConfig{
		Issuer: idp.server.URL, ClientID: "test-client", ClientSecret: "test-client-secret",
		PublicURL: "https://testpulse.example.com", GroupClaim: "groups",
		StateSigningKey: oidcTestStateSigningKey,
	})
	if err != nil {
		t.Fatalf("NewOIDCAuthenticator: %v", err)
	}
	manager.Set(auth)
	h := server.New(slog.New(slog.DiscardHandler), ok{}, svc, 5, 5, &server.SSOConfig{Manager: manager}, true)

	loginReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/login", nil)
	loginRec := httptest.NewRecorder()
	h.ServeHTTP(loginRec, loginReq)
	loc, _ := url.Parse(loginRec.Header().Get("Location"))
	state := loc.Query().Get("state")
	stateCookie := oidcStateCookie(t, loginRec)
	_, nonce, _ := service.VerifyOIDCState(oidcTestStateSigningKey, state, time.Now())

	idp.withNextIDTokenClaims(map[string]any{
		"sub": "admin-sub", "email": "admin-e2e@example.com", "email_verified": true, "nonce": nonce,
		"groups": []string{"engineers", "admins"},
	})

	cbReq := httptest.NewRequest("GET", "/api/v1/auth/oidc/callback?code=any-code&state="+url.QueryEscape(state), nil)
	cbReq.AddCookie(stateCookie)
	cbRec := httptest.NewRecorder()
	h.ServeHTTP(cbRec, cbReq)
	if cbRec.Code != http.StatusFound {
		t.Fatalf("status = %d, body: %s", cbRec.Code, cbRec.Body.String())
	}

	users, err := svc.ListUsers(context.Background())
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	var found bool
	for _, u := range users {
		if u.Email == "admin-e2e@example.com" {
			found = true
			if !u.IsTenantAdmin {
				t.Error("IsTenantAdmin = false, want true (groups claim matched)")
			}
		}
	}
	if !found {
		t.Fatal("provisioned user not found")
	}
}
