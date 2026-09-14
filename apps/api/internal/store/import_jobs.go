package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ImportJobRepo struct {
	pool *pgxpool.Pool
}

// ClaimedImportJob pairs a claimed job with its still-encrypted credentials
// bytes — store-internal, never returned from a browser-facing method.
// Only the service layer (which holds the encryption key) decrypts these
// (add-testrail-importer design.md D2).
type ClaimedImportJob struct {
	Job                  domain.ImportJob
	EncryptedCredentials []byte
}

const importJobColumns = `id, project_id, source, mode, status, report, progress_current, progress_total, error, created_by, created_at, updated_at, started_at, finished_at`

func scanImportJob(row pgx.Row) (domain.ImportJob, error) {
	var job domain.ImportJob
	var mode, status string
	var reportJSON []byte
	err := row.Scan(&job.ID, &job.ProjectID, &job.Source, &mode, &status, &reportJSON,
		&job.ProgressCurrent, &job.ProgressTotal, &job.Error, &job.CreatedBy,
		&job.CreatedAt, &job.UpdatedAt, &job.StartedAt, &job.FinishedAt)
	if err != nil {
		return domain.ImportJob{}, err
	}
	job.Mode = domain.ImportMode(mode)
	job.Status = domain.ImportJobStatus(status)
	if len(reportJSON) > 0 {
		var report domain.ImportReport
		if err := json.Unmarshal(reportJSON, &report); err != nil {
			return domain.ImportJob{}, err
		}
		job.Report = &report
	}
	return job, nil
}

// Create inserts a pending import job. encryptedCredentials must already be
// encrypted by the caller (the service layer) — the store never sees
// plaintext (design.md D2).
func (r *ImportJobRepo) Create(ctx context.Context, projectID, source string, mode domain.ImportMode, encryptedCredentials []byte, createdBy string) (domain.ImportJob, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO import_jobs (project_id, source, mode, credentials, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING `+importJobColumns,
		projectID, source, string(mode), encryptedCredentials, createdBy,
	)
	return scanImportJob(row)
}

// ProjectID resolves an import job to its project — used by
// requirePermission's per-resource resolver (matches RequirementRepo's
// ProjectID shape) for the PATCH .../imports/{jobId} route.
func (r *ImportJobRepo) ProjectID(ctx context.Context, jobID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx, `SELECT project_id FROM import_jobs WHERE id = $1`, jobID).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// Get returns a job by id. Never scans the credentials column — the
// returned domain.ImportJob has no field to put it in even if it did
// (design.md D2's structural guarantee).
func (r *ImportJobRepo) Get(ctx context.Context, id string) (domain.ImportJob, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+importJobColumns+` FROM import_jobs WHERE id = $1`, id)
	job, err := scanImportJob(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ImportJob{}, ErrNotFound
	}
	return job, err
}

// ClaimPending atomically claims the oldest pending job for (source,
// projectID), marking it running, and returns its still-encrypted
// credentials alongside it. Returns (nil, nil) when nothing is pending.
// FOR UPDATE SKIP LOCKED so two importer instances polling concurrently
// never claim the same job.
func (r *ImportJobRepo) ClaimPending(ctx context.Context, source, projectID string) (*ClaimedImportJob, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var id string
	var credentials []byte
	err = tx.QueryRow(ctx,
		`SELECT id, credentials FROM import_jobs
		 WHERE source = $1 AND project_id = $2 AND status = $3
		 ORDER BY created_at
		 FOR UPDATE SKIP LOCKED
		 LIMIT 1`,
		source, projectID, string(domain.ImportJobStatusPending),
	).Scan(&id, &credentials)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	row := tx.QueryRow(ctx,
		`UPDATE import_jobs SET status = $2, started_at = now(), updated_at = now()
		 WHERE id = $1
		 RETURNING `+importJobColumns,
		id, string(domain.ImportJobStatusRunning),
	)
	job, err := scanImportJob(row)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &ClaimedImportJob{Job: job, EncryptedCredentials: credentials}, nil
}

// PatchProgress updates a running job's progress counters.
func (r *ImportJobRepo) PatchProgress(ctx context.Context, id string, current, total int) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE import_jobs SET progress_current = $2, progress_total = $3, updated_at = now() WHERE id = $1`,
		id, current, total,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Complete transitions a job to a terminal status (succeeded/failed) with
// its final report or error, and clears credentials — a terminal job's
// credentials are never retrievable again, including by ClaimPending
// (design.md D2).
func (r *ImportJobRepo) Complete(ctx context.Context, id string, status domain.ImportJobStatus, report *domain.ImportReport, errMsg *string) error {
	var reportJSON []byte
	if report != nil {
		var err error
		reportJSON, err = json.Marshal(report)
		if err != nil {
			return err
		}
	}
	tag, err := r.pool.Exec(ctx,
		`UPDATE import_jobs
		 SET status = $2, report = $3, error = $4, credentials = NULL, finished_at = now(), updated_at = now()
		 WHERE id = $1`,
		id, string(status), reportJSON, errMsg,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
