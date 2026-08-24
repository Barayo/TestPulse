package server_test

import (
	"log/slog"
	"net/http"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/server"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// bareAPIServer builds a server backed by a real, empty database — no
// bootstrap admin — for first-run setup scenarios (add-first-run-setup).
func bareAPIServer(t *testing.T) (http.Handler, *service.Service) {
	t.Helper()
	pool := testutil.Pool(t, "server")
	svc := service.New(store.New(pool))
	return server.New(slog.New(slog.DiscardHandler), ok{}, svc, 5, 5, nil), svc
}

func TestScenario_SetupCreatesAdminAndLogsIn(t *testing.T) {
	h, _ := bareAPIServer(t)

	var user jmap
	callAs(t, h, "", "POST", "/api/v1/setup",
		jmap{"email": "founder@example.com", "password": "correcthorsebattery"}, 200, &user)
	if user["email"] != "founder@example.com" {
		t.Errorf("setup response = %+v", user)
	}
	if user["isTenantAdmin"] != true {
		t.Errorf("isTenantAdmin = %v, want true", user["isTenantAdmin"])
	}
	if user["mustChangePassword"] != false {
		t.Errorf("mustChangePassword = %v, want false", user["mustChangePassword"])
	}

	// Response also set a session cookie — the account can act immediately.
	cookie := loginCookie(t, h, "founder@example.com", "correcthorsebattery")
	if cookie == "" {
		t.Fatal("expected the created account to be able to log in")
	}
}

// TestScenario_SetupSeedsSampleProject reproduces a real gap found via
// manual testing: main.go's boot-time seedSampleProjectIfEmpty runs once,
// right after BootstrapAdmin — on a first-run-setup instance (no admin env
// vars), BootstrapAdmin is a no-op, so that boot-time attempt fails ("no
// tenant admin user found to attribute seeded content to") and, being a
// one-shot check, never retries. The always-on Sample Project showroom
// (CLAUDE.md) must not silently go missing just because an instance took
// the interactive setup path instead of the env-var one.
func TestScenario_SetupSeedsSampleProject(t *testing.T) {
	h, _ := bareAPIServer(t)

	callAs(t, h, "", "POST", "/api/v1/setup",
		jmap{"email": "founder@example.com", "password": "correcthorsebattery"}, 200, nil)
	cookie := loginCookie(t, h, "founder@example.com", "correcthorsebattery")

	var projects []jmap
	callAs(t, h, cookie, "GET", "/api/v1/projects", nil, 200, &projects)
	if len(projects) != 1 || projects[0]["name"] != "Sample Project" {
		t.Errorf("projects = %+v, want exactly one Sample Project", projects)
	}
}

func TestScenario_SetupRejectedWhenUsersExist(t *testing.T) {
	h, svc := bareAPIServer(t)
	if err := svc.BootstrapAdmin(t.Context(), "existing@example.com", "correcthorse"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}

	var errBody jmap
	callAs(t, h, "", "POST", "/api/v1/setup",
		jmap{"email": "intruder@example.com", "password": "correcthorsebattery"}, 409, &errBody)

	// No second account was created.
	users, err := svc.ListUsers(t.Context())
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != 1 {
		t.Errorf("users = %+v, want unchanged (still 1)", users)
	}
}

func TestScenario_SetupWeakPasswordRejected(t *testing.T) {
	h, svc := bareAPIServer(t)

	var errBody jmap
	callAs(t, h, "", "POST", "/api/v1/setup",
		jmap{"email": "founder@example.com", "password": "short"}, 400, &errBody)

	has, err := svc.HasAnyUser(t.Context())
	if err != nil {
		t.Fatalf("HasAnyUser: %v", err)
	}
	if has {
		t.Error("HasAnyUser = true after a rejected weak-password setup attempt, want false")
	}
}
