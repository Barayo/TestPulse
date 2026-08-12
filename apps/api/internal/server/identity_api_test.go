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

// backlog #117 (design.md D3): a token scoped to a project + role is
// authorized only for that role's permissions, only on that one project —
// never the creator's broader access, never a different project.
func TestScenario_ScopedTokenAuthorizedOnlyWithinItsProjectAndRole(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin@example.com", "correcthorse")
	viewerRoleID := roleIDByName(t, h, admin, "Viewer")

	var projectA, projectB jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Scoped A"}, 201, &projectA)
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Scoped B"}, 201, &projectB)
	projectAID, _ := projectA["id"].(string)
	projectAKey, _ := projectA["key"].(string)
	projectBKey, _ := projectB["key"].(string)

	var created jmap
	callAs(t, h, admin, "POST", "/api/v1/tokens",
		jmap{"name": "viewer-agent", "projectId": projectAID, "roleId": viewerRoleID}, 201, &created)
	full, _ := created["token"].(string)

	// Read access on the scoped project: granted.
	callAs(t, h, "Bearer "+full, "GET", "/api/v1/projects/"+projectAKey, nil, 200, nil)

	// Write access, even on the scoped project: denied (Viewer has no caseCreate).
	var errBody jmap
	callAs(t, h, "Bearer "+full, "POST", "/api/v1/projects/"+projectAKey+"/cases",
		jmap{"title": "Login works"}, 403, &errBody)

	// Any access to a different project: denied, even read.
	callAs(t, h, "Bearer "+full, "GET", "/api/v1/projects/"+projectBKey, nil, 403, &errBody)
}

// The single most important invariant this feature exists for: a scoped
// token created by a Tenant Admin must not bypass scoping via the
// existing IsTenantAdmin shortcut requirePermission checks first.
func TestScenario_ScopedTokenFromTenantAdminDoesNotBypassScoping(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin@example.com", "correcthorse")
	viewerRoleID := roleIDByName(t, h, admin, "Viewer")

	var project jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Admin Scoped"}, 201, &project)
	projectID, _ := project["id"].(string)
	projectKey, _ := project["key"].(string)

	var created jmap
	callAs(t, h, admin, "POST", "/api/v1/tokens",
		jmap{"name": "admin-viewer-agent", "projectId": projectID, "roleId": viewerRoleID}, 201, &created)
	full, _ := created["token"].(string)

	var errBody jmap
	callAs(t, h, "Bearer "+full, "POST", "/api/v1/projects/"+projectKey+"/cases",
		jmap{"title": "Should be denied"}, 403, &errBody)
	// Read still works, proving the token authenticates at all — it's
	// specifically write access that must be denied despite the creator
	// being a Tenant Admin.
	callAs(t, h, "Bearer "+full, "GET", "/api/v1/projects/"+projectKey, nil, 200, nil)
}

// Deleting a scoped token's role deletes the token itself (cascade) — it
// stops authenticating entirely (401), never falls back to
// unscoped/full access.
func TestScenario_ScopedTokenDeletedWhenItsRoleIsDeleted(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin@example.com", "correcthorse")

	var project jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Role Deleted"}, 201, &project)
	projectID, _ := project["id"].(string)
	projectKey, _ := project["key"].(string)

	var role jmap
	callAs(t, h, admin, "POST", "/api/v1/roles",
		jmap{"name": "Ephemeral Token Role (HTTP)", "canRead": true}, 201, &role)
	roleID, _ := role["id"].(string)

	var created jmap
	callAs(t, h, admin, "POST", "/api/v1/tokens",
		jmap{"name": "ephemeral-agent", "projectId": projectID, "roleId": roleID}, 201, &created)
	full, _ := created["token"].(string)

	callAs(t, h, "Bearer "+full, "GET", "/api/v1/projects/"+projectKey, nil, 200, nil)

	callAs(t, h, admin, "DELETE", "/api/v1/roles/"+roleID, nil, 204, nil)

	var errBody jmap
	callAs(t, h, "Bearer "+full, "GET", "/api/v1/projects/"+projectKey, nil, 401, &errBody)
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

func TestScenario_DeleteUserRequiresDeactivationFirst(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "active@example.com", "password": "correcthorse"}, 201, &member)
	memberID, _ := member["id"].(string)

	callAs(t, h, adminCookie, "DELETE", "/api/v1/users/"+memberID, nil, 400, nil)

	var users []jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/users", nil, 200, &users)
	found := false
	for _, u := range users {
		if u["id"] == memberID {
			found = true
		}
	}
	if !found {
		t.Error("user should still exist after a rejected delete")
	}
}

// Self-deletion is exercised via a bearer token minted before
// self-deactivation, not the admin's own session cookie: deactivating an
// account immediately invalidates its session on every subsequent request
// (AuthenticateSession checks DeactivatedAt), a pre-existing, separate gap
// noted in design.md's Risks — so a deactivated admin literally cannot
// reach this handler via their own cookie at all. A token they created
// while still active keeps authenticating after deactivation
// (AuthenticateToken doesn't check the creator's DeactivatedAt), which is
// what actually makes this guard reachable in practice.
func TestScenario_DeleteUserRejectsSelfDelete(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var admin jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/users/me", nil, 200, &admin)
	adminID, _ := admin["id"].(string)

	var tokenResp jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/tokens", jmap{"name": "self-token"}, 201, &tokenResp)
	token, _ := tokenResp["token"].(string)

	callAs(t, h, adminCookie, "PATCH", "/api/v1/users/"+adminID, jmap{"deactivate": true}, 204, nil)
	callAs(t, h, "Bearer "+token, "DELETE", "/api/v1/users/"+adminID, nil, 403, nil)
}

func TestScenario_DeleteDeactivatedUserSucceeds(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "deletable@example.com", "password": "correcthorse"}, 201, &member)
	memberID, _ := member["id"].(string)

	callAs(t, h, adminCookie, "PATCH", "/api/v1/users/"+memberID, jmap{"deactivate": true}, 204, nil)
	callAs(t, h, adminCookie, "DELETE", "/api/v1/users/"+memberID, nil, 204, nil)

	var users []jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/users", nil, 200, &users)
	for _, u := range users {
		if u["id"] == memberID {
			t.Error("user should no longer exist after delete")
		}
	}
}

func TestScenario_NonTenantAdminCannotDeleteUser(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "other@example.com", "password": "correcthorse"}, 201, &member)
	memberID, _ := member["id"].(string)
	callAs(t, h, adminCookie, "PATCH", "/api/v1/users/"+memberID, jmap{"deactivate": true}, 204, nil)

	var target jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "notadmin@example.com", "password": "correcthorse"}, 201, &target)
	nonAdminCookie := loginCookie(t, h, "notadmin@example.com", "correcthorse")

	callAs(t, h, nonAdminCookie, "DELETE", "/api/v1/users/"+memberID, nil, 403, nil)
}

func TestScenario_UserDeletionPreviewReturnsRealCounts(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "previewed@example.com", "password": "correcthorse"}, 201, &member)
	memberID, _ := member["id"].(string)

	var preview jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/users/"+memberID+"/deletion-preview", nil, 200, &preview)
	if preview["teamCount"] != float64(0) || preview["projectCount"] != float64(0) || preview["tokenCount"] != float64(0) {
		t.Errorf("preview = %+v, want all zero for a fresh user", preview)
	}
}

func TestScenario_NonTenantAdminCannotViewDeletionPreview(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "member2@example.com", "password": "correcthorse"}, 201, &member)
	memberID, _ := member["id"].(string)
	memberCookie := loginCookie(t, h, "member2@example.com", "correcthorse")

	callAs(t, h, memberCookie, "GET", "/api/v1/users/"+memberID+"/deletion-preview", nil, 403, nil)
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
