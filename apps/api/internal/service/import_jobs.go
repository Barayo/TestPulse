package service

import (
	"context"
	"encoding/json"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// CreateImportJob stores the connection credentials encrypted at rest
// (add-testrail-importer design.md D2) and records the calling actor as
// CreatedBy. Permission (manageProject on projectID) is enforced by
// requirePermission at the routing layer, matching Service.ReopenRun.
func (s *Service) CreateImportJob(ctx context.Context, projectID, source string, mode domain.ImportMode, credentials map[string]string) (domain.ImportJob, error) {
	if s.encryptionKey == "" {
		return domain.ImportJob{}, invalid("TESTPULSE_ENCRYPTION_KEY must be configured to run an import")
	}
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return domain.ImportJob{}, unauthorized("authentication required")
	}
	plaintext, err := json.Marshal(credentials)
	if err != nil {
		return domain.ImportJob{}, err
	}
	encrypted, err := encryptSecret(s.encryptionKey, string(plaintext))
	if err != nil {
		return domain.ImportJob{}, err
	}
	job, err := s.store.ImportJobs.Create(ctx, projectID, source, mode, encrypted, actor.EffectiveUserID)
	if err != nil {
		return domain.ImportJob{}, err
	}
	s.audit(ctx, "create", "importJob", job.ID)
	return job, nil
}

// GetImportJob returns a job's status/progress/report faithfully.
// Permission (manageProject on the job's project) is enforced by
// requirePermission at the routing layer.
func (s *Service) GetImportJob(ctx context.Context, jobID string) (domain.ImportJob, error) {
	return s.store.ImportJobs.Get(ctx, jobID)
}

// ClaimPendingImportJob claims the oldest pending job for source, scoped to
// the calling actor's own project — only a per-project-scoped agent token
// may call this (mirrors Service.ListProjects's ScopedProjectID-direct
// check, not a permission-flag check: there is no resource ID in this
// route to resolve a permission against). ok is false when nothing is
// pending. The returned credentials are decrypted for the importer's own
// use and never persisted again in plaintext.
func (s *Service) ClaimPendingImportJob(ctx context.Context, source string) (job domain.ImportJob, credentials map[string]string, ok bool, err error) {
	actor, present := domain.ActorFromContext(ctx)
	if !present || actor.ScopedProjectID == nil {
		return domain.ImportJob{}, nil, false, unauthorized("a project-scoped agent token is required to claim import work")
	}
	claimed, err := s.store.ImportJobs.ClaimPending(ctx, source, *actor.ScopedProjectID)
	if err != nil {
		return domain.ImportJob{}, nil, false, err
	}
	if claimed == nil {
		return domain.ImportJob{}, nil, false, nil
	}
	plaintext, err := decryptSecret(s.encryptionKey, claimed.EncryptedCredentials)
	if err != nil {
		return domain.ImportJob{}, nil, false, err
	}
	creds := map[string]string{}
	if err := json.Unmarshal([]byte(plaintext), &creds); err != nil {
		return domain.ImportJob{}, nil, false, err
	}
	s.audit(ctx, "claim", "importJob", claimed.Job.ID)
	return claimed.Job, creds, true, nil
}

// ReportImportJobProgress records the importer's latest progress counters.
// Permission is enforced by requirePermission at the routing layer via
// ImportJobRepo.ProjectID.
func (s *Service) ReportImportJobProgress(ctx context.Context, jobID string, current, total int) error {
	return s.store.ImportJobs.PatchProgress(ctx, jobID, current, total)
}

// CompleteImportJob transitions a job to a terminal status with its final
// report or error, clearing credentials (store.ImportJobRepo.Complete).
// Permission is enforced by requirePermission at the routing layer via
// ImportJobRepo.ProjectID.
func (s *Service) CompleteImportJob(ctx context.Context, jobID string, status domain.ImportJobStatus, report *domain.ImportReport, errMsg *string) error {
	if err := s.store.ImportJobs.Complete(ctx, jobID, status, report, errMsg); err != nil {
		return err
	}
	s.audit(ctx, "complete", "importJob", jobID)
	return nil
}
