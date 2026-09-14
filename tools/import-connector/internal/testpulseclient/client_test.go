package testpulseclient

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func testServer(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return New(srv.URL, "agent-token-123")
}

func requireBearer(t *testing.T, r *http.Request) {
	t.Helper()
	if got := r.Header.Get("Authorization"); got != "Bearer agent-token-123" {
		t.Errorf("Authorization header = %q, want Bearer agent-token-123", got)
	}
}

func TestListProjects(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBearer(t, r)
		if r.URL.Path != "/api/v1/projects" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode([]jmap{{"id": "proj-1", "key": "QA"}})
	})

	projects, err := c.ListProjects(context.Background())
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(projects) != 1 || projects[0].Key != "QA" {
		t.Fatalf("projects = %+v, want one QA project", projects)
	}
}

func TestRootFolderID(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBearer(t, r)
		if r.URL.Path != "/api/v1/projects/QA/folders" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"items": []jmap{
				{"id": "root-1", "name": "QA"},
				{"id": "child-1", "name": "Auth", "parentFolderId": "root-1"},
			},
			"nextCursor": nil,
		})
	})

	id, err := c.RootFolderID(context.Background(), "QA")
	if err != nil {
		t.Fatalf("RootFolderID: %v", err)
	}
	if id != "root-1" {
		t.Errorf("RootFolderID = %q, want root-1", id)
	}
}

func TestCreateFolder(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBearer(t, r)
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/projects/QA/folders" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		var body jmap
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["name"] != "Master" || body["parentFolderId"] != "root-1" {
			t.Fatalf("unexpected body: %+v", body)
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(jmap{"id": "folder-2", "name": "Master", "parentFolderId": "root-1"})
	})

	folder, err := c.CreateFolder(context.Background(), "QA", "Master", "root-1")
	if err != nil {
		t.Fatalf("CreateFolder: %v", err)
	}
	if folder.ID != "folder-2" {
		t.Errorf("folder = %+v, want id folder-2", folder)
	}
}

func TestCreateCase(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBearer(t, r)
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/projects/QA/cases" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		var body jmap
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["title"] != "Login with valid credentials" || body["folderId"] != "folder-2" {
			t.Fatalf("unexpected body: %+v", body)
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(jmap{"key": "QA-C1"})
	})

	created, err := c.CreateCase(context.Background(), "QA", NewCase{
		Title:    "Login with valid credentials",
		FolderID: "folder-2",
		Steps:    []Step{{Action: "Enter valid username/password", Expected: "User is logged in"}},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	if created.Key != "QA-C1" {
		t.Errorf("created = %+v, want key QA-C1", created)
	}
}

func TestCreateCustomFieldAndOption(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBearer(t, r)
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/projects/QA/custom-fields":
			var body jmap
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["name"] != "Automation Type" || body["fieldType"] != "select" {
				t.Fatalf("unexpected create-field body: %+v", body)
			}
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(jmap{"id": "field-1", "name": "Automation Type", "fieldType": "select"})
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/custom-fields/field-1/options":
			var body jmap
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["value"] != "Manual" {
				t.Fatalf("unexpected create-option body: %+v", body)
			}
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(jmap{"id": "opt-1", "value": "Manual"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	})

	field, err := c.CreateCustomField(context.Background(), "QA", "Automation Type", "select")
	if err != nil {
		t.Fatalf("CreateCustomField: %v", err)
	}
	if field.ID != "field-1" {
		t.Fatalf("field = %+v, want id field-1", field)
	}
	opt, err := c.AddCustomFieldOption(context.Background(), field.ID, "Manual")
	if err != nil {
		t.Fatalf("AddCustomFieldOption: %v", err)
	}
	if opt.ID != "opt-1" {
		t.Errorf("opt = %+v, want id opt-1", opt)
	}
}

func TestClaimPendingJob(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBearer(t, r)
		if r.URL.Path != "/api/v1/import-jobs" || r.URL.Query().Get("status") != "pending" || r.URL.Query().Get("source") != "testrail" {
			t.Fatalf("unexpected request: %s", r.URL.String())
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"job":         jmap{"id": "job-1", "projectId": "proj-1", "mode": "real"},
			"credentials": jmap{"apiKey": "tr-secret"},
		})
	})

	claimed, err := c.ClaimPendingJob(context.Background(), "testrail")
	if err != nil {
		t.Fatalf("ClaimPendingJob: %v", err)
	}
	if claimed == nil {
		t.Fatal("claimed = nil, want a job")
	}
	if claimed.Job.ID != "job-1" || claimed.Credentials["apiKey"] != "tr-secret" {
		t.Errorf("claimed = %+v, unexpected", claimed)
	}
}

func TestClaimPendingJobReturnsNilOn204(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	claimed, err := c.ClaimPendingJob(context.Background(), "testrail")
	if err != nil {
		t.Fatalf("ClaimPendingJob: %v", err)
	}
	if claimed != nil {
		t.Errorf("claimed = %+v, want nil on 204", claimed)
	}
}

func TestReportProgress(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBearer(t, r)
		if r.Method != http.MethodPatch || r.URL.Path != "/api/v1/import-jobs/job-1" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		var body jmap
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["progressCurrent"] != float64(187) || body["progressTotal"] != float64(340) {
			t.Fatalf("unexpected body: %+v", body)
		}
		w.WriteHeader(http.StatusNoContent)
	})
	if err := c.ReportProgress(context.Background(), "job-1", 187, 340); err != nil {
		t.Fatalf("ReportProgress: %v", err)
	}
}

func TestCompleteJob(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBearer(t, r)
		if r.Method != http.MethodPatch || r.URL.Path != "/api/v1/import-jobs/job-1" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		var decoded jmap
		_ = json.Unmarshal(body, &decoded)
		if decoded["status"] != "succeeded" {
			t.Fatalf("unexpected body: %+v", decoded)
		}
		w.WriteHeader(http.StatusNoContent)
	})
	report := &ImportReport{Counts: map[string]int{"cases": 340}, Unmapped: []string{"Automation Type"}}
	if err := c.CompleteJob(context.Background(), "job-1", "succeeded", report, nil); err != nil {
		t.Fatalf("CompleteJob: %v", err)
	}
}

func TestCompleteJobWithError(t *testing.T) {
	c := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		var decoded jmap
		_ = json.NewDecoder(r.Body).Decode(&decoded)
		if decoded["status"] != "failed" || decoded["error"] != "TestRail API returned 401" {
			t.Fatalf("unexpected body: %+v", decoded)
		}
		w.WriteHeader(http.StatusNoContent)
	})
	errMsg := "TestRail API returned 401"
	if err := c.CompleteJob(context.Background(), "job-1", "failed", nil, &errMsg); err != nil {
		t.Fatalf("CompleteJob: %v", err)
	}
}
