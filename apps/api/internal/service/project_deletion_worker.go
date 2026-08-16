package service

import (
	"context"
	"time"
)

// projectDeletionPurgeTables lists the usage-scaled child tables in
// dependency order (children before their parents), each drained to
// completion via ProjectRepo.PurgeBatch before the final Purge cleans up
// everything else (small, bounded, FK-cascaded — design.md D2/D6).
var projectDeletionPurgeTables = []string{
	"test_run_results",
	"test_run_items",
	"test_runs",
	"test_case_versions",
	"test_cases",
}

// ProjectDeletionWorker periodically purges every project queued for
// permanent deletion (add-data-retention design.md D6) — this codebase's
// first background-processing mechanism. A single in-process goroutine,
// started once at server boot (cmd/testpulse-api/main.go), not a separate
// deployable.
type ProjectDeletionWorker struct {
	svc *Service

	// Interval between polls for newly-queued projects.
	Interval time.Duration
	// BatchSize bounds each PurgeBatch call — overridable by tests to
	// force multiple batches without seeding thousands of rows.
	BatchSize int
}

// NewProjectDeletionWorker returns a worker with production-sized
// defaults (Interval/BatchSize are exported fields, adjustable by callers
// — tests use a small BatchSize to exercise the multi-batch/resumability
// paths without seeding real-world row counts).
func NewProjectDeletionWorker(svc *Service) *ProjectDeletionWorker {
	return &ProjectDeletionWorker{svc: svc, Interval: 5 * time.Second, BatchSize: 1000}
}

// ProcessPending purges every project currently queued for deletion to
// completion. Exported directly (not only reachable via Run's ticker loop)
// so it can be driven deterministically — by tests, and by Run itself
// once immediately at startup so a restart mid-purge resumes without
// waiting a full Interval (design.md D6 resumability).
func (w *ProjectDeletionWorker) ProcessPending(ctx context.Context) error {
	pending, err := w.svc.store.Projects.ListPendingDeletion(ctx)
	if err != nil {
		return err
	}
	for _, p := range pending {
		if err := w.purgeProject(ctx, p.ID); err != nil {
			return err
		}
	}
	return nil
}

// purgeProject drains every usage-scaled child table for projectID in
// dependency order, then issues the final DELETE FROM projects. The batch
// loop is naturally idempotent — deleting already-gone rows is a no-op —
// so re-running it after a partial run (e.g. a restart mid-purge) simply
// resumes.
func (w *ProjectDeletionWorker) purgeProject(ctx context.Context, projectID string) error {
	for _, table := range projectDeletionPurgeTables {
		for {
			deleted, err := w.svc.store.Projects.PurgeBatch(ctx, projectID, table, w.BatchSize)
			if err != nil {
				return err
			}
			if deleted == 0 {
				break
			}
		}
	}
	return w.svc.store.Projects.Purge(ctx, projectID)
}

// Run polls for and purges pending-deletion projects until ctx is
// cancelled — call it once as a goroutine at server boot. Processes
// immediately on start (design.md D6 resumability), then on every tick.
// Errors are swallowed per-tick (best-effort — retried on the next one);
// there is no caller to report them to once this is running detached.
func (w *ProjectDeletionWorker) Run(ctx context.Context) {
	_ = w.ProcessPending(ctx)
	ticker := time.NewTicker(w.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = w.ProcessPending(ctx)
		}
	}
}
