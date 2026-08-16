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
