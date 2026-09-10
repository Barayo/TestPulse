package store

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SetStepState upserts a run item's current mark for one step
// (add-step-level-results) — the live, carry-forward state, distinct from
// a Result's immutable snapshot (see stepResultsByResults below). Marking
// the same step twice replaces the prior verdict rather than erroring or
// duplicating a row.
func (r *RunRepo) SetStepState(ctx context.Context, itemID string, stepIndex int, verdict domain.Verdict) (domain.StepResult, error) {
	var out domain.StepResult
	err := r.pool.QueryRow(ctx,
		`INSERT INTO test_run_item_step_states (run_item_id, step_index, verdict)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (run_item_id, step_index) DO UPDATE SET verdict = EXCLUDED.verdict, updated_at = now()
		 RETURNING step_index, verdict`,
		itemID, stepIndex, verdict,
	).Scan(&out.StepIndex, &out.Verdict)
	return out, err
}

// StepStates returns itemID's currently-marked step verdicts, ordered by
// step index. Empty when none are marked — including after the item (or
// its run) has been deleted, since test_run_item_step_states rows
// cascade-delete with it; no separate existence check is needed here.
func (r *RunRepo) StepStates(ctx context.Context, itemID string) ([]domain.StepResult, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT step_index, verdict FROM test_run_item_step_states WHERE run_item_id = $1 ORDER BY step_index`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.StepResult{}
	for rows.Next() {
		var sr domain.StepResult
		if err := rows.Scan(&sr.StepIndex, &sr.Verdict); err != nil {
			return nil, err
		}
		out = append(out, sr)
	}
	return out, rows.Err()
}

// ItemStepCount returns the number of steps in itemID's pinned case
// content — the bounds a step index must fall within (add-step-level-results).
func (r *RunRepo) ItemStepCount(ctx context.Context, itemID string) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT jsonb_array_length(v.steps) FROM test_run_items i
		 JOIN test_case_versions v ON v.case_id = i.case_id AND v.version = i.case_version
		 WHERE i.id = $1`, itemID,
	).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return n, err
}

// stepStatesByItems batch-fetches live step states for multiple run items
// (Items/ItemsPage's join), keyed by run_item_id — mirrors
// attachmentsByResults' batch-by-ids shape.
func stepStatesByItems(ctx context.Context, pool *pgxpool.Pool, itemIDs []string) (map[string][]domain.StepResult, error) {
	if len(itemIDs) == 0 {
		return nil, nil
	}
	rows, err := pool.Query(ctx,
		`SELECT run_item_id, step_index, verdict FROM test_run_item_step_states WHERE run_item_id = ANY($1) ORDER BY run_item_id, step_index`, itemIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]domain.StepResult{}
	for rows.Next() {
		var itemID string
		var sr domain.StepResult
		if err := rows.Scan(&itemID, &sr.StepIndex, &sr.Verdict); err != nil {
			return nil, err
		}
		out[itemID] = append(out[itemID], sr)
	}
	return out, rows.Err()
}

// stepResultsByResults batch-fetches immutable step snapshots for multiple
// results (Results' join), keyed by result_id.
func stepResultsByResults(ctx context.Context, pool *pgxpool.Pool, resultIDs []string) (map[string][]domain.StepResult, error) {
	if len(resultIDs) == 0 {
		return nil, nil
	}
	rows, err := pool.Query(ctx,
		`SELECT result_id, step_index, verdict FROM test_run_result_steps WHERE result_id = ANY($1) ORDER BY result_id, step_index`, resultIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]domain.StepResult{}
	for rows.Next() {
		var resultID string
		var sr domain.StepResult
		if err := rows.Scan(&resultID, &sr.StepIndex, &sr.Verdict); err != nil {
			return nil, err
		}
		out[resultID] = append(out[resultID], sr)
	}
	return out, rows.Err()
}
