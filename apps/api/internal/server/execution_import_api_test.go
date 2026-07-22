package server_test

import (
	"fmt"
	"testing"
)

// HTTP-level scenarios for add-execution-import's bulk import endpoint —
// openspec/changes/add-execution-import/specs/execution-import/spec.md.

func TestScenario_ImportEveryTestMatches(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2 struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Login Service"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 201, &c2)

	report := fmt.Sprintf(`<testsuites><testsuite name="pytest">`+
		`<testcase name="test_one"><properties><property name="testpulse_case_key" value="%s"/></properties></testcase>`+
		`<testcase name="test_two"><properties><property name="testpulse_case_key" value="%s"/></properties></testcase>`+
		`</testsuite></testsuites>`, c1.Key, c2.Key)

	var run struct {
		Key  string
		Name string
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/imports", p.Key),
		jmap{"format": "junit-xml", "report": report}, 201, &run)
	if run.Key == "" || run.Name != "pytest" {
		t.Errorf("imported run = %+v", run)
	}

	var items []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	if len(items) != 2 {
		t.Errorf("run items = %d, want 2", len(items))
	}
}

func TestScenario_ImportSomeTestsUnmatched(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Payments"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "known"}, 201, &c)

	report := fmt.Sprintf(`<testsuites><testsuite name="pytest">`+
		`<testcase name="test_known"><properties><property name="testpulse_case_key" value="%s"/></properties></testcase>`+
		`<testcase name="test_unknown"><properties><property name="testpulse_case_key" value="PAY-999"/></properties></testcase>`+
		`</testsuite></testsuites>`, c.Key)

	var out struct {
		Run       jmap
		Message   string
		Matched   int
		Unmatched []jmap
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/imports", p.Key),
		jmap{"format": "junit-xml", "report": report}, 207, &out)
	if out.Matched != 1 {
		t.Errorf("matched = %d, want 1", out.Matched)
	}
	if len(out.Unmatched) != 1 || out.Unmatched[0]["caseKey"] != "PAY-999" {
		t.Errorf("unmatched = %+v", out.Unmatched)
	}
	if out.Run["key"] == "" {
		t.Errorf("run in 207 body = %+v, want a created run", out.Run)
	}
}

func TestScenario_ImportMalformedReportRejected(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Broken"}, 201, &p)

	var errBody struct{ Error string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/imports", p.Key),
		jmap{"format": "junit-xml", "report": "not xml"}, 400, &errBody)
	if errBody.Error == "" {
		t.Error("expected a validation error message")
	}
}

func TestScenario_ImportUnknownProjectRejected(t *testing.T) {
	h := apiServer(t)
	call(t, h, "POST", "/api/v1/projects/NOPE/imports", jmap{"format": "junit-xml", "report": "<testsuite/>"}, 404, nil)
}
