package server_test

import (
	"fmt"
	"testing"
)

// HTTP-level coverage for add-unit-test-inventory's auto-created,
// lean unit test surface — openspec/changes/add-unit-test-inventory/
// specs/unit-test-inventory/spec.md.

func nativeJUnitTestReport(testcases ...string) string {
	body := ""
	for _, name := range testcases {
		body += fmt.Sprintf(`<testcase classname="tests.test_mod" name="%s" time="0.1"/>`, name)
	}
	return fmt.Sprintf(`<testsuites><testsuite name="pytest">%s</testsuite></testsuites>`, body)
}

func TestScenario_UnitTestResultsImportRequiresNoTestPulseProperties(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Backend"}, 201, &p)

	var out struct{ Imported, Created, Updated int }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/unit-test-results/import", p.Key),
		jmap{"report": nativeJUnitTestReport("test_alpha", "test_beta")}, 201, &out)
	if out.Imported != 2 || out.Created != 2 || out.Updated != 0 {
		t.Errorf("import outcome = %+v, want Imported=2 Created=2 Updated=0", out)
	}

	var list struct {
		Items      []jmap
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/unit-test-results", p.Key), nil, 200, &list)
	if len(list.Items) != 2 {
		t.Fatalf("list items = %d, want 2", len(list.Items))
	}
}

func TestScenario_UnitTestResultsImportRejectsMalformedReport(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Backend"}, 201, &p)

	var errBody jmap
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/unit-test-results/import", p.Key),
		jmap{"report": "not xml at all"}, 400, &errBody)
}

func TestScenario_UnitTestResultsListFiltersByVerdictAndHistoryIsBounded(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Backend"}, 201, &p)

	report := `<testsuites><testsuite name="pytest">` +
		`<testcase classname="tests.test_mod" name="test_pass" time="0.1"/>` +
		`<testcase classname="tests.test_mod" name="test_fail" time="0.1"><failure message="x">trace</failure></testcase>` +
		`</testsuite></testsuites>`
	var out jmap
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/unit-test-results/import", p.Key), jmap{"report": report}, 201, &out)

	var list struct{ Items []jmap }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/unit-test-results?verdict=failed", p.Key), nil, 200, &list)
	if len(list.Items) != 1 || list.Items[0]["name"] != "test_fail" {
		t.Fatalf("filtered list = %+v, want only test_fail", list.Items)
	}

	var history struct{ Results []jmap }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/unit-test-results/tests.test_mod::test_fail/history", p.Key), nil, 200, &history)
	if len(history.Results) != 1 || history.Results[0]["verdict"] != "failed" {
		t.Fatalf("history = %+v, want one failed result", history.Results)
	}
}

func TestScenario_UnitTestResultsImportRequiresRunCreatePermission(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Backend"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var readOnlyRole jmap
	callAs(t, handler, admin, "POST", "/api/v1/roles", jmap{"name": "Read Only", "canRead": true}, 201, &readOnlyRole)
	roleID, _ := readOnlyRole["id"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "readonly@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+userID,
		jmap{"roleId": roleID}, 204, nil)
	readOnlyCookie := loginCookie(t, handler, "readonly@example.com", "correcthorse")

	callAs(t, handler, readOnlyCookie, "GET", fmt.Sprintf("/api/v1/projects/%s/unit-test-results", projectKey), nil, 200, nil)

	var errBody jmap
	callAs(t, handler, readOnlyCookie, "POST", fmt.Sprintf("/api/v1/projects/%s/unit-test-results/import", projectKey),
		jmap{"report": nativeJUnitTestReport("test_alpha")}, 403, &errBody)
}
