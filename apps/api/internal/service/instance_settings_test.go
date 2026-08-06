package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestSetPublicProjectsEnabledPersistsAndAudits(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	if err := s.SetPublicProjectsEnabled(ctx, false); err != nil {
		t.Fatalf("SetPublicProjectsEnabled: %v", err)
	}

	got, err := s.InstanceSettings(ctx)
	if err != nil {
		t.Fatalf("InstanceSettings: %v", err)
	}
	if got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want false", got.PublicProjectsEnabled)
	}

	history, err := s.AuditHistory(ctx, "instance_settings", "public_projects_enabled")
	if err != nil {
		t.Fatalf("AuditHistory: %v", err)
	}
	if len(history) != 1 || history[0].Action != "update" {
		t.Errorf("audit history = %+v, want one 'update' entry", history)
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
