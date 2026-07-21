package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RunRepo struct {
	pool *pgxpool.Pool
}

// ProjectID resolves the project a run belongs to — used by
// requirePermission's per-resource resolver (add-project-rbac design.md D5).
func (r *RunRepo) ProjectID(ctx context.Context, runID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM test_runs WHERE id = $1`, runID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// ItemProjectID resolves the project a run item belongs to, via its run —
// used by requirePermission's per-resource resolver (design.md D5).
func (r *RunRepo) ItemProjectID(ctx context.Context, itemID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT tr.project_id FROM test_run_items tri
		 JOIN test_runs tr ON tr.id = tri.run_id
		 WHERE tri.id = $1`, itemID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// Create inserts a run and pins each case to its current version (D2), all
// in one transaction.
func (r *RunRepo) Create(ctx context.Context, projectID, name string, caseIDs []string) (domain.Run, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Run{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	key, err := claimEntityKey(ctx, tx, projectID, "run", "%s-R%d")
	if err != nil {
		return domain.Run{}, fmt.Errorf("claiming run key: %w", err)
	}

	var run domain.Run
	err = tx.QueryRow(ctx,
		`INSERT INTO test_runs (key, project_id, name) VALUES ($1, $2, $3)
		 RETURNING id, key, project_id, name, created_at`, key, projectID, name,
	).Scan(&run.ID, &run.Key, &run.ProjectID, &run.Name, &run.CreatedAt)
	if err != nil {
		return domain.Run{}, err
	}
	if err := tx.QueryRow(ctx, `SELECT key FROM projects WHERE id = $1`, projectID).Scan(&run.ProjectKey); err != nil {
		return domain.Run{}, err
	}
	for _, caseID := range caseIDs {
		if err := pinItem(ctx, tx, run.ID, caseID); err != nil {
			return domain.Run{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Run{}, err
	}
	return run, nil
}

// AddItem pins the case's then-current version into an existing run.
func (r *RunRepo) AddItem(ctx context.Context, runID, caseID string) (string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := pinItem(ctx, tx, runID, caseID); err != nil {
		return "", err
	}
	var itemID string
	if err := tx.QueryRow(ctx,
		`SELECT id FROM test_run_items WHERE run_id = $1 AND case_id = $2`,
		runID, caseID).Scan(&itemID); err != nil {
		return "", err
	}
	return itemID, tx.Commit(ctx)
}

// pinItem inserts a run item pinned to the case's current version.
func pinItem(ctx context.Context, tx pgx.Tx, runID, caseID string) error {
	tag, err := tx.Exec(ctx,
		`INSERT INTO test_run_items (run_id, case_id, case_version)
		 SELECT $1, id, current_version FROM test_cases WHERE id = $2 AND NOT deleted`,
		runID, caseID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *RunRepo) Get(ctx context.Context, runID string) (domain.Run, error) {
	var run domain.Run
	err := r.pool.QueryRow(ctx,
		`SELECT tr.id, tr.key, tr.project_id, p.key, tr.name, tr.created_at
		 FROM test_runs tr JOIN projects p ON p.id = tr.project_id
		 WHERE tr.id = $1`, runID,
	).Scan(&run.ID, &run.Key, &run.ProjectID, &run.ProjectKey, &run.Name, &run.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Run{}, ErrNotFound
	}
	return run, err
}

// IDByKey resolves a run's key to its internal id — used at the API
// boundary to translate a key-based path param before delegating to
// UUID-based service/store calls (add-human-readable-keys D4).
func (r *RunRepo) IDByKey(ctx context.Context, key string) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `SELECT id FROM test_runs WHERE key = $1`, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

func (r *RunRepo) List(ctx context.Context, projectID string) ([]domain.Run, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT tr.id, tr.key, tr.project_id, p.key, tr.name, tr.created_at
		 FROM test_runs tr JOIN projects p ON p.id = tr.project_id
		 WHERE tr.project_id = $1 ORDER BY tr.created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := []domain.Run{}
	for rows.Next() {
		var run domain.Run
		if err := rows.Scan(&run.ID, &run.Key, &run.ProjectID, &run.ProjectKey, &run.Name, &run.CreatedAt); err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

// Items returns run items with pinned content and the newer-version flag,
// optionally filtered by assignee.
func (r *RunRepo) Items(ctx context.Context, runID, assignee string) ([]domain.RunItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT i.id, i.run_id, i.case_id, i.case_version, i.assignee, i.current_status, i.created_at,
		        (c.current_version > i.case_version) AS newer,
		        v.title, v.description, v.steps, v.expected_result, v.priority, v.tags, v.platform, v.test_type, v.automated
		 FROM test_run_items i
		 JOIN test_cases c ON c.id = i.case_id
		 JOIN test_case_versions v ON v.case_id = i.case_id AND v.version = i.case_version
		 WHERE i.run_id = $1 AND ($2 = '' OR i.assignee = $2)
		 ORDER BY i.created_at`, runID, assignee)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []domain.RunItem{}
	for rows.Next() {
		var (
			it                           domain.RunItem
			title, description, expected string
			priority                     string
			stepsJSON                    []byte
			tags                         []string
			platform, testType           string
			automated                    bool
		)
		if err := rows.Scan(&it.ID, &it.RunID, &it.CaseID, &it.CaseVersion,
			&it.Assignee, &it.CurrentStatus, &it.CreatedAt, &it.NewerVersion,
			&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated); err != nil {
			return nil, err
		}
		content, err := scanContent(&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated)()
		if err != nil {
			return nil, err
		}
		it.Content = content
		items = append(items, it)
	}
	return items, rows.Err()
}

// ExecutionsByCase lists every run item that has ever pinned the given case,
// across every run — unlike Items, which is scoped to one run_id
// (extend-case-version-history: "did a specific edit introduce flakiness"
// needs the cross-run view).
func (r *RunRepo) ExecutionsByCase(ctx context.Context, caseID string) ([]domain.CaseExecution, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT i.id, i.run_id, tr.name, i.case_version, i.current_status, i.created_at
		 FROM test_run_items i
		 JOIN test_runs tr ON tr.id = i.run_id
		 WHERE i.case_id = $1
		 ORDER BY i.case_version, i.created_at`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	execs := []domain.CaseExecution{}
	for rows.Next() {
		var e domain.CaseExecution
		if err := rows.Scan(&e.RunItemID, &e.RunID, &e.RunName, &e.CaseVersion, &e.Status, &e.CreatedAt); err != nil {
			return nil, err
		}
		execs = append(execs, e)
	}
	return execs, rows.Err()
}

// AppendResult inserts into the append-only log and updates the item's
// current status in the same transaction (D3).
func (r *RunRepo) AppendResult(ctx context.Context, itemID string, res domain.NewResult) (domain.Result, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Result{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var out domain.Result
	err = tx.QueryRow(ctx,
		`INSERT INTO test_run_results (run_item_id, actor, verdict, comment)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, run_item_id, actor, verdict, comment, created_at`,
		itemID, res.Actor, res.Verdict, res.Comment,
	).Scan(&out.ID, &out.RunItemID, &out.Actor, &out.Verdict, &out.Comment, &out.CreatedAt)
	if err != nil {
		return domain.Result{}, err
	}
	tag, err := tx.Exec(ctx,
		`UPDATE test_run_items SET current_status = $2 WHERE id = $1`,
		itemID, res.Verdict.Status())
	if err != nil {
		return domain.Result{}, err
	}
	if tag.RowsAffected() == 0 {
		return domain.Result{}, ErrNotFound
	}
	return out, tx.Commit(ctx)
}

func (r *RunRepo) Results(ctx context.Context, itemID string) ([]domain.Result, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, run_item_id, actor, verdict, comment, created_at
		 FROM test_run_results WHERE run_item_id = $1 ORDER BY created_at, id`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []domain.Result{}
	for rows.Next() {
		var res domain.Result
		if err := rows.Scan(&res.ID, &res.RunItemID, &res.Actor, &res.Verdict, &res.Comment, &res.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, res)
	}
	return results, rows.Err()
}

func (r *RunRepo) SetItemStatus(ctx context.Context, itemID string, status domain.Status) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE test_run_items SET current_status = $2 WHERE id = $1`, itemID, status)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *RunRepo) AssignItem(ctx context.Context, itemID, assignee string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE test_run_items SET assignee = $2 WHERE id = $1`, itemID, assignee)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *RunRepo) Summary(ctx context.Context, runID string) (domain.RunSummary, error) {
	if _, err := r.Get(ctx, runID); err != nil {
		return domain.RunSummary{}, err
	}
	rows, err := r.pool.Query(ctx,
		`SELECT current_status, count(*) FROM test_run_items
		 WHERE run_id = $1 GROUP BY current_status`, runID)
	if err != nil {
		return domain.RunSummary{}, err
	}
	defer rows.Close()

	sum := domain.RunSummary{RunID: runID, Counts: map[domain.Status]int{}}
	for rows.Next() {
		var status domain.Status
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return domain.RunSummary{}, err
		}
		sum.Counts[status] = count
		sum.Total += count
	}
	return sum, rows.Err()
}
