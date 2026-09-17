package xrayclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewServerCarriesPATAsBearerOnLaterCalls(t *testing.T) {
	var gotAuthHeader string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuthHeader = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"id":-1,"name":"<Root>","folders":[]}`))
	}))
	defer srv.Close()

	client, err := NewServer(context.Background(), srv.URL, "my-pat-token", "XRAY")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	if _, err := client.ListFolders(context.Background()); err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	if gotAuthHeader != "Bearer my-pat-token" {
		t.Fatalf("Authorization header = %q, want %q", gotAuthHeader, "Bearer my-pat-token")
	}
}

func TestListFoldersFlattensNestedTreeSkippingRoot(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/rest/raven/1.0/api/testrepository/XRAY/folders") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{
			"id": -1, "name": "<Root>",
			"folders": [
				{"id": 10, "name": "Login", "folders": [
					{"id": 11, "name": "Happy Path", "folders": []}
				]},
				{"id": 20, "name": "Checkout", "folders": []}
			]
		}`))
	}))
	defer srv.Close()

	client, err := NewServer(context.Background(), srv.URL, "pat", "XRAY")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	folders, err := client.ListFolders(context.Background())
	if err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	if len(folders) != 3 {
		t.Fatalf("folders = %+v, want 3 (root itself excluded)", folders)
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

func TestListTestsCombinesFolderTestsAndJiraIssueFields(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/testrepository/XRAY/folders/10/tests"):
			_, _ = w.Write([]byte(`[{"id": 1, "key": "XRAY-1"}, {"id": 2, "key": "XRAY-2"}]`))
		case strings.HasSuffix(r.URL.Path, "/rest/api/2/issue/XRAY-1"):
			_, _ = w.Write([]byte(`{"key":"XRAY-1","names":{"customfield_10010":"Priority Note"},"fields":{"summary":"First test","description":"desc 1","customfield_10010":"High"}}`))
		case strings.HasSuffix(r.URL.Path, "/rest/api/2/issue/XRAY-2"):
			_, _ = w.Write([]byte(`{"key":"XRAY-2","names":{},"fields":{"summary":"Second test","description":"desc 2"}}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client, err := NewServer(context.Background(), srv.URL, "pat", "XRAY")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	tests, err := client.ListTests(context.Background(), "10")
	if err != nil {
		t.Fatalf("ListTests: %v", err)
	}
	if len(tests) != 2 {
		t.Fatalf("tests = %+v, want 2", tests)
	}
	if tests[0].Key != "XRAY-1" || tests[0].Summary != "First test" || tests[0].Description != "desc 1" {
		t.Errorf("tests[0] = %+v", tests[0])
	}
	if tests[0].CustomFields["customfield_10010"] != "High" {
		t.Errorf("tests[0].CustomFields = %+v, want customfield_10010=High", tests[0].CustomFields)
	}
	if _, ok := tests[1].CustomFields["customfield_10010"]; ok {
		t.Errorf("tests[1].CustomFields = %+v, want no customfield_10010", tests[1].CustomFields)
	}
}

func TestGetTestStepsFetchesRavenStepEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/rest/raven/1.0/api/test/XRAY-1/step") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`[{"id":1,"action":"Open page","data":"","result":"Page loads"},{"id":2,"action":"Click login","data":"user/pass","result":"Logged in"}]`))
	}))
	defer srv.Close()

	client, err := NewServer(context.Background(), srv.URL, "pat", "XRAY")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	steps, err := client.GetTestSteps(context.Background(), "XRAY-1")
	if err != nil {
		t.Fatalf("GetTestSteps: %v", err)
	}
	if len(steps) != 2 || steps[1].Action != "Click login" || steps[1].Data != "user/pass" || steps[1].Result != "Logged in" {
		t.Fatalf("steps = %+v", steps)
	}
}

func TestGetTestStepsReturnsEmptyForNonManualTest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[]`))
	}))
	defer srv.Close()

	client, err := NewServer(context.Background(), srv.URL, "pat", "XRAY")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	steps, err := client.GetTestSteps(context.Background(), "XRAY-2")
	if err != nil {
		t.Fatalf("GetTestSteps: %v", err)
	}
	if len(steps) != 0 {
		t.Fatalf("steps = %+v, want empty", steps)
	}
}

func TestListFoldersReturnsClearErrorOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	client, err := NewServer(context.Background(), srv.URL, "bad-pat", "XRAY")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	if _, err := client.ListFolders(context.Background()); err == nil {
		t.Fatal("expected an error for a 403 response")
	} else if !strings.Contains(err.Error(), "403") && !strings.Contains(err.Error(), "Forbidden") {
		t.Errorf("err = %v, want it to mention the failed status", err)
	}
}
