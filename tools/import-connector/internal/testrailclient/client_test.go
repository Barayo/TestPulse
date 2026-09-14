package testrailclient

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
	c := New(srv.URL, "bot@example.com", "api-key-123")
	return c, srv
}

func requireBasicAuth(t *testing.T, r *http.Request) {
	t.Helper()
	email, key, ok := r.BasicAuth()
	if !ok || email != "bot@example.com" || key != "api-key-123" {
		t.Errorf("request missing/incorrect Basic auth: ok=%v email=%q key=%q", ok, email, key)
	}
}

func TestListSuites(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		requireBasicAuth(t, r)
		if !strings.Contains(r.URL.RawQuery, "/api/v2/get_suites/1") {
			t.Fatalf("unexpected request: %s", r.URL.String())
		}
		_ = json.NewEncoder(w).Encode([]jmap{
			{"id": 1, "name": "Master"},
			{"id": 2, "name": "Regression"},
		})
	})

	suites, err := c.ListSuites(context.Background(), 1)
	if err != nil {
		t.Fatalf("ListSuites: %v", err)
	}
	if len(suites) != 2 || suites[0].Name != "Master" || suites[1].ID != 2 {
		t.Fatalf("suites = %+v, want [Master, Regression]", suites)
	}
}

func TestListSectionsPaginates(t *testing.T) {
	calls := 0
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.RawQuery, "/api/v2/get_sections/1") || !strings.Contains(r.URL.RawQuery, "suite_id=2") {
			t.Fatalf("unexpected request: %s", r.URL.String())
		}
		calls++
		if strings.Contains(r.URL.RawQuery, "offset=250") {
			_ = json.NewEncoder(w).Encode(jmap{
				"offset": 250, "limit": 250, "size": 1,
				"_links": jmap{"next": nil, "prev": "..."},
				"sections": []jmap{
					{"id": 3, "name": "Checkout", "parent_id": nil},
				},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"offset": 0, "limit": 250, "size": 250,
			"_links": jmap{"next": "/api/v2/get_sections/1&suite_id=2&offset=250", "prev": nil},
			"sections": func() []jmap {
				page := make([]jmap, 250)
				for i := range page {
					page[i] = jmap{"id": i + 100, "name": "Login", "parent_id": nil}
				}
				return page
			}(),
		})
	})

	sections, err := c.ListSections(context.Background(), 1, 2)
	if err != nil {
		t.Fatalf("ListSections: %v", err)
	}
	if len(sections) != 251 {
		t.Fatalf("sections = %d, want 251 across two pages", len(sections))
	}
	if calls != 2 {
		t.Errorf("calls = %d, want 2 (paginated)", calls)
	}
	if sections[250].Name != "Checkout" {
		t.Errorf("last section = %+v, want Checkout", sections[250])
	}
}

func TestListSectionsNestedParentID(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(jmap{
			"offset": 0, "limit": 250, "size": 2,
			"_links": jmap{"next": nil},
			"sections": []jmap{
				{"id": 10, "name": "Auth", "parent_id": nil},
				{"id": 11, "name": "Login", "parent_id": 10},
			},
		})
	})

	sections, err := c.ListSections(context.Background(), 1, 2)
	if err != nil {
		t.Fatalf("ListSections: %v", err)
	}
	if sections[0].ParentID != nil {
		t.Errorf("root section ParentID = %v, want nil", sections[0].ParentID)
	}
	if sections[1].ParentID == nil || *sections[1].ParentID != 10 {
		t.Errorf("nested section ParentID = %v, want 10", sections[1].ParentID)
	}
}

func TestListCasesIncludesStepsAndCustomFields(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.RawQuery, "/api/v2/get_cases/1") || !strings.Contains(r.URL.RawQuery, "suite_id=2") {
			t.Fatalf("unexpected request: %s", r.URL.String())
		}
		_ = json.NewEncoder(w).Encode(jmap{
			"offset": 0, "limit": 250, "size": 1,
			"_links": jmap{"next": nil},
			"cases": []jmap{
				{
					"id": 500, "section_id": 11, "title": "Login with valid credentials",
					"custom_steps_separated": []jmap{
						{"content": "Enter valid username/password", "expected": "User is logged in"},
					},
					"custom_automation_type": "Manual",
					"custom_preconditions":   "User has an account",
				},
			},
		})
	})

	cases, err := c.ListCases(context.Background(), 1, 2)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(cases) != 1 {
		t.Fatalf("cases = %d, want 1", len(cases))
	}
	got := cases[0]
	if got.ID != 500 || got.SectionID != 11 || got.Title != "Login with valid credentials" {
		t.Fatalf("case = %+v, unexpected core fields", got)
	}
	if len(got.Steps) != 1 || got.Steps[0].Content != "Enter valid username/password" || got.Steps[0].Expected != "User is logged in" {
		t.Fatalf("case steps = %+v, want one mapped step", got.Steps)
	}
	if got.CustomFields["custom_automation_type"] != "Manual" || got.CustomFields["custom_preconditions"] != "User has an account" {
		t.Fatalf("case custom fields = %+v, want automation_type/preconditions captured raw", got.CustomFields)
	}
	if _, present := got.CustomFields["custom_steps_separated"]; present {
		t.Errorf("custom fields leaked the already-mapped steps key: %+v", got.CustomFields)
	}
}

// A Dropdown/Integer/Checkbox field's raw TestRail value is a JSON number
// or bool, not a string — spec.md requires unmappable fields be *named in
// the report*, which is only possible if the client captures them at all
// instead of silently skipping non-string JSON values.
func TestListCasesCapturesNonStringCustomFieldValues(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(jmap{
			"offset": 0, "limit": 250, "size": 1,
			"_links": jmap{"next": nil},
			"cases": []jmap{
				{
					"id": 501, "section_id": 11, "title": "Case with numeric/bool fields",
					"custom_priority_score": 9223372036854775807,
					"custom_is_smoke":       true,
					"custom_unset_field":    nil,
				},
			},
		})
	})

	cases, err := c.ListCases(context.Background(), 1, 2)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	got := cases[0].CustomFields
	if got["custom_priority_score"] != "9223372036854775807" {
		t.Errorf("custom_priority_score = %q, want the large integer preserved exactly, no float rounding", got["custom_priority_score"])
	}
	if got["custom_is_smoke"] != "true" {
		t.Errorf("custom_is_smoke = %q, want \"true\"", got["custom_is_smoke"])
	}
	if _, present := got["custom_unset_field"]; present {
		t.Errorf("custom_unset_field = %+v, want absent (JSON null means no value set)", got)
	}
}

func TestListCaseFields(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.RawQuery, "/api/v2/get_case_fields") {
			t.Fatalf("unexpected request: %s", r.URL.String())
		}
		_ = json.NewEncoder(w).Encode([]jmap{
			{"system_name": "custom_automation_type", "label": "Automation Type", "type_id": 6},
			{"system_name": "custom_preconditions", "label": "Preconditions", "type_id": 3},
		})
	})

	fields, err := c.ListCaseFields(context.Background())
	if err != nil {
		t.Fatalf("ListCaseFields: %v", err)
	}
	if len(fields) != 2 || fields[0].SystemName != "custom_automation_type" || fields[0].TypeID != 6 {
		t.Fatalf("fields = %+v, unexpected", fields)
	}
}

func TestErrorResponseSurfacesStatus(t *testing.T) {
	c, _ := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	if _, err := c.ListSuites(context.Background(), 1); err == nil {
		t.Fatal("expected an error for a 401 response")
	}
}

type jmap = map[string]any
