package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestUpdateInstanceSettingsPersistsAndAudits(t *testing.T) {
	// design.md D8 (add-data-retention): UpdateInstanceSettings generalizes
	// the old single-field SetPublicProjectsEnabled into a partial update
	// covering both settable fields.
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	enabled := false
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{PublicProjectsEnabled: &enabled}); err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}

	got, err := s.InstanceSettings(ctx)
	if err != nil {
		t.Fatalf("InstanceSettings: %v", err)
	}
	if got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want false", got.PublicProjectsEnabled)
	}

	history, err := s.AuditHistory(ctx, "instance_settings", "")
	if err != nil {
		t.Fatalf("AuditHistory: %v", err)
	}
	if len(history) != 1 || history[0].Action != "update" {
		t.Errorf("audit history = %+v, want one 'update' entry", history)
	}
}

func TestUpdateInstanceSettingsAppliesAutoArchiveInactiveDaysIndependently(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-aad@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	days := 90
	got, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{AutoArchiveInactiveDays: &days})
	if err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}
	if got.AutoArchiveInactiveDays != 90 {
		t.Errorf("AutoArchiveInactiveDays = %d, want 90", got.AutoArchiveInactiveDays)
	}
	if got.RunRetentionDays != 0 {
		t.Errorf("RunRetentionDays = %d, want unchanged 0", got.RunRetentionDays)
	}
	if !got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want unchanged true", got.PublicProjectsEnabled)
	}
}

func TestUpdateInstanceSettingsRejectsNegativeAutoArchiveInactiveDays(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-aad-neg@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	days := -1
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{AutoArchiveInactiveDays: &days}); err == nil {
		t.Fatal("UpdateInstanceSettings(-1): want error, got nil")
	}
}

func TestUpdateInstanceSettingsAppliesOnlyRunRetentionDays(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	days := 45
	got, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{RunRetentionDays: &days})
	if err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}
	if got.RunRetentionDays != 45 {
		t.Errorf("RunRetentionDays = %d, want 45", got.RunRetentionDays)
	}
	if !got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want unchanged true", got.PublicProjectsEnabled)
	}
}

func TestUpdateInstanceSettingsRejectsUnknownColorTheme(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-theme-bad@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	theme := "sunset"
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{ColorTheme: &theme}); err == nil {
		t.Fatal(`UpdateInstanceSettings(ColorTheme: "sunset"): want error, got nil`)
	}
}

func TestUpdateInstanceSettingsAppliesColorTheme(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-theme-ok@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	theme := "forest"
	got, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{ColorTheme: &theme})
	if err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}
	if got.ColorTheme != "forest" {
		t.Errorf("ColorTheme = %q, want \"forest\"", got.ColorTheme)
	}
}

func TestUpdateInstanceSettingsRejectsUnknownDefaultLandingView(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-landing-bad@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	view := "kanban"
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{DefaultLandingView: &view}); err == nil {
		t.Fatal(`UpdateInstanceSettings(DefaultLandingView: "kanban"): want error, got nil`)
	}
}

func TestUpdateInstanceSettingsAppliesDefaultLandingView(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-landing-ok@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	view := "library"
	got, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{DefaultLandingView: &view})
	if err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}
	if got.DefaultLandingView != "library" {
		t.Errorf("DefaultLandingView = %q, want \"library\"", got.DefaultLandingView)
	}
}

func TestInstanceSettingsDefaultsToDashboardLandingView(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-landing-default@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	got, err := s.InstanceSettings(ctx)
	if err != nil {
		t.Fatalf("InstanceSettings: %v", err)
	}
	if got.DefaultLandingView != "dashboard" {
		t.Errorf("DefaultLandingView = %q, want \"dashboard\" (factory default, preserves existing behavior)", got.DefaultLandingView)
	}
}

func validCustomPalette() *domain.CustomPalette {
	side := domain.CustomPaletteMode{
		Background: "#F8F7FA", Foreground: "#160B2E", Card: "#FFFFFF",
		Primary: "#4514B8", PrimaryForeground: "#FFFFFF", Muted: "#EFEDF5",
		MutedForeground: "#605B6B", Accent: "#EFEDF5", Border: "#E0DCEC", Input: "#E0DCEC",
	}
	return &domain.CustomPalette{Light: side, Dark: side}
}

func TestUpdateInstanceSettingsRejectsUnknownDefaultLanguage(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-lang-bad@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	lang := "klingon"
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{DefaultLanguage: &lang}); err == nil {
		t.Fatal(`UpdateInstanceSettings(DefaultLanguage: "klingon"): want error, got nil`)
	}
}

func TestUpdateInstanceSettingsAppliesDefaultLanguageAndPerUserLanguageEnabled(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-lang-ok@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	lang := "fr"
	enabled := true
	got, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{DefaultLanguage: &lang, PerUserLanguageEnabled: &enabled})
	if err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}
	if got.DefaultLanguage != "fr" {
		t.Errorf("DefaultLanguage = %q, want \"fr\"", got.DefaultLanguage)
	}
	if !got.PerUserLanguageEnabled {
		t.Errorf("PerUserLanguageEnabled = %v, want true", got.PerUserLanguageEnabled)
	}
}

func TestUpdateInstanceSettingsRejectsMalformedCustomPaletteHex(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-palette-bad@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	theme := "custom"
	palette := validCustomPalette()
	palette.Dark.Primary = "not-a-hex-color"
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{ColorTheme: &theme, CustomPalette: palette}); err == nil {
		t.Fatal("UpdateInstanceSettings with malformed custom palette hex: want error, got nil")
	}

	got, err := s.InstanceSettings(ctx)
	if err != nil {
		t.Fatalf("InstanceSettings: %v", err)
	}
	if got.ColorTheme == "custom" {
		t.Error("ColorTheme = \"custom\", want unchanged — rejected update must not partially apply")
	}
}

func TestUpdateInstanceSettingsAppliesValidCustomPalette(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-palette-ok@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	theme := "custom"
	palette := validCustomPalette()
	got, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{ColorTheme: &theme, CustomPalette: palette})
	if err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}
	if got.ColorTheme != "custom" || got.CustomPalette == nil || *got.CustomPalette != *palette {
		t.Errorf("got ColorTheme=%q CustomPalette=%+v, want \"custom\" and %+v", got.ColorTheme, got.CustomPalette, palette)
	}
}

func TestInstanceSettingsDefaultsToPublicProjectsEnabled(t *testing.T) {
	s := testService(t)
	got, err := s.InstanceSettings(context.Background())
	if err != nil {
		t.Fatalf("InstanceSettings: %v", err)
	}
	if !got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want true (seeded default)", got.PublicProjectsEnabled)
	}
}

func TestUpdateInstanceSettingsRejectsSessionTimeoutBelowMinimum(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-sto-low@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	days := 0
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{SessionTimeoutDays: &days}); err == nil {
		t.Fatal("UpdateInstanceSettings(sessionTimeoutDays=0): want error, got nil")
	}
}

func TestUpdateInstanceSettingsRejectsSessionTimeoutAboveMaximum(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-sto-high@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	days := 91
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{SessionTimeoutDays: &days}); err == nil {
		t.Fatal("UpdateInstanceSettings(sessionTimeoutDays=91): want error, got nil")
	}
}

func TestUpdateInstanceSettingsAcceptsSessionTimeoutInBounds(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-sto-ok@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	days := 7
	got, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{SessionTimeoutDays: &days})
	if err != nil {
		t.Fatalf("UpdateInstanceSettings(sessionTimeoutDays=7): %v", err)
	}
	if got.SessionTimeoutDays != 7 {
		t.Errorf("SessionTimeoutDays = %d, want 7", got.SessionTimeoutDays)
	}
}
