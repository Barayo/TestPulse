package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// HTTP-level scenarios for add-case-reference-attachments —
// openspec/changes/add-case-reference-attachments/specs/case-reference-attachments/spec.md.

func caseAttachmentFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "attachmentfile", "testdata", name))
	if err != nil {
		t.Fatalf("reading attachmentfile testdata/%s: %v", name, err)
	}
	return data
}

func uploadCaseFileAs(t *testing.T, h http.Handler, cookie, path, filename string, data []byte, wantStatus int, out any) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
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

func setupCaseAttachmentFixture(t *testing.T, h http.Handler) string {
	t.Helper()
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Case Attachments"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "case one"}, 201, &c)
	return c.Key
}

func TestScenario_UploadImageToCase(t *testing.T) {
	h := apiServer(t)
	caseKey := setupCaseAttachmentFixture(t, h)

	var att jmap
	uploadCaseFileAs(t, h, "", fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "mock.png", caseAttachmentFixture(t, "sample.png"), 201, &att)
	if att["contentType"] != "image/png" {
		t.Errorf("contentType = %v, want image/png", att["contentType"])
	}

	var list []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), nil, 200, &list)
	if len(list) != 1 {
		t.Fatalf("case attachments = %d, want 1", len(list))
	}
}

func TestScenario_UploadPDFToCase(t *testing.T) {
	h := apiServer(t)
	caseKey := setupCaseAttachmentFixture(t, h)

	var att jmap
	uploadCaseFileAs(t, h, "", fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "spec.pdf", caseAttachmentFixture(t, "sample.pdf"), 201, &att)
	if att["contentType"] != "application/pdf" {
		t.Errorf("contentType = %v, want application/pdf", att["contentType"])
	}
}

func TestScenario_UploadTextFileToCase(t *testing.T) {
	h := apiServer(t)
	caseKey := setupCaseAttachmentFixture(t, h)

	var att jmap
	uploadCaseFileAs(t, h, "", fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "steps.txt", caseAttachmentFixture(t, "sample.txt"), 201, &att)
	if att["contentType"] != "text/plain" {
		t.Errorf("contentType = %v, want text/plain", att["contentType"])
	}
}

func TestScenario_UploadLogFileToCase(t *testing.T) {
	h := apiServer(t)
	caseKey := setupCaseAttachmentFixture(t, h)

	var att jmap
	uploadCaseFileAs(t, h, "", fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "run.log", caseAttachmentFixture(t, "sample.log"), 201, &att)
	if att["contentType"] != "text/plain" {
		t.Errorf("contentType = %v, want text/plain", att["contentType"])
	}
}

func TestScenario_OversizedCaseAttachmentRejected(t *testing.T) {
	h := apiServer(t)
	caseKey := setupCaseAttachmentFixture(t, h)

	var errBody jmap
	uploadCaseFileAs(t, h, "", fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "too-large.jpg", caseAttachmentFixture(t, "too-large.jpg"), 400, &errBody)
}

func TestScenario_UnsupportedCaseAttachmentFormatRejected(t *testing.T) {
	h := apiServer(t)
	caseKey := setupCaseAttachmentFixture(t, h)

	var errBody jmap
	uploadCaseFileAs(t, h, "", fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "garbage.bin", caseAttachmentFixture(t, "binary-garbage.bin"), 400, &errBody)
}

func TestScenario_UploadCaseAttachmentRequiresCaseEditPermission(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var viewerRole jmap
	callAs(t, handler, admin, "POST", "/api/v1/roles",
		jmap{"name": "Viewer (case-attach-test)", "rank": 5, "canRead": true}, 201, &viewerRole)
	viewerRoleID, _ := viewerRole["id"].(string)

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Case Attachments"}, 201, &p)
	projectKey, _ := p["key"].(string)
	var c jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", projectKey), jmap{"title": "case one"}, 201, &c)
	caseKey, _ := c["key"].(string)

	var viewer jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "viewer@example.com", "password": "correcthorse"}, 201, &viewer)
	viewerID, _ := viewer["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+viewerID,
		jmap{"roleId": viewerRoleID}, 204, nil)
	viewerCookie := loginCookie(t, handler, "viewer@example.com", "correcthorse")

	var errBody jmap
	uploadCaseFileAs(t, handler, viewerCookie, fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "mock.png", caseAttachmentFixture(t, "sample.png"), 403, &errBody)
}

func TestScenario_GetAndDeleteCaseAttachment(t *testing.T) {
	h := apiServer(t)
	caseKey := setupCaseAttachmentFixture(t, h)
	var att jmap
	uploadCaseFileAs(t, h, "", fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "mock.png", caseAttachmentFixture(t, "sample.png"), 201, &att)
	attachmentID, _ := att["id"].(string)

	req := httptest.NewRequest("GET", "/api/v1/case-attachments/"+attachmentID, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET case attachment = %d, body: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", ct)
	}
	etag := rec.Header().Get("ETag")
	if etag == "" {
		t.Fatal("expected an ETag header")
	}

	call(t, h, "DELETE", "/api/v1/case-attachments/"+attachmentID, nil, 204, nil)

	var errBody jmap
	call(t, h, "GET", "/api/v1/case-attachments/"+attachmentID, nil, 404, &errBody)
}

func TestScenario_GetCasePDFAttachmentServesInline(t *testing.T) {
	h := apiServer(t)
	caseKey := setupCaseAttachmentFixture(t, h)
	var att jmap
	uploadCaseFileAs(t, h, "", fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "spec.pdf", caseAttachmentFixture(t, "sample.pdf"), 201, &att)
	attachmentID, _ := att["id"].(string)

	req := httptest.NewRequest("GET", "/api/v1/case-attachments/"+attachmentID, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET case attachment = %d, body: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/pdf" {
		t.Errorf("Content-Type = %q, want application/pdf", ct)
	}
	cd := rec.Header().Get("Content-Disposition")
	if cd == "" {
		t.Fatal("expected a Content-Disposition header for a PDF")
	}
	if !bytes.Contains([]byte(cd), []byte("inline")) {
		t.Errorf("Content-Disposition = %q, want inline", cd)
	}
	// A PDF served inline is rendered by the browser's own viewer on the API
	// origin — a sandboxed CSP stops any active content inside a malicious
	// PDF from running with that origin's privileges (e.g. session cookies).
	if csp := rec.Header().Get("Content-Security-Policy"); !bytes.Contains([]byte(csp), []byte("sandbox")) {
		t.Errorf("Content-Security-Policy = %q, want a sandbox directive", csp)
	}
}

func TestScenario_DeleteCaseAttachmentRequiresCaseEditPermission(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var viewerRole jmap
	callAs(t, handler, admin, "POST", "/api/v1/roles",
		jmap{"name": "Viewer (case-attach-delete-test)", "rank": 5, "canRead": true}, 201, &viewerRole)
	viewerRoleID, _ := viewerRole["id"].(string)

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Case Attachments"}, 201, &p)
	projectKey, _ := p["key"].(string)
	var c jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", projectKey), jmap{"title": "case one"}, 201, &c)
	caseKey, _ := c["key"].(string)

	var att jmap
	uploadCaseFileAs(t, handler, admin, fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "mock.png", caseAttachmentFixture(t, "sample.png"), 201, &att)
	attachmentID, _ := att["id"].(string)

	var viewer jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "viewer2@example.com", "password": "correcthorse"}, 201, &viewer)
	viewerID, _ := viewer["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+viewerID,
		jmap{"roleId": viewerRoleID}, 204, nil)
	viewerCookie := loginCookie(t, handler, "viewer2@example.com", "correcthorse")

	// The viewer can read the attachment...
	callAs(t, handler, viewerCookie, "GET", "/api/v1/case-attachments/"+attachmentID, nil, 200, nil)
	// ...but cannot delete it.
	var errBody jmap
	callAs(t, handler, viewerCookie, "DELETE", "/api/v1/case-attachments/"+attachmentID, nil, 403, &errBody)
}
