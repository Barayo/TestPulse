package testpulseclient

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestServer(t *testing.T, handler http.HandlerFunc) (*Client, *[]string) {
	t.Helper()
	var gotAuth []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = append(gotAuth, r.Header.Get("Authorization"))
		handler(w, r)
	}))
	t.Cleanup(srv.Close)
	return New(srv.URL, "agent-token-123"), &gotAuth
}

func TestListProjectsSendsBearerAuth(t *testing.T) {
	c, gotAuth := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/projects" {
			t.Errorf("path = %q", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode([]map[string]any{{"key": "SP"}, {"key": "QA"}})
	})

	projects, err := c.ListProjects(t.Context())
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(projects) != 2 || projects[0].Key != "SP" || projects[1].Key != "QA" {
		t.Errorf("projects = %+v", projects)
	}
	if (*gotAuth)[0] != "Bearer agent-token-123" {
		t.Errorf("Authorization = %q", (*gotAuth)[0])
	}
}

func TestListJiraLinkedCasesUsesFilterQueryParam(t *testing.T) {
	c, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/projects/SP/cases" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if r.URL.Query().Get("jiraLinked") != "true" {
			t.Errorf("jiraLinked query param = %q, want true", r.URL.Query().Get("jiraLinked"))
		}
		key := "PROJ-1"
		_ = json.NewEncoder(w).Encode([]map[string]any{{"key": "SP-1", "jiraIssueKey": key}})
	})

	cases, err := c.ListJiraLinkedCases(t.Context(), "SP")
	if err != nil {
		t.Fatalf("ListJiraLinkedCases: %v", err)
	}
	if len(cases) != 1 || cases[0].Key != "SP-1" || cases[0].JiraIssueKey != "PROJ-1" {
		t.Errorf("cases = %+v", cases)
	}
}

func TestListOpenRunsFiltersOutClosedRuns(t *testing.T) {
	c, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"key": "SP-R1", "status": "open"},
			{"key": "SP-R2", "status": "closed"},
		})
	})

	runs, err := c.ListOpenRuns(t.Context(), "SP")
	if err != nil {
		t.Fatalf("ListOpenRuns: %v", err)
	}
	if len(runs) != 1 || runs[0].Key != "SP-R1" {
		t.Errorf("runs = %+v, want only the open one", runs)
	}
}

func TestListJiraLinkedRunItemsUsesFilterQueryParam(t *testing.T) {
	c, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/runs/SP-R1/items" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if r.URL.Query().Get("jiraLinked") != "true" {
			t.Errorf("jiraLinked query param missing")
		}
		key := "PROJ-2"
		_ = json.NewEncoder(w).Encode([]map[string]any{{"id": "item-1", "jiraIssueKey": key}})
	})

	items, err := c.ListJiraLinkedRunItems(t.Context(), "SP-R1")
	if err != nil {
		t.Fatalf("ListJiraLinkedRunItems: %v", err)
	}
	if len(items) != 1 || items[0].ID != "item-1" || items[0].JiraIssueKey != "PROJ-2" {
		t.Errorf("items = %+v", items)
	}
}

func TestSyncCaseSendsPutWithSummaryAndStatus(t *testing.T) {
	var gotBody map[string]string
	c, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("method = %q, want PUT", r.Method)
		}
		if r.URL.Path != "/api/v1/cases/SP-1/jira-sync" {
			t.Errorf("path = %q", r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusOK)
	})

	if err := c.SyncCase(t.Context(), "SP-1", "Fix login redirect", "In Progress"); err != nil {
		t.Fatalf("SyncCase: %v", err)
	}
	if gotBody["jiraIssueSummary"] != "Fix login redirect" || gotBody["jiraIssueStatus"] != "In Progress" {
		t.Errorf("body = %+v", gotBody)
	}
}

func TestSyncRunItemSendsPutWithSummaryAndStatus(t *testing.T) {
	var gotBody map[string]string
	c, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/items/item-1/jira-sync" {
			t.Errorf("path = %q", r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusOK)
	})

	if err := c.SyncRunItem(t.Context(), "item-1", "Add logout button", "Done"); err != nil {
		t.Fatalf("SyncRunItem: %v", err)
	}
	if gotBody["jiraIssueSummary"] != "Add logout button" || gotBody["jiraIssueStatus"] != "Done" {
		t.Errorf("body = %+v", gotBody)
	}
}

func TestSyncCaseReturnsErrorOnNon2xx(t *testing.T) {
	c, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
	})
	if err := c.SyncCase(t.Context(), "SP-1", "s", "s"); err == nil {
		t.Fatal("expected an error for a 409 response")
	}
}
