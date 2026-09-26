package service

import (
	"context"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// runAutoArchiveWorkerActor attributes every run auto-archived by
// RunAutoArchiveWorker to a system actor, distinct from RunRetentionWorker's
// ("retention-worker") and ProjectAutoArchiveWorker's ("auto-archive-worker")
// so all three automated processes are independently attributable in the
// audit log (auto-archive-runs design.md D4).
var runAutoArchiveWorkerActor = domain.Actor{
	ID:          "run-auto-archive-worker",
	Kind:        domain.ActorKindSystem,
	DisplayName: "Automatic run archive policy",
}

// RunAutoArchiveWorker periodically archives closed, non-archived runs
// whose created_at is older than the instance-wide
// RunAutoArchiveInactiveDays threshold (auto-archive-runs design.md D4).
// Mirrors ProjectAutoArchiveWorker's shape exactly: a single in-process
// goroutine started once at server boot, not a separate deployable.
type RunAutoArchiveWorker struct {
	svc *Service

	// Interval between sweeps.
	Interval time.Duration
}

// NewRunAutoArchiveWorker returns a worker with a production-sized default
// Interval (an exported field, adjustable by callers/tests).
func NewRunAutoArchiveWorker(svc *Service) *RunAutoArchiveWorker {
	return &RunAutoArchiveWorker{svc: svc, Interval: time.Hour}
}

// Sweep archives every currently-eligible run and returns how many it
// archived. A threshold of 0 (the default) is a no-op. Exported directly
// (not only reachable via Run's ticker loop) so it can be driven
// deterministically by tests, and by Run itself once immediately at
// startup.
func (w *RunAutoArchiveWorker) Sweep(ctx context.Context) (int, error) {
	settings, err := w.svc.store.InstanceSettings.Get(ctx)
	if err != nil {
		return 0, err
	}
	if settings.RunAutoArchiveInactiveDays == 0 {
		return 0, nil
	}

	eligible, err := w.svc.store.Runs.ListEligibleForAutoArchive(ctx, settings.RunAutoArchiveInactiveDays)
	if err != nil {
		return 0, err
	}

	actorCtx := domain.WithActor(ctx, runAutoArchiveWorkerActor)
	archived := 0
	for _, run := range eligible {
		if err := w.svc.ArchiveRun(actorCtx, run.ID); err != nil {
			return archived, err
		}
		archived++
	}
	return archived, nil
}

// Run sweeps for and archives eligible runs until ctx is cancelled — call it
// once as a goroutine at server boot. Sweeps immediately on start, then on
// every tick. Errors are swallowed per-tick (best-effort — retried on the
// next one); there is no caller to report them to once this is running
// detached.
func (w *RunAutoArchiveWorker) Run(ctx context.Context) {
	w.sweepAndLog(ctx)
	ticker := time.NewTicker(w.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.sweepAndLog(ctx)
		}
	}
}

func (w *RunAutoArchiveWorker) sweepAndLog(ctx context.Context) {
	if _, err := w.Sweep(ctx); err != nil {
		w.svc.logger.Warn("run auto-archive sweep failed", "error", err)
	}
}
