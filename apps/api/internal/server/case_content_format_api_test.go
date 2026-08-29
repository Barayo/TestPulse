package server_test

import (
	"fmt"
	"testing"
)

// HTTP-level scenarios for add-case-authoring-formats, mapped to the
// "Test case creation" requirement in openspec/specs/test-authoring/spec.md.

func TestScenario_CaseDefaultsToStepsFormatOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var c struct{ Content jmap }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "Login works", "steps": []jmap{{"action": "open page"}}}, 201, &c)
	if c.Content["format"] != "steps" {
		t.Errorf("Content.format = %v, want steps", c.Content["format"])
	}
}

func TestScenario_CreateFreeTextCaseOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var c struct{ Content jmap }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "Explore checkout", "format": "text", "description": "Walk through checkout as a guest."}, 201, &c)
	if c.Content["format"] != "text" {
		t.Errorf("Content.format = %v, want text", c.Content["format"])
	}
	if c.Content["description"] != "Walk through checkout as a guest." {
		t.Errorf("Content.description = %v, want the narrative", c.Content["description"])
	}
}

func TestScenario_CreateGherkinCaseOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	source := "Given a user\nWhen they log in\nThen they see the dashboard"
	var c struct {
		Key     string
		Content jmap
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "Login BDD", "format": "gherkin", "gherkinSource": source}, 201, &c)
	if c.Content["format"] != "gherkin" {
		t.Errorf("Content.format = %v, want gherkin", c.Content["format"])
	}
	if c.Content["gherkinSource"] != source {
		t.Errorf("Content.gherkinSource = %v, want %q", c.Content["gherkinSource"], source)
	}

	var got struct{ Content jmap }
	call(t, h, "GET", "/api/v1/cases/"+c.Key, nil, 200, &got)
	if got.Content["gherkinSource"] != source {
		t.Errorf("Content.gherkinSource after GET = %v, want %q", got.Content["gherkinSource"], source)
	}
}

func TestScenario_InvalidCaseFormatRejectedOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var errBody struct{ Error string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "Bad format", "format": "bogus"}, 400, &errBody)
	if errBody.Error == "" {
		t.Error("expected a validation error naming the invalid format")
	}
}
