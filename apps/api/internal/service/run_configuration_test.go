package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func TestCreateRunWithConfiguration(t *testing.T) {
	s := service.New(store.New(testutil.Pool(t, "run_configuration_service")))
	ctx := context.Background()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "cross-browser", Configuration: "Chrome"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	if run.Configuration == nil || *run.Configuration != "Chrome" {
		t.Fatalf("Configuration = %v, want \"Chrome\"", run.Configuration)
	}

	got, err := s.GetRun(ctx, run.ID)
	if err != nil {
		t.Fatalf("GetRun: %v", err)
	}
	if got.Configuration == nil || *got.Configuration != "Chrome" {
		t.Fatalf("GetRun Configuration = %v, want \"Chrome\"", got.Configuration)
	}
}

func TestCreateRunWithoutConfiguration(t *testing.T) {
	s := service.New(store.New(testutil.Pool(t, "run_configuration_service")))
	ctx := context.Background()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "no-config"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	if run.Configuration != nil {
		t.Fatalf("Configuration = %v, want nil", *run.Configuration)
	}
}

func TestCoverageMatrix_PivotsRunsAndCasesWithGaps(t *testing.T) {
	st := store.New(testutil.Pool(t, "run_configuration_service"))
	s := service.New(st)
	ctx := context.Background()

	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	rel, err := st.Releases.Create(ctx, p.ID, "2026.1", "", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("create release: %v", err)
	}
	plan, err := st.TestPlans.Create(ctx, p.ID, rel.ID, "Cross-browser", "")
	if err != nil {
		t.Fatalf("create test plan: %v", err)
	}

	login, err := st.Cases.Create(ctx, p.ID, "", domain.CaseContent{Title: "Login works", Steps: []domain.Step{{Action: "a", Expected: "b"}}}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create login case: %v", err)
	}
	logout, err := st.Cases.Create(ctx, p.ID, "", domain.CaseContent{Title: "Logout works", Steps: []domain.Step{{Action: "a", Expected: "b"}}}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create logout case: %v", err)
	}

	// Chrome run covers both cases; the no-configuration run covers only
	// login — logout is the deliberate gap for that run's column.
	chromeRun, err := s.CreateRun(ctx, p.ID, service.RunInput{
		Name: "Chrome run", TestPlanID: plan.ID, Configuration: "Chrome",
		CaseIDs: []string{login.ID, logout.ID},
	})
	if err != nil {
		t.Fatalf("create chrome run: %v", err)
	}
	unconfiguredRun, err := s.CreateRun(ctx, p.ID, service.RunInput{
		Name: "Smoke run", TestPlanID: plan.ID,
		CaseIDs: []string{login.ID},
	})
	if err != nil {
		t.Fatalf("create unconfigured run: %v", err)
	}

	matrix, err := s.CoverageMatrix(ctx, plan.ID)
	if err != nil {
		t.Fatalf("CoverageMatrix: %v", err)
	}

	if len(matrix.Configurations) != 2 {
		t.Fatalf("len(Configurations) = %d, want 2", len(matrix.Configurations))
	}
	labelByRunKey := map[string]string{}
	for _, c := range matrix.Configurations {
		labelByRunKey[c.RunKey] = c.Label
	}
	if labelByRunKey[chromeRun.Key] != "Chrome" {
		t.Errorf("chrome run label = %q, want %q", labelByRunKey[chromeRun.Key], "Chrome")
	}
	if labelByRunKey[unconfiguredRun.Key] != "Smoke run" {
		t.Errorf("unconfigured run label = %q, want its Name %q", labelByRunKey[unconfiguredRun.Key], "Smoke run")
	}

	if len(matrix.Cases) != 2 {
		t.Fatalf("len(Cases) = %d, want 2 (union of both runs' cases)", len(matrix.Cases))
	}
	var logoutRow *domain.CoverageMatrixCase
	for i := range matrix.Cases {
		if matrix.Cases[i].CaseKey == logout.Key {
			logoutRow = &matrix.Cases[i]
		}
	}
	if logoutRow == nil {
		t.Fatalf("logout case missing from matrix.Cases")
	}
	if _, ok := logoutRow.Cells[chromeRun.Key]; !ok {
		t.Errorf("logout row missing cell for chrome run, which covers it")
	}
	if _, ok := logoutRow.Cells[unconfiguredRun.Key]; ok {
		t.Errorf("logout row has a cell for the unconfigured run, which doesn't cover it — want gap (absent)")
	}
}
