package server_test

import (
	"fmt"
	"testing"
)

// API integration tests for add-parameterized-cases.

func TestScenario_CreateParameterizedCaseOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var c struct {
		Key     string
		Content struct {
			Parameters struct {
				Columns []string
				Rows    []map[string]string
			}
		}
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{
		"title":  "Login",
		"format": "steps",
		"steps":  []jmap{{"action": "Enter {username}", "expected": "{username} is logged in"}},
		"parameters": jmap{
			"columns": []string{"Name", "username"},
			"rows": []jmap{
				{"Name": "valid", "username": "admin@example.com"},
				{"Name": "invalid", "username": "nobody@example.com"},
			},
		},
	}, 201, &c)
	if len(c.Content.Parameters.Rows) != 2 || c.Content.Parameters.Columns[0] != "Name" {
		t.Fatalf("created case parameters = %+v, want 2 rows with Name-first columns", c.Content.Parameters)
	}

	var got struct {
		Content struct {
			Parameters struct {
				Rows []map[string]string
			}
		}
	}
	call(t, h, "GET", "/api/v1/cases/"+c.Key, nil, 200, &got)
	if len(got.Content.Parameters.Rows) != 2 {
		t.Fatalf("Parameters after GET = %+v, want 2 rows", got.Content.Parameters)
	}
}

func TestScenario_UnmatchedPlaceholderRejectedOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{
		"title":  "Login",
		"format": "steps",
		"steps":  []jmap{{"action": "Enter {password}"}},
		"parameters": jmap{
			"columns": []string{"Name", "username"},
			"rows":    []jmap{{"Name": "valid", "username": "admin@example.com"}},
		},
	}, 400, nil)
}

func TestScenario_AddParameterizedCaseToRunExpandsOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var c struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{
		"title":  "Login",
		"format": "steps",
		"steps":  []jmap{{"action": "Enter {username}"}},
		"parameters": jmap{
			"columns": []string{"Name", "username"},
			"rows": []jmap{
				{"Name": "valid", "username": "admin@example.com"},
				{"Name": "invalid", "username": "nobody@example.com"},
			},
		},
	}, 201, &c)

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "run", "caseKeys": []string{c.Key}}, 201, &run)

	var itemsPage struct {
		Items []struct {
			TestName    string
			TestDataRow map[string]string `json:"testDataRow"`
			Content     struct {
				Steps []struct{ Action string }
			}
		}
	}
	call(t, h, "GET", "/api/v1/runs/"+run.Key+"/items", nil, 200, &itemsPage)
	if len(itemsPage.Items) != 2 {
		t.Fatalf("items = %d, want 2 (one per row)", len(itemsPage.Items))
	}
	byName := map[string]string{}
	for _, it := range itemsPage.Items {
		byName[it.TestName] = it.Content.Steps[0].Action
	}
	if byName["valid"] != "Enter admin@example.com" {
		t.Errorf("valid row step = %q, want substituted", byName["valid"])
	}
	if byName["invalid"] != "Enter nobody@example.com" {
		t.Errorf("invalid row step = %q, want substituted", byName["invalid"])
	}

	// addRunItem on the same parameterized case against a fresh run
	// returns one id per row.
	var run2 struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run2"}, 201, &run2)
	var added struct {
		Ids []string `json:"ids"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/items", run2.Key), jmap{"caseKey": c.Key}, 201, &added)
	if len(added.Ids) != 2 {
		t.Fatalf("addRunItem ids = %d, want 2", len(added.Ids))
	}
}

func TestScenario_OrdinaryCaseStillProducesOneItemOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var c struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "Ordinary"}, 201, &c)

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "run", "caseKeys": []string{c.Key}}, 201, &run)

	var itemsPage struct {
		Items []struct {
			TestDataRow map[string]string `json:"testDataRow"`
		}
	}
	call(t, h, "GET", "/api/v1/runs/"+run.Key+"/items", nil, 200, &itemsPage)
	if len(itemsPage.Items) != 1 {
		t.Fatalf("items = %d, want exactly 1", len(itemsPage.Items))
	}
	if itemsPage.Items[0].TestDataRow != nil {
		t.Errorf("TestDataRow = %+v, want nil", itemsPage.Items[0].TestDataRow)
	}
}
