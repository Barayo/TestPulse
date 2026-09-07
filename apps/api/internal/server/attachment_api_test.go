package server_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// HTTP-level scenarios for add-run-item-screenshot-attachments —
// openspec/changes/add-run-item-screenshot-attachments/specs/run-result-attachments/spec.md.

func attachmentFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "attachmentimage", "testdata", name))
	if err != nil {
		t.Fatalf("reading attachmentimage testdata/%s: %v", name, err)
	}
	return data
}

// uploadFileAs POSTs a multipart file upload to an arbitrary attachment
// endpoint (staging or direct-attach) — the request body shape both share.
func uploadFileAs(t *testing.T, h http.Handler, cookie, path, filename string, data []byte, wantStatus int, out any) {
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

// setupAttachmentFixture creates a project/case/run/item via HTTP as admin
// and returns the item id, ready for verdict recording and attachments.
func setupAttachmentFixture(t *testing.T, h http.Handler) string {
	t.Helper()
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Screenshots"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "case one"}, 201, &c)
	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	return items.Items[0].ID
}

func TestScenario_StageAttachmentBeforeVerdictExists(t *testing.T) {
	h := apiServer(t)
	itemID := setupAttachmentFixture(t, h)

	var att jmap
	uploadFileAs(t, h, "", fmt.Sprintf("/api/v1/items/%s/attachments", itemID), "shot.png", attachmentFixture(t, "sample.png"), 201, &att)
	if att["resultId"] != nil {
		t.Errorf("resultId = %v, want absent (unlinked)", att["resultId"])
	}
	if att["contentType"] != "image/png" {
		t.Errorf("contentType = %v, want image/png", att["contentType"])
	}

	var staged []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/items/%s/attachments", itemID), nil, 200, &staged)
	if len(staged) != 1 {
		t.Fatalf("staged attachments = %d, want 1", len(staged))
	}
}

func TestScenario_AttachDirectlyToExistingResult(t *testing.T) {
	h := apiServer(t)
	itemID := setupAttachmentFixture(t, h)
	var res jmap
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", itemID), jmap{"actor": "ana", "verdict": "failed"}, 201, &res)
	resultID, _ := res["id"].(string)

	var att jmap
	uploadFileAs(t, h, "", fmt.Sprintf("/api/v1/results/%s/attachments", resultID), "shot.png", attachmentFixture(t, "sample.jpg"), 201, &att)
	if att["resultId"] != resultID {
		t.Errorf("resultId = %v, want %q", att["resultId"], resultID)
	}

	var list []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/results/%s/attachments", resultID), nil, 200, &list)
	if len(list) != 1 {
		t.Fatalf("result attachments = %d, want 1", len(list))
	}
}

func TestScenario_OversizedAttachmentRejected(t *testing.T) {
	h := apiServer(t)
	itemID := setupAttachmentFixture(t, h)

	var errBody jmap
	uploadFileAs(t, h, "", fmt.Sprintf("/api/v1/items/%s/attachments", itemID), "too-large.jpg", attachmentFixture(t, "too-large.jpg"), 400, &errBody)
}

func TestScenario_UnsupportedAttachmentFormatRejected(t *testing.T) {
	h := apiServer(t)
	itemID := setupAttachmentFixture(t, h)

	var errBody jmap
	uploadFileAs(t, h, "", fmt.Sprintf("/api/v1/items/%s/attachments", itemID), "not-an-image.txt", attachmentFixture(t, "not-an-image.txt"), 400, &errBody)
}

func TestScenario_StageAttachmentRequiresAuthentication(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin@example.com", "correcthorse")
	var p, c struct{ Key string }
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Screenshots"}, 201, &p)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "case one"}, 201, &c)
	var run struct{ Key string }
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items struct{ Items []struct{ ID string } }
	callAs(t, h, admin, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)

	var errBody jmap
	uploadFileAs(t, h, "", fmt.Sprintf("/api/v1/items/%s/attachments", items.Items[0].ID), "shot.png", attachmentFixture(t, "sample.png"), 401, &errBody)
}

func TestScenario_RecordResultLinksStagedAttachments(t *testing.T) {
	h := apiServer(t)
	itemID := setupAttachmentFixture(t, h)

	var att1, att2 jmap
	uploadFileAs(t, h, "", fmt.Sprintf("/api/v1/items/%s/attachments", itemID), "shot1.png", attachmentFixture(t, "sample.png"), 201, &att1)
	uploadFileAs(t, h, "", fmt.Sprintf("/api/v1/items/%s/attachments", itemID), "shot2.png", attachmentFixture(t, "sample.png"), 201, &att2)

	var res jmap
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", itemID), jmap{
		"actor": "ana", "verdict": "failed",
		"attachmentIds": []string{att1["id"].(string), att2["id"].(string)},
	}, 201, &res)

	attachments, _ := res["attachments"].([]any)
	if len(attachments) != 2 {
		t.Fatalf("result attachments = %d, want 2; body: %+v", len(attachments), res)
	}
}

func TestScenario_RecordResultRejectsAttachmentFromDifferentItem(t *testing.T) {
	h := apiServer(t)
	itemID := setupAttachmentFixture(t, h)
	otherItemID := setupAttachmentFixture(t, h)

	var staged jmap
	uploadFileAs(t, h, "", fmt.Sprintf("/api/v1/items/%s/attachments", otherItemID), "shot.png", attachmentFixture(t, "sample.png"), 201, &staged)

	var errBody jmap
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", itemID), jmap{
		"actor": "ana", "verdict": "failed",
		"attachmentIds": []string{staged["id"].(string)},
	}, 400, &errBody)
}

func TestScenario_RecordResultWithInlineAttachment(t *testing.T) {
	h := apiServer(t)
	itemID := setupAttachmentFixture(t, h)
	data := base64.StdEncoding.EncodeToString(attachmentFixture(t, "sample.png"))

	var res jmap
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", itemID), jmap{
		"actor": "ci", "verdict": "failed",
		"attachments": []jmap{{"filename": "shot.png", "contentType": "application/octet-stream", "data": data}},
	}, 201, &res)

	attachments, _ := res["attachments"].([]any)
	if len(attachments) != 1 {
		t.Fatalf("result attachments = %d, want 1; body: %+v", len(attachments), res)
	}
	first, _ := attachments[0].(map[string]any)
	if first["contentType"] != "image/png" {
		t.Errorf("contentType = %v, want image/png (sniffed, not client-declared)", first["contentType"])
	}
}

func TestScenario_GetAndDeleteAttachment(t *testing.T) {
	h := apiServer(t)
	itemID := setupAttachmentFixture(t, h)
	var att jmap
	uploadFileAs(t, h, "", fmt.Sprintf("/api/v1/items/%s/attachments", itemID), "shot.png", attachmentFixture(t, "sample.png"), 201, &att)
	attachmentID, _ := att["id"].(string)

	req := httptest.NewRequest("GET", "/api/v1/attachments/"+attachmentID, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET attachment = %d, body: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", ct)
	}
	etag := rec.Header().Get("ETag")
	if etag == "" {
		t.Fatal("expected an ETag header")
	}
	if len(rec.Body.Bytes()) == 0 {
		t.Error("expected non-empty image body")
	}

	req2 := httptest.NewRequest("GET", "/api/v1/attachments/"+attachmentID, nil)
	req2.Header.Set("If-None-Match", etag)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusNotModified {
		t.Errorf("conditional GET = %d, want 304", rec2.Code)
	}

	call(t, h, "DELETE", "/api/v1/attachments/"+attachmentID, nil, 204, nil)

	var errBody jmap
	call(t, h, "GET", "/api/v1/attachments/"+attachmentID, nil, 404, &errBody)
}

func TestScenario_DeleteAttachmentRequiresRunRecordResultPermission(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var viewerRole jmap
	callAs(t, handler, admin, "POST", "/api/v1/roles",
		jmap{"name": "Viewer (http-test)", "rank": 5, "canRead": true}, 201, &viewerRole)
	viewerRoleID, _ := viewerRole["id"].(string)

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Screenshots"}, 201, &p)
	projectKey, _ := p["key"].(string)
	var c jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", projectKey), jmap{"title": "case one"}, 201, &c)
	caseKey, _ := c["key"].(string)
	var run jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", projectKey), jmap{"name": "sprint 1", "caseKeys": []string{caseKey}}, 201, &run)
	runKey, _ := run["key"].(string)
	var items struct{ Items []jmap }
	callAs(t, handler, admin, "GET", fmt.Sprintf("/api/v1/runs/%s/items", runKey), nil, 200, &items)
	itemID, _ := items.Items[0]["id"].(string)

	var att jmap
	uploadFileAs(t, handler, admin, fmt.Sprintf("/api/v1/items/%s/attachments", itemID), "shot.png", attachmentFixture(t, "sample.png"), 201, &att)
	attachmentID, _ := att["id"].(string)

	var viewer jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "viewer@example.com", "password": "correcthorse"}, 201, &viewer)
	viewerID, _ := viewer["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+viewerID,
		jmap{"roleId": viewerRoleID}, 204, nil)
	viewerCookie := loginCookie(t, handler, "viewer@example.com", "correcthorse")

	// The viewer can read the attachment...
	callAs(t, handler, viewerCookie, "GET", "/api/v1/attachments/"+attachmentID, nil, 200, nil)
	// ...but cannot delete it.
	var errBody jmap
	callAs(t, handler, viewerCookie, "DELETE", "/api/v1/attachments/"+attachmentID, nil, 403, &errBody)
}

func TestScenario_ImportWithInlineAttachmentsKeyedByCaseKey(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2 struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Screenshots Import"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 201, &c2)

	report := fmt.Sprintf(`<testsuites><testsuite name="pytest">`+
		`<testcase name="test_one"><properties><property name="testpulse_case_key" value="%s"/></properties></testcase>`+
		`<testcase name="test_two"><properties><property name="testpulse_case_key" value="%s"/></properties></testcase>`+
		`</testsuite></testsuites>`, c1.Key, c2.Key)
	data := base64.StdEncoding.EncodeToString(attachmentFixture(t, "sample.png"))

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/imports", p.Key), jmap{
		"format": "junit-xml", "report": report,
		"attachments": []jmap{{"caseKey": c1.Key, "filename": "failure.png", "contentType": "image/png", "data": data}},
	}, 201, &run)

	var itemsResp struct {
		Items []struct {
			ID      string `json:"id"`
			CaseKey string `json:"caseKey"`
		}
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &itemsResp)
	var withShot, without string
	for _, it := range itemsResp.Items {
		if it.CaseKey == c1.Key {
			withShot = it.ID
		} else {
			without = it.ID
		}
	}

	var results1 []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/items/%s/results", withShot), nil, 200, &results1)
	if len(results1) != 1 {
		t.Fatalf("results(c1) = %d, want 1", len(results1))
	}
	if a, _ := results1[0]["attachments"].([]any); len(a) != 1 {
		t.Fatalf("attachments(c1) = %+v, want 1", results1[0]["attachments"])
	}

	var results2 []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/items/%s/results", without), nil, 200, &results2)
	if len(results2) != 1 {
		t.Fatalf("results(c2) = %d, want 1", len(results2))
	}
	if a, _ := results2[0]["attachments"].([]any); len(a) != 0 {
		t.Fatalf("attachments(c2) = %+v, want none", results2[0]["attachments"])
	}
}
