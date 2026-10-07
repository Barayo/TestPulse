package main

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func seededService(t *testing.T) *service.Service {
	t.Helper()
	svc := service.New(store.New(testutil.Pool(t, "seeddemo")))
	if err := svc.BootstrapAdmin(context.Background(), "admin@example.com", "correcthorse1"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	return svc
}

func TestSeedBancaMovilRecordsResultsWithoutActorRequiredError(t *testing.T) {
	svc := seededService(t)
	if err := seedBancaMovil(context.Background(), svc); err != nil {
		t.Fatalf("seedBancaMovil: %v", err)
	}
}

func TestSeedDesktopAppSucceeds(t *testing.T) {
	svc := seededService(t)
	if err := seedDesktopApp(context.Background(), svc); err != nil {
		t.Fatalf("seedDesktopApp: %v", err)
	}
}
