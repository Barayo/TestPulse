// Package mcp_test integration-tests the MCP server end to end: a real
// TestPulse API server (chi routing + authenticate middleware + the /mcp
// mount), a real test database, and the official SDK's own MCP client
// driving real Streamable HTTP requests — add-mcp-server design.md's
// chosen testing approach, exercising the actual wire protocol rather than
// hand-constructed JSON-RPC bodies. Lives in its own package (not
// internal/mcp) because it needs internal/server, and internal/server
// already imports internal/mcp — a same-package test would be a cycle.
package mcp_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/server"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

type stubReady struct{}

func (stubReady) Ready(context.Context) error { return nil }

// testMCPServer starts a real, in-process TestPulse API server backed by a
// real test database.
func testMCPServer(t *testing.T) (*httptest.Server, *service.Service) {
	t.Helper()
	svc := service.New(store.New(testutil.Pool(t, "mcp_integration")))
	h := server.New(slog.New(slog.DiscardHandler), stubReady{}, svc, 1000, 1000, nil, true)
	ts := httptest.NewServer(h)
	t.Cleanup(ts.Close)
	return ts, svc
}

type authRoundTripper struct {
	token string
	base  http.RoundTripper
}

func (t authRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	req = req.Clone(req.Context())
	if t.token != "" {
		req.Header.Set("Authorization", "Bearer "+t.token)
	}
	return t.base.RoundTrip(req)
}

// connectMCP connects a real MCP client to ts's /mcp endpoint, authenticated
// with token ("" for no Authorization header at all).
func connectMCP(t *testing.T, ts *httptest.Server, token string) (*sdkmcp.ClientSession, error) {
	t.Helper()
	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.0.1"}, nil)
	transport := &sdkmcp.StreamableClientTransport{
		Endpoint:   ts.URL + "/mcp",
		HTTPClient: &http.Client{Transport: authRoundTripper{token: token, base: http.DefaultTransport}},
	}
	session, err := client.Connect(context.Background(), transport, nil)
	if err == nil {
		t.Cleanup(func() { _ = session.Close() })
	}
	return session, err
}

func mustConnectMCP(t *testing.T, ts *httptest.Server, token string) *sdkmcp.ClientSession {
	t.Helper()
	session, err := connectMCP(t, ts, token)
	if err != nil {
		t.Fatalf("connecting MCP client: %v", err)
	}
	return session
}

// mustBootstrapAdmin creates and logs in a fresh admin user, returning the
// domain.User (its ID doubles as EffectiveUserID for building actors and
// tokens).
func mustBootstrapAdmin(t *testing.T, svc *service.Service, email string) domain.User {
	t.Helper()
	ctx := context.Background()
	if err := svc.BootstrapAdmin(ctx, email, "correcthorse1"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	_, user, err := svc.Login(ctx, email, "correcthorse1")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	return user
}

func actorForUser(u domain.User) domain.Actor {
	return domain.Actor{ID: u.ID, Kind: domain.ActorKindUser, DisplayName: u.Email, EffectiveUserID: u.ID, IsTenantAdmin: u.IsTenantAdmin}
}

// mustCreateUnscopedToken creates an agent API token with the full access
// of its creator (here, the tenant admin) — an unscoped token, per
// AuthenticateToken's meaning of a nil projectID/roleID pair.
func mustCreateUnscopedToken(t *testing.T, svc *service.Service, owner domain.Actor, name string) string {
	t.Helper()
	full, _, err := svc.CreateToken(context.Background(), owner, name, nil, nil)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	return full
}

// mustCreateScopedToken creates an agent API token scoped to one project
// with role's exact permission flags.
func mustCreateScopedToken(t *testing.T, svc *service.Service, admin domain.Actor, owner domain.Actor, projectID string, role domain.Role) string {
	t.Helper()
	ctx := context.Background()
	createdRole, err := svc.CreateRole(ctx, admin, role)
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := svc.SetProjectMember(ctx, admin, projectID, owner.EffectiveUserID, createdRole.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}
	full, _, err := svc.CreateToken(ctx, owner, "scoped-agent", &projectID, &createdRole.ID)
	if err != nil {
		t.Fatalf("CreateToken (scoped): %v", err)
	}
	return full
}

func callTool(t *testing.T, session *sdkmcp.ClientSession, name string, args any, out any) *sdkmcp.CallToolResult {
	t.Helper()
	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("CallTool(%s): protocol error: %v", name, err)
	}
	if result.IsError {
		t.Fatalf("CallTool(%s): tool error: %v", name, contentText(result))
	}
	if out != nil {
		raw, err := json.Marshal(result.StructuredContent)
		if err != nil {
			t.Fatalf("marshaling StructuredContent for %s: %v", name, err)
		}
		if err := json.Unmarshal(raw, out); err != nil {
			t.Fatalf("decoding result of %s: %v (raw: %s)", name, err, raw)
		}
	}
	return result
}

func contentText(result *sdkmcp.CallToolResult) string {
	var s string
	for _, c := range result.Content {
		if tc, ok := c.(*sdkmcp.TextContent); ok {
			s += tc.Text
		}
	}
	return s
}
