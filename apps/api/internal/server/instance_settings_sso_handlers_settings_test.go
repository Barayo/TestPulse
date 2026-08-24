package server_test

import "testing"

func TestScenario_PatchInstanceSettingsSavesValidSSOConfigAndActivatesManager(t *testing.T) {
	idp := newFakeIdP(t)
	h, admin, manager := ssoSettingsServer(t)

	if manager.Get() != nil {
		t.Fatal("manager should start with no authenticator")
	}

	var settings jmap
	callAs(t, h, admin, "PATCH", "/api/v1/instance-settings", jmap{
		"oidcIssuer": idp.server.URL, "oidcClientId": "testpulse", "oidcClientSecret": "shh",
	}, 200, &settings)

	if settings["oidcIssuer"] != idp.server.URL || settings["oidcClientId"] != "testpulse" {
		t.Errorf("settings = %+v", settings)
	}
	if settings["oidcClientSecretSet"] != true {
		t.Error("oidcClientSecretSet should be true")
	}
	if _, present := settings["oidcClientSecret"]; present {
		t.Error("oidcClientSecret must never be returned by a read")
	}
	if manager.Get() == nil {
		t.Error("manager should hold a live authenticator after a successful save")
	}
}

func TestScenario_PatchInstanceSettingsRejectsUnreachableIssuerBeforePersisting(t *testing.T) {
	h, admin, manager := ssoSettingsServer(t)

	var errBody struct{ Error string }
	callAs(t, h, admin, "PATCH", "/api/v1/instance-settings", jmap{
		"oidcIssuer": "https://this-issuer-does-not-exist.invalid", "oidcClientId": "testpulse", "oidcClientSecret": "shh",
	}, 400, &errBody)

	if manager.Get() != nil {
		t.Error("manager should remain unset after a rejected save")
	}

	var settings jmap
	callAs(t, h, admin, "GET", "/api/v1/instance-settings", nil, 200, &settings)
	if settings["oidcIssuer"] != "" && settings["oidcIssuer"] != nil {
		t.Errorf("oidcIssuer = %v, want unset (rejected save must not persist)", settings["oidcIssuer"])
	}
}

func TestScenario_PatchInstanceSettingsOmittingClientSecretKeepsExisting(t *testing.T) {
	idp := newFakeIdP(t)
	h, admin, _ := ssoSettingsServer(t)

	callAs(t, h, admin, "PATCH", "/api/v1/instance-settings", jmap{
		"oidcIssuer": idp.server.URL, "oidcClientId": "testpulse", "oidcClientSecret": "shh",
	}, 200, nil)

	groupClaim := "groups"
	var settings jmap
	callAs(t, h, admin, "PATCH", "/api/v1/instance-settings", jmap{"oidcGroupClaim": groupClaim}, 200, &settings)
	if settings["oidcClientSecretSet"] != true {
		t.Error("oidcClientSecretSet should remain true after an update that omits the secret")
	}
	if settings["oidcGroupClaim"] != "groups" {
		t.Errorf("oidcGroupClaim = %v, want groups", settings["oidcGroupClaim"])
	}
}

func TestScenario_PatchInstanceSettingsDisableSsoClearsManager(t *testing.T) {
	idp := newFakeIdP(t)
	h, admin, manager := ssoSettingsServer(t)

	callAs(t, h, admin, "PATCH", "/api/v1/instance-settings", jmap{
		"oidcIssuer": idp.server.URL, "oidcClientId": "testpulse", "oidcClientSecret": "shh",
	}, 200, nil)
	if manager.Get() == nil {
		t.Fatal("expected manager to be set after the first save")
	}

	var settings jmap
	callAs(t, h, admin, "PATCH", "/api/v1/instance-settings", jmap{"disableSso": true}, 200, &settings)
	if settings["oidcClientSecretSet"] != false {
		t.Error("oidcClientSecretSet should be false after disableSso")
	}
	if manager.Get() != nil {
		t.Error("manager should be cleared after disableSso")
	}
}

func TestScenario_PatchInstanceSettingsRejectsSSOOnlyWithoutFullConfig(t *testing.T) {
	h, admin, _ := ssoSettingsServer(t)
	callAs(t, h, admin, "PATCH", "/api/v1/instance-settings", jmap{"oidcOnly": true}, 400, nil)
}
