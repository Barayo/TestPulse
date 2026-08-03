package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func avatarFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "avatarimage", "testdata", name))
	if err != nil {
		t.Fatalf("reading avatarimage testdata/%s: %v", name, err)
	}
	return data
}

// uploadAvatarAs POSTs a multipart avatar upload — callAs (identity_api_test.go)
// is JSON-body only, so this is a dedicated helper for the one endpoint that
// isn't.
func uploadAvatarAs(t *testing.T, h http.Handler, cookie, filename string, data []byte, wantStatus int, out any) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("avatar", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest("POST", "/api/v1/users/me/avatar", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != wantStatus {
		t.Fatalf("POST /api/v1/users/me/avatar = %d, want %d; body: %s", rec.Code, wantStatus, rec.Body.String())
	}
	if out != nil {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("decoding upload response: %v", err)
		}
	}
}

func TestScenario_UploadOwnAvatar(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var updated jmap
	uploadAvatarAs(t, h, cookie, "sample.jpg", avatarFixture(t, "sample.jpg"), 200, &updated)
	if updated["avatarKey"] != "custom" {
		t.Errorf("avatarKey = %v, want \"custom\"", updated["avatarKey"])
	}
}

func TestScenario_UploadOwnAvatarRejectsInvalidFile(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var errBody jmap
	uploadAvatarAs(t, h, cookie, "not-an-image.txt", avatarFixture(t, "not-an-image.txt"), 400, &errBody)
}

func TestScenario_UploadOwnAvatarRejectsOversizedFile(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var errBody jmap
	uploadAvatarAs(t, h, cookie, "too-large.jpg", avatarFixture(t, "too-large.jpg"), 400, &errBody)
}

func TestScenario_UploadAvatarRequiresAuthentication(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")

	var errBody jmap
	uploadAvatarAs(t, h, "", "sample.jpg", avatarFixture(t, "sample.jpg"), 401, &errBody)
}

func TestScenario_RemoveOwnAvatar(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")
	var uploaded jmap
	uploadAvatarAs(t, h, cookie, "sample.jpg", avatarFixture(t, "sample.jpg"), 200, &uploaded)
	userID, _ := uploaded["id"].(string)

	var removed jmap
	callAs(t, h, cookie, "DELETE", "/api/v1/users/me/avatar", nil, 200, &removed)
	if removed["avatarKey"] != nil {
		t.Errorf("avatarKey after remove = %v, want nil", removed["avatarKey"])
	}

	var errBody jmap
	callAs(t, h, cookie, "GET", "/api/v1/users/"+userID+"/avatar", nil, 404, &errBody)
}

func TestScenario_GetUserAvatarServesImageWithCaching(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")
	var uploaded jmap
	uploadAvatarAs(t, h, cookie, "sample.jpg", avatarFixture(t, "sample.jpg"), 200, &uploaded)
	userID, _ := uploaded["id"].(string)

	req := httptest.NewRequest("GET", "/api/v1/users/"+userID+"/avatar", nil)
	req.Header.Set("Cookie", cookie)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET avatar = %d, body: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("Content-Type = %q, want image/jpeg", ct)
	}
	etag := rec.Header().Get("ETag")
	if etag == "" {
		t.Fatal("expected an ETag header")
	}
	if len(rec.Body.Bytes()) == 0 {
		t.Error("expected non-empty image body")
	}

	// A conditional request with a matching ETag gets 304, no body.
	req2 := httptest.NewRequest("GET", "/api/v1/users/"+userID+"/avatar", nil)
	req2.Header.Set("Cookie", cookie)
	req2.Header.Set("If-None-Match", etag)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusNotModified {
		t.Errorf("conditional GET = %d, want 304", rec2.Code)
	}
}

func TestScenario_GetUserAvatarNotFoundWhenNoneSet(t *testing.T) {
	h, svc := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	cookie := loginCookie(t, h, "admin@example.com", "correcthorse")
	users, err := svc.ListUsers(context.Background())
	if err != nil || len(users) == 0 {
		t.Fatalf("ListUsers: %v, %v", users, err)
	}

	var errBody jmap
	callAs(t, h, cookie, "GET", "/api/v1/users/"+users[0].ID+"/avatar", nil, 404, &errBody)
}
