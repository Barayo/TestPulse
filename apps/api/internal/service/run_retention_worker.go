package service

import (
	"context"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// retentionWorkerActor attributes every run auto-deleted by
// RunRetentionWorker to a system actor, distinct from any human or agent
// (design.md D8 of add-data-retention) — nobody triggered these by hand.
var retentionWorkerActor = domain.Actor{
	ID:          "retention-worker",
	Kind:        domain.ActorKindSystem,
	DisplayName: "Automatic retention policy",
}

// RunRetentionWorker periodically deletes closed runs older than the
// instance-wide RunRetentionDays threshold (design.md D8 of
// add-data-retention). Mirrors ProjectDeletionWorker's shape: a single
// in-process goroutine started once at server boot, not a separate
// deployable.
type RunRetentionWorker struct {
	svc *Service

	// Interval between sweeps.
	Interval time.Duration
}

// NewRunRetentionWorker returns a worker with a production-sized default
// Interval (an exported field, adjustable by callers/tests).
func NewRunRetentionWorker(svc *Service) *RunRetentionWorker {
	return &RunRetentionWorker{svc: svc, Interval: time.Hour}
}

// Sweep deletes every currently-eligible closed run and returns how many it
// removed. A threshold of 0 (the default) is a no-op — it never even lists
// runs, let alone deletes any (design.md D8: 0 means the policy is off).
// Exported directly (not only reachable via Run's ticker loop) so it can be
// driven deterministically by tests, and by Run itself once immediately at
// startup.
func (w *RunRetentionWorker) Sweep(ctx context.Context) (int, error) {
	settings, err := w.svc.store.InstanceSettings.Get(ctx)
	if err != nil {
		return 0, err
	}
	if settings.RunRetentionDays == 0 {
		return 0, nil
	}

	eligible, err := w.svc.store.Runs.ListEligibleForRetention(ctx, settings.RunRetentionDays)
	if err != nil {
		return 0, err
	}

	actorCtx := domain.WithActor(ctx, retentionWorkerActor)
	deleted := 0
	for _, run := range eligible {
		if err := w.svc.DeleteRun(actorCtx, run.ID); err != nil {
			return deleted, err
		}
		deleted++
	}
	return deleted, nil
}

// Run sweeps for and deletes eligible runs until ctx is cancelled — call it
// once as a goroutine at server boot. Sweeps immediately on start, then on
// every tick. Errors are swallowed per-tick (best-effort — retried on the
// next one); there is no caller to report them to once this is running
// detached.
func (w *RunRetentionWorker) Run(ctx context.Context) {
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

func (w *RunRetentionWorker) sweepAndLog(ctx context.Context) {
	if _, err := w.Sweep(ctx); err != nil {
		w.svc.logger.Warn("run retention sweep failed", "error", err)
	}
}
