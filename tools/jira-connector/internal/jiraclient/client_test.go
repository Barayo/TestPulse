package jiraclient

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSearchIssuesBatchesKeysIntoOneRequest(t *testing.T) {
	var requestCount int
	var gotJQL string
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		gotAuth = r.Header.Get("Authorization")
		var body struct {
			JQL    string   `json:"jql"`
			Fields []string `json:"fields"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotJQL = body.JQL
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issues": []map[string]any{
				{"key": "PROJ-1", "fields": map[string]any{"summary": "Fix login redirect", "status": map[string]any{"name": "In Progress"}}},
				{"key": "PROJ-2", "fields": map[string]any{"summary": "Add logout button", "status": map[string]any{"name": "Done"}}},
			},
		})
	}))
	defer srv.Close()

	c := New(srv.URL, "bot@example.com", "api-token-123")
	issues, err := c.SearchIssues(t.Context(), []string{"PROJ-1", "PROJ-2"})
	if err != nil {
		t.Fatalf("SearchIssues: %v", err)
	}

	if requestCount != 1 {
		t.Fatalf("requestCount = %d, want 1 (batched into a single request)", requestCount)
	}
	if !strings.Contains(gotJQL, "PROJ-1") || !strings.Contains(gotJQL, "PROJ-2") {
		t.Errorf("JQL = %q, want it to reference both keys", gotJQL)
	}
	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("bot@example.com:api-token-123"))
	if gotAuth != wantAuth {
		t.Errorf("Authorization header = %q, want %q", gotAuth, wantAuth)
	}

	if len(issues) != 2 {
		t.Fatalf("issues = %d, want 2", len(issues))
	}
	if issues[0].Key != "PROJ-1" || issues[0].Summary != "Fix login redirect" || issues[0].Status != "In Progress" {
		t.Errorf("issues[0] = %+v", issues[0])
	}
	if issues[1].Key != "PROJ-2" || issues[1].Status != "Done" {
		t.Errorf("issues[1] = %+v", issues[1])
	}
}

func TestSearchIssuesEmptyKeysReturnsEmptyWithoutARequest(t *testing.T) {
	var requestCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
	}))
	defer srv.Close()

	c := New(srv.URL, "bot@example.com", "api-token-123")
	issues, err := c.SearchIssues(t.Context(), nil)
	if err != nil {
		t.Fatalf("SearchIssues: %v", err)
	}
	if len(issues) != 0 {
		t.Errorf("issues = %+v, want empty", issues)
	}
	if requestCount != 0 {
		t.Errorf("requestCount = %d, want 0 (no request for an empty batch)", requestCount)
	}
}

func TestSearchIssuesServerErrorIsReturned(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	c := New(srv.URL, "bot@example.com", "bad-token")
	_, err := c.SearchIssues(t.Context(), []string{"PROJ-1"})
	if err == nil {
		t.Fatal("expected an error for a 401 response")
	}
}
