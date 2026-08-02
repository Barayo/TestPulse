package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/server"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// apiServerWithAdmin builds a server the same way apiServer does (api_test.go)
// but seeds one bootstrap admin first, since there is no HTTP-facing way to
// create the very first user on an empty instance.
func apiServerWithAdmin(t *testing.T, email, password string) (http.Handler, *service.Service) {
	t.Helper()
	pool := testutil.Pool(t, "server")
	svc := service.New(store.New(pool))
	if err := svc.BootstrapAdmin(context.Background(), email, password); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	return server.New(slog.New(slog.DiscardHandler), ok{}, svc), svc
}

// Identity API integration tests: full HTTP -> service -> store -> Postgres
// loop, mapping to scenarios in the add-identity-basics change.

// loginCookie logs in over HTTP and returns the session cookie header value
// to attach to subsequent requests via callWithCookie.
func loginCookie(t *testing.T, h http.Handler, email, password string) string {
	t.Helper()
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(jmap{"email": email, "password": password}); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/api/v1/auth/login", &buf)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login = %d, body: %s", rec.Code, rec.Body.String())
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == "session" {
			return c.Name + "=" + c.Value
		}
	}
	t.Fatal("login response did not set a session cookie")
	return ""
}

// callAs is call (see api_test.go) but attaches a Cookie or Authorization
// header so the request authenticates as a specific actor.
func callAs(t *testing.T, h http.Handler, cookieOrBearer, method, path string, body any, wantStatus int, out any) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if len(cookieOrBearer) > 7 && cookieOrBearer[:7] == "Bearer " {
		req.Header.Set("Authorization", cookieOrBearer)
	} else if cookieOrBearer != "" {
		req.Header.Set("Cookie", cookieOrBearer)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != wantStatus {
		t.Fatalf("%s %s = %d, want %d; body: %s", method, path, rec.Code, wantStatus, rec.Body.String())
	}
	if out != nil {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("decoding %s %s response: %v", method, path, err)
		}
	}
}

func TestScenario_LoginSuccessAndFailure(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")

	var user jmap
	callAs(t, h, "", "POST", "/api/v1/auth/login",
		jmap{"email": "admin@example.com", "password": "correcthorse"}, 200, &user)
	if user["email"] != "admin@example.com" {
		t.Errorf("login response = %+v", user)
	}

	var errBody jmap
	callAs(t, h, "", "POST", "/api/v1/auth/login",
		jmap{"email": "admin@example.com", "password": "wrong"}, 401, &errBody)
}

func TestScenario_AnonymousRequestToDomainRouteRejected(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	var errBody jmap
	callAs(t, h, "", "GET", "/api/v1/projects", nil, 401, &errBody)
}

func TestScenario_HealthAndMetaStayOpen(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	callAs(t, h, "", "GET", "/healthz", nil, 200, nil)
	callAs(t, h, "", "GET", "/readyz", nil, 200, nil)
	callAs(t, h, "", "GET", "/api/v1/meta", nil, 200, nil)
}

func TestScenario_LogoutInvalidatesSessionOverHTTP(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	callAs(t, h, cookie, "POST", "/api/v1/auth/logout", nil, 204, nil)
	var errBody jmap
	callAs(t, h, cookie, "GET", "/api/v1/projects", nil, 401, &errBody)
}

// TestScenario_NonTenantAdminCannotCreateProjectOrManageUsers replaces the
// old "member has full domain access" scenario — under add-project-rbac, a
// non-Tenant-Admin has no access at all until granted project membership,
// and can never create projects or manage user accounts regardless.
func TestScenario_NonTenantAdminCannotCreateProjectOrManageUsers(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "member@example.com", "password": "correcthorse"}, 201, &member)
	if member["isTenantAdmin"] != false {
		t.Errorf("created user = %+v, want isTenantAdmin=false by default", member)
	}

	memberCookie := loginCookie(t, h, "member@example.com", "correcthorse")

	var errBody jmap
	callAs(t, h, memberCookie, "POST", "/api/v1/projects", jmap{"name": "QA"}, 403, &errBody)
	callAs(t, h, memberCookie, "POST", "/api/v1/users",
		jmap{"email": "other@example.com", "password": "correcthorse"}, 403, &errBody)
}

func TestScenario_CreateAndAuthenticateTokenOverHTTP(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var created jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/tokens", jmap{"name": "ci-agent"}, 201, &created)
	full, _ := created["token"].(string)
	if full == "" {
		t.Fatalf("created token missing full value: %+v", created)
	}

	var list []jmap
	callAs(t, h, "Bearer "+full, "GET", "/api/v1/projects", nil, 200, &list)

	// Revoke, then the same token must stop authenticating.
	tokenID, _ := created["id"].(string)
	callAs(t, h, adminCookie, "DELETE", "/api/v1/tokens/"+tokenID, nil, 204, nil)
	var errBody jmap
	callAs(t, h, "Bearer "+full, "GET", "/api/v1/projects", nil, 401, &errBody)
}

func TestScenario_DeactivateThenReactivateUser(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "member@example.com", "password": "correcthorse"}, 201, &member)
	memberID, _ := member["id"].(string)

	callAs(t, h, adminCookie, "PATCH", "/api/v1/users/"+memberID, jmap{"deactivate": true}, 204, nil)
	var errBody jmap
	callAs(t, h, "", "POST", "/api/v1/auth/login",
		jmap{"email": "member@example.com", "password": "correcthorse"}, 401, &errBody)

	callAs(t, h, adminCookie, "PATCH", "/api/v1/users/"+memberID, jmap{"reactivate": true}, 204, nil)
	var loggedIn jmap
	callAs(t, h, "", "POST", "/api/v1/auth/login",
		jmap{"email": "member@example.com", "password": "correcthorse"}, 200, &loggedIn)
}

func TestScenario_AuditHistoryQueryableForAnEntity(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var history []jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/audit?entityType=project&entityId="+projectID, nil, 200, &history)
	if len(history) != 1 || history[0]["action"] != "create" {
		t.Errorf("audit history = %+v", history)
	}
}

func TestScenario_CurrentUserReflectsSessionActor(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var me jmap
	callAs(t, h, cookie, "GET", "/api/v1/users/me", nil, 200, &me)
	if me["email"] != "admin@example.com" || me["isTenantAdmin"] != true {
		t.Errorf("me = %+v", me)
	}
}

func TestScenario_UpdateOwnProfile(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var updated jmap
	callAs(t, h, cookie, "PATCH", "/api/v1/users/me",
		jmap{"displayName": "Ada", "avatarKey": "ada-lovelace", "timezone": "Europe/Madrid"}, 200, &updated)
	if updated["displayName"] != "Ada" || updated["avatarKey"] != "ada-lovelace" || updated["timezone"] != "Europe/Madrid" {
		t.Errorf("updated = %+v", updated)
	}

	var me jmap
	callAs(t, h, cookie, "GET", "/api/v1/users/me", nil, 200, &me)
	if me["displayName"] != "Ada" {
		t.Errorf("me after update = %+v", me)
	}
}

func TestScenario_UpdateOwnProfileRejectsUnknownAvatarKey(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var errBody jmap
	callAs(t, h, cookie, "PATCH", "/api/v1/users/me", jmap{"avatarKey": "not-a-real-preset"}, 400, &errBody)
}

func TestScenario_UpdateOwnProfileRequiresAuthentication(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")

	var errBody jmap
	callAs(t, h, "", "PATCH", "/api/v1/users/me", jmap{"displayName": "Ada"}, 401, &errBody)
}
