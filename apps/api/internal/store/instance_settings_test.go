package store_test

import (
	"context"
	"testing"
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

func TestInstanceSettingsSetPublicProjectsEnabledPersists(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	if err := s.InstanceSettings.SetPublicProjectsEnabled(ctx, false); err != nil {
		t.Fatalf("SetPublicProjectsEnabled: %v", err)
	}

	got, err := s.InstanceSettings.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.PublicProjectsEnabled {
		t.Errorf("PublicProjectsEnabled = %v, want false after Set", got.PublicProjectsEnabled)
	}
}
