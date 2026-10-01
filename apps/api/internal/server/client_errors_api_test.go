package server_test

import "testing"

// HTTP-level scenarios for add-frontend-error-reporting —
// openspec/changes/archive/add-frontend-error-reporting/specs/.

func TestScenario_RecordClientErrorOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	callAs(t, handler, admin, "POST", "/api/v1/client-errors",
		jmap{"kind": "crash", "message": "boom", "stack": "at foo()"}, 204, nil)
}

func TestScenario_RecordClientErrorRejectsEmptyMessage(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var errBody jmap
	callAs(t, handler, admin, "POST", "/api/v1/client-errors", jmap{"kind": "crash"}, 400, &errBody)
}

func TestScenario_RecordClientErrorRequiresAuthentication(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")

	call(t, handler, "POST", "/api/v1/client-errors", jmap{"kind": "crash", "message": "boom"}, 401, nil)
}
