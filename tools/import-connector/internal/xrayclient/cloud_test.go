package xrayclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewCloudAuthenticatesAndCarriesBearerToken(t *testing.T) {
	var gotAuthHeader string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v2/authenticate":
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["client_id"] != "cid" || body["client_secret"] != "csecret" {
				t.Fatalf("authenticate body = %+v, want client_id/client_secret", body)
			}
			_, _ = w.Write([]byte(`"fake-jwt-token"`))
		case "/api/v2/graphql":
			gotAuthHeader = r.Header.Get("Authorization")
			_, _ = w.Write([]byte(`{"data":{"getFolder":{"name":"<Root>","path":"/","folders":[]}}}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client, err := NewCloud(context.Background(), srv.URL, "cid", "csecret", "10000")
	if err != nil {
		t.Fatalf("NewCloud: %v", err)
	}
	if _, err := client.ListFolders(context.Background()); err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	if gotAuthHeader != "Bearer fake-jwt-token" {
		t.Fatalf("Authorization header = %q, want %q", gotAuthHeader, "Bearer fake-jwt-token")
	}
}

func TestNewCloudReturnsClearErrorOnAuthFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid client credentials"}`))
	}))
	defer srv.Close()

	_, err := NewCloud(context.Background(), srv.URL, "cid", "wrong-secret", "10000")
	if err == nil {
		t.Fatal("expected an error for failed Cloud authentication")
	}
	if !strings.Contains(err.Error(), "401") && !strings.Contains(err.Error(), "Unauthorized") {
		t.Errorf("err = %v, want it to mention the failed status", err)
	}
}

func newTestCloudClient(t *testing.T, graphqlHandler func(query string, variables map[string]any) any) Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v2/authenticate":
			_, _ = w.Write([]byte(`"fake-jwt-token"`))
		case "/api/v2/graphql":
			var body struct {
				Query     string         `json:"query"`
				Variables map[string]any `json:"variables"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decoding graphql request: %v", err)
			}
			resp := graphqlHandler(body.Query, body.Variables)
			encoded, err := json.Marshal(resp)
			if err != nil {
				t.Fatalf("marshaling fixture response: %v", err)
			}
			_, _ = w.Write(encoded)
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	t.Cleanup(srv.Close)

	client, err := NewCloud(context.Background(), srv.URL, "cid", "csecret", "10000")
	if err != nil {
		t.Fatalf("NewCloud: %v", err)
	}
	return client
}

func TestListFoldersBuildsNestedTreeViaRecursiveFetch(t *testing.T) {
	client := newTestCloudClient(t, func(query string, variables map[string]any) any {
		if !strings.Contains(query, "getFolder") {
			t.Fatalf("unexpected query: %s", query)
		}
		switch variables["path"] {
		case "/":
			return map[string]any{"data": map[string]any{"getFolder": map[string]any{
				"name": "<Root>", "path": "/",
				"folders": []map[string]any{
					{"name": "Login", "path": "/Login"},
					{"name": "Checkout", "path": "/Checkout"},
				},
			}}}
		case "/Login":
			return map[string]any{"data": map[string]any{"getFolder": map[string]any{
				"name": "Login", "path": "/Login",
				"folders": []map[string]any{
					{"name": "Happy Path", "path": "/Login/Happy Path"},
				},
			}}}
		default:
			return map[string]any{"data": map[string]any{"getFolder": map[string]any{
				"name": variables["path"], "path": variables["path"], "folders": []map[string]any{},
			}}}
		}
	})

	folders, err := client.ListFolders(context.Background())
	if err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	if len(folders) != 3 {
		t.Fatalf("folders = %+v, want 3 entries", folders)
	}
	byName := map[string]Folder{}
	for _, f := range folders {
		byName[f.Name] = f
	}
	if byName["Login"].ParentID != nil {
		t.Errorf("Login.ParentID = %v, want nil (top-level)", byName["Login"].ParentID)
	}
	if byName["Happy Path"].ParentID == nil || *byName["Happy Path"].ParentID != byName["Login"].ID {
		t.Errorf("Happy Path.ParentID = %v, want %q", byName["Happy Path"].ParentID, byName["Login"].ID)
	}
}

func TestListTestsMapsManualCucumberAndGenericTypes(t *testing.T) {
	client := newTestCloudClient(t, func(query string, variables map[string]any) any {
		if !strings.Contains(query, "getTests") {
			t.Fatalf("unexpected query: %s", query)
		}
		return map[string]any{"data": map[string]any{"getTests": map[string]any{
			"total": 3, "start": 0, "limit": 100,
			"results": []map[string]any{
				{
					"issueId":  "1",
					"testType": map[string]any{"name": "Manual"},
					"steps":    [][]map[string]any{{{"action": "Click login", "data": "", "result": "Login form appears"}}},
					"jira":     map[string]any{"key": "XRAY-1", "summary": "Manual test", "description": "desc 1"},
				},
				{
					"issueId":  "2",
					"testType": map[string]any{"name": "Cucumber"},
					"gherkin":  []string{"Scenario: Login\n  Given ...\n  Then ..."},
					"jira":     map[string]any{"key": "XRAY-2", "summary": "Cucumber test", "description": ""},
				},
				{
					"issueId":      "3",
					"testType":     map[string]any{"name": "Generic"},
					"unstructured": []string{"Free text test definition"},
					"jira":         map[string]any{"key": "XRAY-3", "summary": "Generic test", "description": ""},
				},
			},
		}}}
	})

	tests, err := client.ListTests(context.Background(), "/Login")
	if err != nil {
		t.Fatalf("ListTests: %v", err)
	}
	if len(tests) != 3 {
		t.Fatalf("tests = %+v, want 3", tests)
	}

	manual := tests[0]
	if manual.Key != "XRAY-1" || manual.Summary != "Manual test" || manual.TestType != "Manual" {
		t.Errorf("manual test = %+v", manual)
	}
	if manual.Definition != "" {
		t.Errorf("manual.Definition = %q, want empty (steps come from GetTestSteps)", manual.Definition)
	}

	cucumber := tests[1]
	if cucumber.TestType != "Cucumber" || !strings.Contains(cucumber.Definition, "Scenario: Login") {
		t.Errorf("cucumber test = %+v", cucumber)
	}

	generic := tests[2]
	if generic.TestType != "Generic" || generic.Definition != "Free text test definition" {
		t.Errorf("generic test = %+v", generic)
	}
}

func TestListTestsPaginatesUntilTotalReached(t *testing.T) {
	calls := 0
	client := newTestCloudClient(t, func(query string, variables map[string]any) any {
		calls++
		start := 0
		if s, ok := variables["start"].(float64); ok {
			start = int(s)
		}
		if start == 0 {
			return map[string]any{"data": map[string]any{"getTests": map[string]any{
				"total": 2, "start": 0, "limit": 1,
				"results": []map[string]any{
					{"issueId": "1", "testType": map[string]any{"name": "Manual"}, "jira": map[string]any{"key": "XRAY-1", "summary": "First"}},
				},
			}}}
		}
		return map[string]any{"data": map[string]any{"getTests": map[string]any{
			"total": 2, "start": 1, "limit": 1,
			"results": []map[string]any{
				{"issueId": "2", "testType": map[string]any{"name": "Manual"}, "jira": map[string]any{"key": "XRAY-2", "summary": "Second"}},
			},
		}}}
	})

	tests, err := client.ListTests(context.Background(), "/Login")
	if err != nil {
		t.Fatalf("ListTests: %v", err)
	}
	if len(tests) != 2 {
		t.Fatalf("tests = %+v, want 2 across two pages", tests)
	}
	if calls != 2 {
		t.Fatalf("graphql calls = %d, want 2", calls)
	}
}

func TestGetTestStepsReturnsManualStepsOnly(t *testing.T) {
	client := newTestCloudClient(t, func(query string, variables map[string]any) any {
		if !strings.Contains(query, "getTests") {
			t.Fatalf("unexpected query: %s", query)
		}
		return map[string]any{"data": map[string]any{"getTests": map[string]any{
			"total": 1, "start": 0, "limit": 100,
			"results": []map[string]any{
				{
					"issueId": "1",
					"jira":    map[string]any{"key": "XRAY-1"},
					"steps": [][]map[string]any{{
						{"action": "Open login page", "data": "", "result": "Page loads"},
						{"action": "Enter credentials", "data": "user/pass", "result": "Logged in"},
					}},
				},
			},
		}}}
	})

	steps, err := client.GetTestSteps(context.Background(), "XRAY-1")
	if err != nil {
		t.Fatalf("GetTestSteps: %v", err)
	}
	if len(steps) != 2 {
		t.Fatalf("steps = %+v, want 2", steps)
	}
	if steps[1].Action != "Enter credentials" || steps[1].Data != "user/pass" || steps[1].Result != "Logged in" {
		t.Errorf("steps[1] = %+v", steps[1])
	}
}

func TestListFoldersSurfacesGraphQLErrors(t *testing.T) {
	client := newTestCloudClient(t, func(query string, variables map[string]any) any {
		return map[string]any{"errors": []map[string]any{{"message": "project not found"}}}
	})

	if _, err := client.ListFolders(context.Background()); err == nil {
		t.Fatal("expected an error when GraphQL returns an errors array")
	} else if !strings.Contains(err.Error(), "project not found") {
		t.Errorf("err = %v, want it to include the GraphQL error message", err)
	}
}
