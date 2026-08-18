package server_test

import "testing"

// HTTP-level scenarios for add-color-theme-customization —
// openspec/changes/add-color-theme-customization/specs/.

func validCustomPaletteBody() jmap {
	side := jmap{
		"background": "#F8F7FA", "foreground": "#160B2E", "card": "#FFFFFF",
		"primary": "#4514B8", "primaryForeground": "#FFFFFF", "muted": "#EFEDF5",
		"mutedForeground": "#605B6B", "accent": "#EFEDF5", "border": "#E0DCEC", "input": "#E0DCEC",
	}
	return jmap{"light": side, "dark": side}
}

func TestScenario_SaveCustomPaletteOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var settings jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings",
		jmap{"colorTheme": "custom", "customPalette": validCustomPaletteBody()}, 200, &settings)
	if settings["colorTheme"] != "custom" {
		t.Errorf("colorTheme = %v, want \"custom\"", settings["colorTheme"])
	}
}

func TestScenario_SaveCustomPaletteWithInvalidHexIsRejectedAndChangesNothing(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	badPalette := validCustomPaletteBody()
	badPalette["dark"].(jmap)["primary"] = "not-a-hex-color"
	var errBody jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings",
		jmap{"colorTheme": "custom", "customPalette": badPalette}, 400, &errBody)

	var settings jmap
	callAs(t, handler, admin, "GET", "/api/v1/instance-settings", nil, 200, &settings)
	if settings["colorTheme"] != "teal" {
		t.Errorf("colorTheme = %v after a rejected update, want unchanged \"teal\"", settings["colorTheme"])
	}
}
