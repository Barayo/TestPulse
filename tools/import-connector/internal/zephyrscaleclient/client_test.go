package zephyrscaleclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testServer(t *testing.T, handler http.HandlerFunc) (*Client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c := New(srv.URL, "token-123")
	return c, srv
}

func requireBearerAuth(t *testing.T, r *http.Request) {
	t.Helper()
	if got := r.Header.Get("Authorization"); got != "Bearer token-123" {
		t.Errorf("Authorization header = %q, want %q", got, "Bearer token-123")
	}
}

func TestNewDefaultsBaseURL(t *testing.T) {
	c := New("", "token-123")
	if c.baseURL != "https://api.zephyrscale.smartbear.com/v2" {
		t.Errorf("baseURL = %q, want the fixed Zephyr Scale Cloud API (design.md D-Z1)", c.baseURL)
	}
}

func TestListFoldersFiltersToTestCaseType(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBearerAuth(t, r)
		if !strings.HasPrefix(r.URL.Path, "/folders") {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("projectKey") != "PROJ" {
			t.Fatalf("expected projectKey=PROJ, got query %q", r.URL.RawQuery)
		}
		if r.URL.Query().Get("folderType") != "TEST_CASE" {
			t.Fatalf("expected folderType=TEST_CASE, got query %q", r.URL.RawQuery)
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"startAt": 0, "maxResults": 50, "total": 2, "isLast": true,
			"values": []jmap{
				{"id": 1, "name": "Auth", "parentId": nil, "folderType": "TEST_CASE"},
				{"id": 2, "name": "Login", "parentId": 1, "folderType": "TEST_CASE"},
			},
		})
	})

	folders, err := c.ListFolders(context.Background(), "PROJ")
	if err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	if len(folders) != 2 || folders[0].Name != "Auth" || folders[1].ID != 2 {
		t.Fatalf("folders = %+v, want [Auth, Login]", folders)
	}
	if folders[0].ParentID != nil {
		t.Errorf("root folder ParentID = %v, want nil", folders[0].ParentID)
	}
	if folders[1].ParentID == nil || *folders[1].ParentID != 1 {
		t.Errorf("nested folder ParentID = %v, want 1", folders[1].ParentID)
	}
}

func TestListFoldersPaginates(t *testing.T) {
	calls := 0
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		startAt := r.URL.Query().Get("startAt")
		if startAt == "50" {
			_ = json.NewEncoder(w).Encode(jmap{
				"startAt": 50, "maxResults": 50, "total": 51, "isLast": true,
				"values": []jmap{
					{"id": 200, "name": "Checkout", "parentId": nil, "folderType": "TEST_CASE"},
				},
			})
			return
		}
		page := make([]jmap, 50)
		for i := range page {
			page[i] = jmap{"id": i + 1, "name": "Folder", "parentId": nil, "folderType": "TEST_CASE"}
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"startAt": 0, "maxResults": 50, "total": 51, "isLast": false,
			"values": page,
		})
	})

	folders, err := c.ListFolders(context.Background(), "PROJ")
	if err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	if len(folders) != 51 {
		t.Fatalf("folders = %d, want 51 across two pages", len(folders))
	}
	if calls != 2 {
		t.Errorf("calls = %d, want 2 (paginated)", calls)
	}
	if folders[50].Name != "Checkout" {
		t.Errorf("last folder = %+v, want Checkout", folders[50])
	}
}

func TestListTestCasesResolvesFolderLinkAndCustomFields(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/testcases") {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("projectKey") != "PROJ" {
			t.Fatalf("expected projectKey=PROJ, got query %q", r.URL.RawQuery)
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"startAt": 0, "maxResults": 50, "total": 2, "isLast": true,
			"values": []jmap{
				{
					"key": "PROJ-T1", "name": "Login with valid credentials",
					"folder":       jmap{"id": 2, "self": "https://api/folders/2"},
					"testScript":   jmap{"id": 9, "self": "https://api/testcases/PROJ-T1/testscript"},
					"customFields": jmap{"Automation Type": "Manual", "Story Points": 3},
				},
				{
					"key": "PROJ-T2", "name": "No folder, no script",
					"folder":       nil,
					"testScript":   nil,
					"customFields": jmap{},
				},
			},
		})
	})

	cases, err := c.ListTestCases(context.Background(), "PROJ")
	if err != nil {
		t.Fatalf("ListTestCases: %v", err)
	}
	if len(cases) != 2 {
		t.Fatalf("cases = %d, want 2", len(cases))
	}
	first := cases[0]
	if first.Key != "PROJ-T1" || first.Name != "Login with valid credentials" {
		t.Fatalf("case = %+v, unexpected core fields", first)
	}
	if first.FolderID == nil || *first.FolderID != 2 {
		t.Errorf("FolderID = %v, want 2", first.FolderID)
	}
	if !first.HasTestScript {
		t.Error("HasTestScript = false, want true (testScript link present)")
	}
	if v, ok := first.CustomFields["Automation Type"]; !ok || v != "Manual" {
		t.Errorf("CustomFields[Automation Type] = %v, want Manual", v)
	}
	if v, ok := first.CustomFields["Story Points"]; !ok || v != float64(3) {
		t.Errorf("CustomFields[Story Points] = %v, want 3", v)
	}

	second := cases[1]
	if second.FolderID != nil {
		t.Errorf("FolderID = %v, want nil for a case with no folder", second.FolderID)
	}
	if second.HasTestScript {
		t.Error("HasTestScript = true, want false (testScript link absent)")
	}
}

func TestListTestStepsDistinguishesInlineFromDelegate(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/testcases/PROJ-T1/teststeps") {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"startAt": 0, "maxResults": 50, "total": 2, "isLast": true,
			"values": []jmap{
				{"inline": jmap{"description": "Enter username/password", "testData": "user=admin", "expectedResult": "Logged in"}},
				{"testCase": jmap{"id": 3, "self": "https://api/testcases/PROJ-T2", "testCaseKey": "PROJ-T2"}},
			},
		})
	})

	steps, err := c.ListTestSteps(context.Background(), "PROJ-T1")
	if err != nil {
		t.Fatalf("ListTestSteps: %v", err)
	}
	if len(steps) != 2 {
		t.Fatalf("steps = %d, want 2", len(steps))
	}
	if steps[0].IsDelegate {
		t.Error("steps[0].IsDelegate = true, want false (inline step)")
	}
	if steps[0].Description != "Enter username/password" || steps[0].TestData != "user=admin" || steps[0].ExpectedResult != "Logged in" {
		t.Fatalf("steps[0] = %+v, unexpected inline fields", steps[0])
	}
	if !steps[1].IsDelegate {
		t.Error("steps[1].IsDelegate = false, want true (call-to-test step)")
	}
}

func TestGetTestScriptReturnsNilOn404(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/testcases/PROJ-T2/testscript") {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusNotFound)
	})

	script, err := c.GetTestScript(context.Background(), "PROJ-T2")
	if err != nil {
		t.Fatalf("GetTestScript: %v", err)
	}
	if script != nil {
		t.Errorf("script = %+v, want nil for a case with no script", script)
	}
}

func TestGetTestScriptReturnsTypeAndText(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/testcases/PROJ-T1/testscript") {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(jmap{"id": 9, "type": "bdd", "text": "Given a user\nWhen they log in\nThen they see the dashboard"})
	})

	script, err := c.GetTestScript(context.Background(), "PROJ-T1")
	if err != nil {
		t.Fatalf("GetTestScript: %v", err)
	}
	if script == nil {
		t.Fatal("script = nil, want a script")
	}
	if script.Type != "bdd" || !strings.Contains(script.Text, "Given a user") {
		t.Fatalf("script = %+v, unexpected fields", script)
	}
}

func TestErrorResponseSurfacesStatus(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	if _, err := c.ListFolders(context.Background(), "PROJ"); err == nil {
		t.Fatal("expected an error for a 401 response")
	}
}

type jmap = map[string]any
