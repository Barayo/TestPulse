package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestCreateImportJobEncryptsCredentialsAndSetsCreatedBy(t *testing.T) {
	s, st := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	u := mustCreateUser(t, s, "admin@example.com", "correcthorsebatterystaple", false)
	ctx = domain.WithActor(ctx, actorFor(u))

	job, err := s.CreateImportJob(ctx, p.ID, "testrail", domain.ImportModeDryRun, map[string]string{"apiKey": "super-secret"})
	if err != nil {
		t.Fatalf("CreateImportJob: %v", err)
	}
	if job.CreatedBy != u.ID {
		t.Errorf("CreatedBy = %q, want %q", job.CreatedBy, u.ID)
	}
	if job.Status != domain.ImportJobStatusPending || job.Source != "testrail" || job.Mode != domain.ImportModeDryRun {
		t.Errorf("job = %+v, unexpected field values", job)
	}
}

func TestCreateImportJobRejectsWithoutEncryptionKey(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	u := mustCreateUser(t, s, "admin@example.com", "correcthorsebatterystaple", false)
	ctx = domain.WithActor(ctx, actorFor(u))

	if _, err := s.CreateImportJob(ctx, p.ID, "testrail", domain.ImportModeDryRun, map[string]string{"apiKey": "x"}); err == nil {
		t.Fatal("CreateImportJob without an encryption key configured succeeded, want rejected")
	}
}

func TestGetImportJobReturnsStatusReportProgress(t *testing.T) {
	s, st := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	u := mustCreateUser(t, s, "admin@example.com", "correcthorsebatterystaple", false)
	ctx = domain.WithActor(ctx, actorFor(u))

	job, err := s.CreateImportJob(ctx, p.ID, "testrail", domain.ImportModeReal, map[string]string{"apiKey": "x"})
	if err != nil {
		t.Fatalf("CreateImportJob: %v", err)
	}
	got, err := s.GetImportJob(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetImportJob: %v", err)
	}
	if got.ID != job.ID || got.Status != domain.ImportJobStatusPending {
		t.Errorf("GetImportJob = %+v, want matching pending job", got)
	}
	// domain.ImportJob has no Credentials field — a compile-time guarantee,
	// not something this assertion needs to check at runtime.
}

func TestClaimPendingImportJobRequiresScopedAgentActor(t *testing.T) {
	s, st := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	u := mustCreateUser(t, s, "admin@example.com", "correcthorsebatterystaple", false)
	humanCtx := domain.WithActor(ctx, actorFor(u))
	if _, err := s.CreateImportJob(humanCtx, p.ID, "testrail", domain.ImportModeReal, map[string]string{"apiKey": "x"}); err != nil {
		t.Fatalf("CreateImportJob: %v", err)
	}

	// A plain human actor (no ScopedProjectID) must never be able to claim
	// import work — only a per-project-scoped agent token should.
	if _, _, _, err := s.ClaimPendingImportJob(humanCtx, "testrail"); err == nil {
		t.Fatal("ClaimPendingImportJob succeeded for an unscoped human actor, want rejected")
	}
}

func TestClaimPendingImportJobOnlyClaimsScopedProjectAndDecryptsCredentials(t *testing.T) {
	s, st := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	ctx := context.Background()
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorsebatterystaple", true)
	adminCtx := domain.WithActor(ctx, actorFor(admin))

	pA, err := st.Projects.Create(ctx, "Project A", "")
	if err != nil {
		t.Fatalf("create project A: %v", err)
	}
	pB, err := st.Projects.Create(ctx, "Project B", "")
	if err != nil {
		t.Fatalf("create project B: %v", err)
	}
	if _, err := s.CreateImportJob(adminCtx, pA.ID, "testrail", domain.ImportModeReal, map[string]string{"apiKey": "project-a-secret"}); err != nil {
		t.Fatalf("CreateImportJob A: %v", err)
	}
	if _, err := s.CreateImportJob(adminCtx, pB.ID, "testrail", domain.ImportModeReal, map[string]string{"apiKey": "project-b-secret"}); err != nil {
		t.Fatalf("CreateImportJob B: %v", err)
	}

	adminActor := actorFor(admin)
	role, err := s.CreateRole(adminCtx, adminActor, domain.Role{Name: "Importer", CanRead: true, CanManageProject: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	full, _, err := s.CreateToken(adminCtx, adminActor, "testrail-agent", &pA.ID, &role.ID)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	agentActor, err := s.AuthenticateToken(ctx, full)
	if err != nil {
		t.Fatalf("AuthenticateToken: %v", err)
	}
	agentCtx := domain.WithActor(ctx, agentActor)

	job, creds, ok, err := s.ClaimPendingImportJob(agentCtx, "testrail")
	if err != nil {
		t.Fatalf("ClaimPendingImportJob: %v", err)
	}
	if !ok {
		t.Fatal("ClaimPendingImportJob ok = false, want a claimed job for project A")
	}
	if job.ProjectID != pA.ID {
		t.Errorf("claimed job ProjectID = %q, want %q (never project B's)", job.ProjectID, pA.ID)
	}
	if job.Status != domain.ImportJobStatusRunning {
		t.Errorf("claimed job Status = %q, want running", job.Status)
	}
	if creds["apiKey"] != "project-a-secret" {
		t.Errorf("decrypted credentials = %+v, want apiKey=project-a-secret", creds)
	}

	// Project A's one pending job is now claimed — a second claim finds
	// nothing more for A, and never reaches into B's.
	_, _, ok, err = s.ClaimPendingImportJob(agentCtx, "testrail")
	if err != nil {
		t.Fatalf("second ClaimPendingImportJob: %v", err)
	}
	if ok {
		t.Error("second ClaimPendingImportJob ok = true, want false (no more pending work for project A)")
	}
}

func TestReportImportJobProgressAndCompleteImportJob(t *testing.T) {
	s, st := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	u := mustCreateUser(t, s, "admin@example.com", "correcthorsebatterystaple", false)
	actorCtx := domain.WithActor(ctx, actorFor(u))

	job, err := s.CreateImportJob(actorCtx, p.ID, "testrail", domain.ImportModeReal, map[string]string{"apiKey": "x"})
	if err != nil {
		t.Fatalf("CreateImportJob: %v", err)
	}
	if err := s.ReportImportJobProgress(actorCtx, job.ID, 187, 340); err != nil {
		t.Fatalf("ReportImportJobProgress: %v", err)
	}
	got, err := s.GetImportJob(actorCtx, job.ID)
	if err != nil {
		t.Fatalf("GetImportJob: %v", err)
	}
	if got.ProgressCurrent != 187 || got.ProgressTotal != 340 {
		t.Errorf("progress = %d/%d, want 187/340", got.ProgressCurrent, got.ProgressTotal)
	}

	report := &domain.ImportReport{Counts: map[string]int{"cases": 340}}
	if err := s.CompleteImportJob(actorCtx, job.ID, domain.ImportJobStatusSucceeded, report, nil); err != nil {
		t.Fatalf("CompleteImportJob: %v", err)
	}
	got, err = s.GetImportJob(actorCtx, job.ID)
	if err != nil {
		t.Fatalf("GetImportJob after complete: %v", err)
	}
	if got.Status != domain.ImportJobStatusSucceeded || got.Report == nil || got.Report.Counts["cases"] != 340 {
		t.Errorf("completed job = %+v, want succeeded with report", got)
	}
}
