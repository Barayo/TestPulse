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
