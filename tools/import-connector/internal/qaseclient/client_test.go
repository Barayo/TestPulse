package qaseclient

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

func requireTokenAuth(t *testing.T, r *http.Request) {
	t.Helper()
	if got := r.Header.Get("Token"); got != "token-123" {
		t.Errorf("Token header = %q, want %q", got, "token-123")
	}
}

func TestNewDefaultsBaseURL(t *testing.T) {
	c := New("", "token-123")
	if c.baseURL != "https://api.qase.io/v1" {
		t.Errorf("baseURL = %q, want the public Qase SaaS API (design.md D-Q2)", c.baseURL)
	}
}

func TestListSuites(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireTokenAuth(t, r)
		if !strings.HasPrefix(r.URL.Path, "/suites/PRJ") {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"status": true,
			"result": jmap{
				"total": 2, "filtered": 2, "count": 2,
				"entities": []jmap{
					{"id": 1, "title": "Auth", "parent_id": nil},
					{"id": 2, "title": "Login", "parent_id": 1},
				},
			},
		})
	})

	suites, err := c.ListSuites(context.Background(), "PRJ")
	if err != nil {
		t.Fatalf("ListSuites: %v", err)
	}
	if len(suites) != 2 || suites[0].Title != "Auth" || suites[1].ID != 2 {
		t.Fatalf("suites = %+v, want [Auth, Login]", suites)
	}
	if suites[0].ParentID != nil {
		t.Errorf("root suite ParentID = %v, want nil", suites[0].ParentID)
	}
	if suites[1].ParentID == nil || *suites[1].ParentID != 1 {
		t.Errorf("nested suite ParentID = %v, want 1", suites[1].ParentID)
	}
}

func TestListSuitesPaginates(t *testing.T) {
	calls := 0
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		offset := r.URL.Query().Get("offset")
		if offset == "100" {
			_ = json.NewEncoder(w).Encode(jmap{
				"status": true,
				"result": jmap{
					"total": 101, "filtered": 101, "count": 1,
					"entities": []jmap{
						{"id": 200, "title": "Checkout", "parent_id": nil},
					},
				},
			})
			return
		}
		page := make([]jmap, 100)
		for i := range page {
			page[i] = jmap{"id": i + 1, "title": "Suite", "parent_id": nil}
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"status": true,
			"result": jmap{
				"total": 101, "filtered": 101, "count": 100,
				"entities": page,
			},
		})
	})

	suites, err := c.ListSuites(context.Background(), "PRJ")
	if err != nil {
		t.Fatalf("ListSuites: %v", err)
	}
	if len(suites) != 101 {
		t.Fatalf("suites = %d, want 101 across two pages", len(suites))
	}
	if calls != 2 {
		t.Errorf("calls = %d, want 2 (paginated)", calls)
	}
	if suites[100].Title != "Checkout" {
		t.Errorf("last suite = %+v, want Checkout", suites[100])
	}
}

func TestListCasesIncludesStepsAndCustomFields(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/cases/PRJ") {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"status": true,
			"result": jmap{
				"total": 1, "filtered": 1, "count": 1,
				"entities": []jmap{
					{
						"id": 500, "suite_id": 2, "title": "Login with valid credentials",
						"steps": []jmap{
							{"action": "Enter valid username/password", "expected_result": "User is logged in"},
						},
						"custom_fields": []jmap{
							{"id": 7, "value": "Manual"},
						},
					},
				},
			},
		})
	})

	cases, err := c.ListCases(context.Background(), "PRJ")
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(cases) != 1 {
		t.Fatalf("cases = %d, want 1", len(cases))
	}
	got := cases[0]
	if got.ID != 500 || got.SuiteID != 2 || got.Title != "Login with valid credentials" {
		t.Fatalf("case = %+v, unexpected core fields", got)
	}
	if len(got.Steps) != 1 || got.Steps[0].Action != "Enter valid username/password" || got.Steps[0].Expected != "User is logged in" {
		t.Fatalf("case steps = %+v, want one mapped step", got.Steps)
	}
	if len(got.CustomFields) != 1 || got.CustomFields[0].ID != 7 || got.CustomFields[0].Value != "Manual" {
		t.Fatalf("case custom fields = %+v, want [{7 Manual}]", got.CustomFields)
	}
}

func TestListCaseFields(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/custom_fields") {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("entity") != "case" {
			t.Fatalf("expected entity=case filter, got query %q", r.URL.RawQuery)
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"status": true,
			"result": jmap{
				"total": 2, "filtered": 2, "count": 2,
				"entities": []jmap{
					{"id": 7, "title": "Automation Type", "entity": "case", "type": "selectbox"},
					{"id": 8, "title": "Owner", "entity": "case", "type": "user"},
				},
			},
		})
	})

	fields, err := c.ListCaseFields(context.Background())
	if err != nil {
		t.Fatalf("ListCaseFields: %v", err)
	}
	if len(fields) != 2 || fields[0].Title != "Automation Type" || fields[0].Type != "selectbox" {
		t.Fatalf("fields = %+v, unexpected", fields)
	}
}

func TestErrorResponseSurfacesStatus(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	if _, err := c.ListSuites(context.Background(), "PRJ"); err == nil {
		t.Fatal("expected an error for a 401 response")
	}
}

type jmap = map[string]any
