package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// uploadCSVImport POSTs a multipart CSV import request (file + folderId
// fields, matching openapi.yaml's import-csv request shape).
func uploadCSVImport(t *testing.T, h http.Handler, cookie, path, folderID, csvBody string, wantStatus int, out any) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", "cases.csv")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte(csvBody)); err != nil {
		t.Fatal(err)
	}
	if err := mw.WriteField("folderId", folderID); err != nil {
		t.Fatal(err)
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest("POST", path, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != wantStatus {
		t.Fatalf("POST %s = %d, want %d; body: %s", path, rec.Code, wantStatus, rec.Body.String())
	}
	if out != nil {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("decoding %s response: %v", path, err)
		}
	}
}

func rootFolderID(t *testing.T, h http.Handler, cookie, projectKey string) string {
	t.Helper()
	var folders struct {
		Items []struct {
			ID             string `json:"id"`
			ParentFolderID string `json:"parentFolderId"`
		} `json:"items"`
	}
	callAs(t, h, cookie, "GET", "/api/v1/projects/"+projectKey+"/folders", nil, 200, &folders)
	for _, f := range folders.Items {
		if f.ParentFolderID == "" {
			return f.ID
		}
	}
	t.Fatalf("project %s has no root folder", projectKey)
	return ""
}

func TestScenario_ImportCSVRejectedForTesterAllowedForContributor(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "CSV Import HTTP"}, 201, &p)
	projectKey, _ := p["key"].(string)
	root := rootFolderID(t, handler, admin, projectKey)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "tester@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)
	testerCookie := loginCookie(t, handler, "tester@example.com", "correcthorse")

	uploadCSVImport(t, handler, testerCookie, fmt.Sprintf("/api/v1/projects/%s/cases/import-csv", projectKey),
		root, "Title\nCase A\n", 403, nil)

	var result jmap
	uploadCSVImport(t, handler, admin, fmt.Sprintf("/api/v1/projects/%s/cases/import-csv", projectKey),
		root, "Title\nCase A\n", 201, &result)
	if result["created"] != float64(1) {
		t.Errorf("created = %v, want 1", result["created"])
	}
	if newFields, ok := result["newFields"].([]any); !ok || len(newFields) != 0 {
		t.Errorf("newFields = %v, want an empty array", result["newFields"])
	}
}

func TestScenario_ImportCSVMixedValidityReportsCreatedCountAndEveryProblem(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "CSV Import Mixed"}, 201, &p)
	projectKey, _ := p["key"].(string)
	root := rootFolderID(t, handler, admin, projectKey)

	csv := "Title,Priority\n" +
		"Case A,high\n" +
		",high\n" +
		"Case C,not-a-priority\n"

	var result jmap
	uploadCSVImport(t, handler, admin, fmt.Sprintf("/api/v1/projects/%s/cases/import-csv", projectKey),
		root, csv, 201, &result)
	if result["created"] != float64(1) {
		t.Fatalf("created = %v, want 1", result["created"])
	}
	problems, ok := result["problems"].([]any)
	if !ok || len(problems) != 2 {
		t.Fatalf("problems = %+v, want 2 named problems", result["problems"])
	}
}

func TestScenario_ImportCSVReportsAutoCreatedCustomFieldNames(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "CSV Import New Fields HTTP"}, 201, &p)
	projectKey, _ := p["key"].(string)
	root := rootFolderID(t, handler, admin, projectKey)

	var result jmap
	uploadCSVImport(t, handler, admin, fmt.Sprintf("/api/v1/projects/%s/cases/import-csv", projectKey),
		root, "Title,Browser\nCase A,Chrome\n", 201, &result)

	newFields, ok := result["newFields"].([]any)
	if !ok || len(newFields) != 1 || newFields[0] != "Browser" {
		t.Fatalf("newFields = %v, want [Browser]", result["newFields"])
	}
}

func TestScenario_ExportCSVWithNoFolderIDIncludesWholeProject(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "CSV Export HTTP"}, 201, &p)
	projectKey, _ := p["key"].(string)
	root := rootFolderID(t, handler, admin, projectKey)

	var folder jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/folders", jmap{"name": "Auth", "parentFolderId": root}, 201, &folder)
	folderID, _ := folder["id"].(string)

	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/cases", jmap{"title": "Root case", "folderId": root}, 201, nil)
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/cases", jmap{"title": "Auth case", "folderId": folderID}, 201, nil)

	req := httptest.NewRequest("GET", "/api/v1/projects/"+projectKey+"/cases/export-csv", nil)
	req.Header.Set("Cookie", admin)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("export-csv = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/csv" {
		t.Errorf("Content-Type = %q, want text/csv", ct)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "Root case") || !strings.Contains(body, "Auth case") {
		t.Errorf("export body = %q, want both cases included (no folderId scoping)", body)
	}
}

func TestScenario_ExportCSVScopedToFolderID(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "CSV Export Scoped HTTP"}, 201, &p)
	projectKey, _ := p["key"].(string)
	root := rootFolderID(t, handler, admin, projectKey)

	var folder jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/folders", jmap{"name": "Auth", "parentFolderId": root}, 201, &folder)
	folderID, _ := folder["id"].(string)

	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/cases", jmap{"title": "Root case", "folderId": root}, 201, nil)
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/cases", jmap{"title": "Auth case", "folderId": folderID}, 201, nil)

	req := httptest.NewRequest("GET", "/api/v1/projects/"+projectKey+"/cases/export-csv?folderId="+folderID, nil)
	req.Header.Set("Cookie", admin)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("export-csv = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if strings.Contains(body, "Root case") {
		t.Errorf("export body = %q, want Root case excluded (scoped to Auth folder)", body)
	}
	if !strings.Contains(body, "Auth case") {
		t.Errorf("export body = %q, want Auth case included", body)
	}
}

func TestScenario_ImportCSVMissingFileReturnsBadRequest(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "CSV Import Malformed"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("folderId", "not-even-a-real-folder")
	_ = mw.Close()

	req := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/projects/%s/cases/import-csv", projectKey), &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Cookie", admin)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("missing file field = %d, want 400; body: %s", rec.Code, rec.Body.String())
	}
}
