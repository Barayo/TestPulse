package service

import (
	"context"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// autoArchiveWorkerActor attributes every project auto-archived by
// ProjectAutoArchiveWorker to a system actor, distinct from
// RunRetentionWorker's own ("retention-worker") so the two automated
// processes are independently attributable in the audit log (design.md D9
// of add-data-retention).
var autoArchiveWorkerActor = domain.Actor{
	ID:          "auto-archive-worker",
	Kind:        domain.ActorKindSystem,
	DisplayName: "Automatic archive policy",
}

// ProjectAutoArchiveWorker periodically archives non-archived, non-exempt
// projects whose activity is older than the instance-wide
// AutoArchiveInactiveDays threshold (design.md D9 of add-data-retention).
// Mirrors RunRetentionWorker's shape: a single in-process goroutine started
// once at server boot, not a separate deployable.
type ProjectAutoArchiveWorker struct {
	svc *Service

	// Interval between sweeps.
	Interval time.Duration
}

// NewProjectAutoArchiveWorker returns a worker with a production-sized
// default Interval (an exported field, adjustable by callers/tests).
func NewProjectAutoArchiveWorker(svc *Service) *ProjectAutoArchiveWorker {
	return &ProjectAutoArchiveWorker{svc: svc, Interval: time.Hour}
}

// Sweep archives every currently-eligible project and returns how many it
// archived. A threshold of 0 (the default) is a no-op. Exported directly
// (not only reachable via Run's ticker loop) so it can be driven
// deterministically by tests, and by Run itself once immediately at
// startup.
func (w *ProjectAutoArchiveWorker) Sweep(ctx context.Context) (int, error) {
	settings, err := w.svc.store.InstanceSettings.Get(ctx)
	if err != nil {
		return 0, err
	}
	if settings.AutoArchiveInactiveDays == 0 {
		return 0, nil
	}

	eligible, err := w.svc.store.Projects.ListEligibleForAutoArchive(ctx, settings.AutoArchiveInactiveDays)
	if err != nil {
		return 0, err
	}

	actorCtx := domain.WithActor(ctx, autoArchiveWorkerActor)
	archive := true
	archived := 0
	for _, p := range eligible {
		if _, err := w.svc.UpdateProject(actorCtx, p.ID, ProjectUpdate{Archived: &archive}); err != nil {
			return archived, err
		}
		archived++
	}
	return archived, nil
}

// Run sweeps for and archives eligible projects until ctx is cancelled —
// call it once as a goroutine at server boot. Sweeps immediately on start,
// then on every tick. Errors are swallowed per-tick (best-effort — retried
// on the next one); there is no caller to report them to once this is
// running detached.
func (w *ProjectAutoArchiveWorker) Run(ctx context.Context) {
	_, _ = w.Sweep(ctx)
	ticker := time.NewTicker(w.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_, _ = w.Sweep(ctx)
		}
	}
}
