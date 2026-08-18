package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestInstanceSettingsGetReturnsSeededDefault(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	got, err := s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want true (seeded default)", got.PublicProjectsEnabled)
	}
}

func TestInstanceSettingsGetReturnsRunRetentionDaysDefaultingToZero(t *testing.T) {
	// design.md D8 (add-data-retention): 0 means the retention policy is off.
	s := testStore(t)
	ctx := context.Background()

	got, err := s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.RunRetentionDays != 0 {
		t.Errorf("RunRetentionDays = %d, want 0 (seeded default)", got.RunRetentionDays)
	}
}

func TestInstanceSettingsUpdateAppliesOnlyNonNilFields(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	enabled := false
	if _, err := s.InstanceSettings.Update(ctx, domain.InstanceSettingsUpdate{PublicProjectsEnabled: &enabled}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	got, err := s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want false after updating it alone", got.PublicProjectsEnabled)
	}
	if got.RunRetentionDays != 0 {
		t.Errorf("RunRetentionDays = %d, want unchanged 0 (not touched by this update)", got.RunRetentionDays)
	}

	days := 30
	if _, err := s.InstanceSettings.Update(ctx, domain.InstanceSettingsUpdate{RunRetentionDays: &days}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	got, err = s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.RunRetentionDays != 30 {
		t.Errorf("RunRetentionDays = %d, want 30", got.RunRetentionDays)
	}
	if got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want still false (not touched by this update)", got.PublicProjectsEnabled)
	}
}

func TestInstanceSettingsGetReturnsAutoArchiveInactiveDaysDefaultingToZero(t *testing.T) {
	// design.md D9 (add-data-retention): 0 means the auto-archive policy is
	// off, same convention as RunRetentionDays.
	s := testStore(t)
	ctx := context.Background()

	got, err := s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.AutoArchiveInactiveDays != 0 {
		t.Errorf("AutoArchiveInactiveDays = %d, want 0 (seeded default)", got.AutoArchiveInactiveDays)
	}
}

func TestInstanceSettingsGetReturnsColorThemeDefaultingToTeal(t *testing.T) {
	// add-color-theme-customization: 'teal' is the seeded default, matching
	// index.css's unchanged :root/.dark blocks.
	s := testStore(t)
	ctx := context.Background()

	got, err := s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ColorTheme != "teal" {
		t.Errorf("ColorTheme = %q, want \"teal\" (seeded default)", got.ColorTheme)
	}
	if got.CustomPalette != nil {
		t.Errorf("CustomPalette = %+v, want nil (seeded default)", got.CustomPalette)
	}
}

func TestInstanceSettingsUpdateAppliesColorThemeIndependently(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	theme := "indigo"
	if _, err := s.InstanceSettings.Update(ctx, domain.InstanceSettingsUpdate{ColorTheme: &theme}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	got, err := s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ColorTheme != "indigo" {
		t.Errorf("ColorTheme = %q, want \"indigo\"", got.ColorTheme)
	}
	if !got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want unchanged true (not touched by this update)", got.PublicProjectsEnabled)
	}
}

func TestInstanceSettingsUpdateAppliesCustomPaletteAndRoundTripsAllFields(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	side := domain.CustomPaletteMode{
		Background:        "#F8F7FA",
		Foreground:        "#160B2E",
		Card:              "#FFFFFF",
		Primary:           "#4514B8",
		PrimaryForeground: "#FFFFFF",
		Muted:             "#EFEDF5",
		MutedForeground:   "#605B6B",
		Accent:            "#EFEDF5",
		Border:            "#E0DCEC",
		Input:             "#E0DCEC",
	}
	palette := &domain.CustomPalette{Light: side, Dark: side}
	theme := "custom"
	if _, err := s.InstanceSettings.Update(ctx, domain.InstanceSettingsUpdate{ColorTheme: &theme, CustomPalette: palette}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	got, err := s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ColorTheme != "custom" {
		t.Errorf("ColorTheme = %q, want \"custom\"", got.ColorTheme)
	}
	if got.CustomPalette == nil || *got.CustomPalette != *palette {
		t.Errorf("CustomPalette = %+v, want %+v", got.CustomPalette, palette)
	}
}

func TestInstanceSettingsUpdateAppliesAutoArchiveInactiveDaysIndependently(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	days := 60
	if _, err := s.InstanceSettings.Update(ctx, domain.InstanceSettingsUpdate{AutoArchiveInactiveDays: &days}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	got, err := s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.AutoArchiveInactiveDays != 60 {
		t.Errorf("AutoArchiveInactiveDays = %d, want 60", got.AutoArchiveInactiveDays)
	}
	if got.RunRetentionDays != 0 {
		t.Errorf("RunRetentionDays = %d, want unchanged 0 (not touched by this update)", got.RunRetentionDays)
	}
	if !got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want unchanged true (not touched by this update)", got.PublicProjectsEnabled)
	}
}
