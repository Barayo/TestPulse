package server_test

import "testing"

// HTTP-level scenarios for add-session-timeout-setting.

func TestScenario_PatchInstanceSettingsRoundTripsSessionTimeoutDays(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var got jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"sessionTimeoutDays": 7}, 200, &got)
	if got["sessionTimeoutDays"] != float64(7) {
		t.Errorf("sessionTimeoutDays = %v, want 7", got["sessionTimeoutDays"])
	}

	callAs(t, handler, admin, "GET", "/api/v1/instance-settings", nil, 200, &got)
	if got["sessionTimeoutDays"] != float64(7) {
		t.Errorf("sessionTimeoutDays after GET = %v, want 7", got["sessionTimeoutDays"])
	}
}

func TestScenario_GetInstanceSettingsDefaultsSessionTimeoutDaysTo30(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var got jmap
	callAs(t, handler, admin, "GET", "/api/v1/instance-settings", nil, 200, &got)
	if got["sessionTimeoutDays"] != float64(30) {
		t.Errorf("sessionTimeoutDays = %v, want 30 (seeded default)", got["sessionTimeoutDays"])
	}
}

func TestScenario_PatchInstanceSettingsRejectsSessionTimeoutBelowMinimum(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"sessionTimeoutDays": 0}, 400, nil)

	var got jmap
	callAs(t, handler, admin, "GET", "/api/v1/instance-settings", nil, 200, &got)
	if got["sessionTimeoutDays"] != float64(30) {
		t.Errorf("sessionTimeoutDays after rejected PATCH = %v, want unchanged 30", got["sessionTimeoutDays"])
	}
}

func TestScenario_PatchInstanceSettingsRejectsSessionTimeoutAboveMaximum(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"sessionTimeoutDays": 91}, 400, nil)
}
