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

// ErrRunClosed is returned when a mutating run-item operation (adding an
// item, recording a result, updating status/assignee) targets a closed run
// (add-run-lifecycle-status).
var ErrRunClosed = fmt.Errorf("run is closed")

// rowScanner is satisfied by both *pgxpool.Pool and pgx.Tx — lets the
// open/closed guard helpers run standalone or as part of an existing
// transaction.
type rowScanner interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// checkRunOpen returns ErrNotFound if runID doesn't exist, ErrRunClosed if
// it's closed, nil if open.
func checkRunOpen(ctx context.Context, q rowScanner, runID string) error {
	var status domain.RunStatus
	err := q.QueryRow(ctx, `SELECT status FROM test_runs WHERE id = $1`, runID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status == domain.RunStatusClosed {
		return ErrRunClosed
	}
	return nil
}

// checkItemRunOpen is checkRunOpen for a run item, resolving its parent run
// via a join.
func checkItemRunOpen(ctx context.Context, q rowScanner, itemID string) error {
	var status domain.RunStatus
	err := q.QueryRow(ctx,
		`SELECT tr.status FROM test_run_items tri JOIN test_runs tr ON tr.id = tri.run_id WHERE tri.id = $1`, itemID,
	).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status == domain.RunStatusClosed {
		return ErrRunClosed
	}
	return nil
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

// ResultProjectID resolves the project a result belongs to, via its item and
// run — used by requirePermission's per-resource resolver for the
// /results/{resultId}/attachments routes (add-run-item-screenshot-
// attachments).
func (r *RunRepo) ResultProjectID(ctx context.Context, resultID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT tr.project_id FROM test_run_results trr
		 JOIN test_run_items tri ON tri.id = trr.run_item_id
		 JOIN test_runs tr ON tr.id = tri.run_id
		 WHERE trr.id = $1`, resultID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// Create inserts a run and pins each case to its current version (D2), all
// in one transaction.
func (r *RunRepo) Create(ctx context.Context, projectID, name string, caseIDs []string) (domain.Run, error) {
	return r.create(ctx, projectID, name, "", caseIDs)
}

// CreateWithSuite is Create for a run built from a suite (link-runs-to-suite)
// — the run records suiteID as its source, exposed as Run.SuiteKey.
func (r *RunRepo) CreateWithSuite(ctx context.Context, projectID, name, suiteID string, caseIDs []string) (domain.Run, error) {
	return r.create(ctx, projectID, name, suiteID, caseIDs)
}

func (r *RunRepo) create(ctx context.Context, projectID, name, suiteID string, caseIDs []string) (domain.Run, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Run{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	key, err := claimEntityKey(ctx, tx, projectID, "run", "%s-R%d")
	if err != nil {
		return domain.Run{}, fmt.Errorf("claiming run key: %w", err)
	}

	var suiteIDArg any
	if suiteID != "" {
		suiteIDArg = suiteID
	}

	var run domain.Run
	err = tx.QueryRow(ctx,
		`INSERT INTO test_runs (key, project_id, name, suite_id) VALUES ($1, $2, $3, $4)
		 RETURNING id, key, project_id, name, status, created_at`, key, projectID, name, suiteIDArg,
	).Scan(&run.ID, &run.Key, &run.ProjectID, &run.Name, &run.Status, &run.CreatedAt)
	if err != nil {
		return domain.Run{}, err
	}
	if err := tx.QueryRow(ctx, `SELECT key FROM projects WHERE id = $1`, projectID).Scan(&run.ProjectKey); err != nil {
		return domain.Run{}, err
	}
	if suiteID != "" {
		var suiteKey string
		if err := tx.QueryRow(ctx, `SELECT key FROM test_suites WHERE id = $1`, suiteID).Scan(&suiteKey); err != nil {
			return domain.Run{}, err
		}
		run.SuiteKey = &suiteKey
	}
	for _, caseID := range caseIDs {
		if err := pinItem(ctx, tx, run.ID, caseID, ""); err != nil {
			return domain.Run{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Run{}, err
	}
	return run, nil
}

// ImportItem is one matched test to attach to an imported run: the case it
// matched, the runner's own name for it, and the result to record.
type ImportItem struct {
	CaseID   string
	TestName string
	Result   domain.NewResult
}

// Import creates a run and, in the same transaction, pins and records a
// result for every matched item — add-execution-import's "match-only,
// atomic per import" rule (design.md): a mid-pipeline failure leaves nothing
// created, unlike Create+AddItem+AppendResult's separate transactions.
func (r *RunRepo) Import(ctx context.Context, projectID, name string, items []ImportItem) (domain.Run, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Run{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	key, err := claimEntityKey(ctx, tx, projectID, "run", "%s-R%d")
	if err != nil {
		return domain.Run{}, fmt.Errorf("claiming run key: %w", err)
	}

	// An imported run is a finished snapshot: every item already carries a
	// final verdict at creation time, unlike a manually-created run that's
	// worked over time — so it's created closed, not left to the open
	// default (collapse-duplicate-ci-runs).
	var run domain.Run
	err = tx.QueryRow(ctx,
		`INSERT INTO test_runs (key, project_id, name, status) VALUES ($1, $2, $3, $4)
		 RETURNING id, key, project_id, name, status, created_at`, key, projectID, name, domain.RunStatusClosed,
	).Scan(&run.ID, &run.Key, &run.ProjectID, &run.Name, &run.Status, &run.CreatedAt)
	if err != nil {
		return domain.Run{}, err
	}
	if err := tx.QueryRow(ctx, `SELECT key FROM projects WHERE id = $1`, projectID).Scan(&run.ProjectKey); err != nil {
		return domain.Run{}, err
	}

	for _, item := range items {
		if err := pinItem(ctx, tx, run.ID, item.CaseID, item.TestName); err != nil {
			return domain.Run{}, err
		}
		var itemID string
		if err := tx.QueryRow(ctx,
			`SELECT id FROM test_run_items WHERE run_id = $1 AND case_id = $2`,
			run.ID, item.CaseID).Scan(&itemID); err != nil {
			return domain.Run{}, err
		}
		res := item.Result
		var resultID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO test_run_results (run_item_id, actor, verdict, comment, start_time, end_time, platform, version, tags)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::text[], '{}'))
			 RETURNING id`,
			itemID, res.Actor, res.Verdict, res.Comment, res.StartTime, res.EndTime, res.Platform, res.Version, res.Tags,
		).Scan(&resultID); err != nil {
			return domain.Run{}, err
		}
		if _, err := tx.Exec(ctx,
			`UPDATE test_run_items SET current_status = $2 WHERE id = $1`,
			itemID, res.Verdict.Status()); err != nil {
			return domain.Run{}, err
		}
		if _, err := insertInlineAttachments(ctx, tx, itemID, resultID, res.Attachments); err != nil {
			return domain.Run{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Run{}, err
	}
	return run, nil
}

// AddItem pins the case's then-current version into an existing run.
// testName is the literal name an external test runner reported
// (add-execution-import); pass "" for manually-added items.
func (r *RunRepo) AddItem(ctx context.Context, runID, caseID, testName string) (string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := checkRunOpen(ctx, tx, runID); err != nil {
		return "", err
	}
	if err := pinItem(ctx, tx, runID, caseID, testName); err != nil {
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
func pinItem(ctx context.Context, tx pgx.Tx, runID, caseID, testName string) error {
	tag, err := tx.Exec(ctx,
		`INSERT INTO test_run_items (run_id, case_id, case_version, test_name)
		 SELECT $1, id, current_version, $3 FROM test_cases WHERE id = $2 AND NOT deleted`,
		runID, caseID, testName)
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
		`SELECT tr.id, tr.key, tr.project_id, p.key, tr.name, tr.status, ts.key, tr.created_at
		 FROM test_runs tr
		 JOIN projects p ON p.id = tr.project_id
		 LEFT JOIN test_suites ts ON ts.id = tr.suite_id
		 WHERE tr.id = $1`, runID,
	).Scan(&run.ID, &run.Key, &run.ProjectID, &run.ProjectKey, &run.Name, &run.Status, &run.SuiteKey, &run.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Run{}, ErrNotFound
	}
	return run, err
}

// Close seals a run: every subsequent mutating run-item operation
// (AddItem, AppendResult, SetItemStatus, AssignItem) is rejected with
// ErrRunClosed until it's reopened.
func (r *RunRepo) Close(ctx context.Context, runID string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE test_runs SET status = 'closed' WHERE id = $1`, runID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Reopen returns a closed run to open, allowing mutations again.
func (r *RunRepo) Reopen(ctx context.Context, runID string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE test_runs SET status = 'open' WHERE id = $1`, runID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete permanently removes a run (add-data-retention design.md D1). No
// application-level cascade is needed — test_run_items.run_id and
// test_run_results.run_item_id are both ON DELETE CASCADE, so one DELETE
// here removes every item and result scoped to this run.
func (r *RunRepo) Delete(ctx context.Context, runID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM test_runs WHERE id = $1`, runID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListEligibleForRetention returns every closed run whose created_at is
// older than days (add-data-retention design.md D8). A pure age filter —
// callers (the retention worker) are responsible for treating days == 0 as
// "policy off" before calling this, not this method.
func (r *RunRepo) ListEligibleForRetention(ctx context.Context, days int) ([]domain.Run, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, key, project_id, name, status, created_at
		 FROM test_runs
		 WHERE status = $1 AND created_at < now() - make_interval(days => $2)`,
		domain.RunStatusClosed, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := []domain.Run{}
	for rows.Next() {
		var run domain.Run
		if err := rows.Scan(&run.ID, &run.Key, &run.ProjectID, &run.Name, &run.Status, &run.CreatedAt); err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
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
	// Pass rate is aggregated in the same query (one query for the whole
	// list, not a round trip per run) — same LEFT JOIN + FILTER shape as
	// SuiteRepo.latestRunStats and ProjectRepo's summaries query.
	rows, err := r.pool.Query(ctx,
		`SELECT tr.id, tr.key, tr.project_id, p.key, tr.name, tr.status, ts.key, tr.created_at,
		        count(i.id) AS total,
		        count(i.id) FILTER (WHERE i.current_status = 'pass') AS pass_count
		 FROM test_runs tr
		 JOIN projects p ON p.id = tr.project_id
		 LEFT JOIN test_suites ts ON ts.id = tr.suite_id
		 LEFT JOIN test_run_items i ON i.run_id = tr.id
		 WHERE tr.project_id = $1
		 GROUP BY tr.id, p.key, ts.key
		 ORDER BY tr.created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := []domain.Run{}
	for rows.Next() {
		var run domain.Run
		var total, passCount int
		if err := rows.Scan(&run.ID, &run.Key, &run.ProjectID, &run.ProjectKey, &run.Name, &run.Status, &run.SuiteKey, &run.CreatedAt, &total, &passCount); err != nil {
			return nil, err
		}
		if total > 0 {
			rate := int(float64(passCount) / float64(total) * 100)
			run.PassRate = &rate
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

// Items returns run items with pinned content and the newer-version flag,
// optionally filtered by assignee (a user or team id — matches either).
func (r *RunRepo) Items(ctx context.Context, runID, assigneeID string) ([]domain.RunItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT i.id, i.run_id, i.case_id, c.key, i.case_version,
		        i.assignee_user_id, i.assignee_team_id, u.email, t.name, u.avatar_key,
		        i.current_status, i.test_name, i.created_at,
		        (c.current_version > i.case_version) AS newer,
		        v.title, v.description, v.steps, v.expected_result, v.priority, v.tags, v.platform, v.test_type, v.automated
		 FROM test_run_items i
		 JOIN test_cases c ON c.id = i.case_id
		 JOIN test_case_versions v ON v.case_id = i.case_id AND v.version = i.case_version
		 LEFT JOIN users u ON u.id = i.assignee_user_id
		 LEFT JOIN teams t ON t.id = i.assignee_team_id
		 WHERE i.run_id = $1
		   AND ($2 = '' OR i.assignee_user_id::text = $2 OR i.assignee_team_id::text = $2)
		 ORDER BY i.created_at`, runID, assigneeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []domain.RunItem{}
	for rows.Next() {
		var (
			it                                                                                  domain.RunItem
			assigneeUserID, assigneeTeamID, assigneeUserEmail, assigneeTeamName, assigneeAvatar *string
			title, description, expected                                                        string
			priority                                                                            string
			stepsJSON                                                                           []byte
			tags                                                                                []string
			platform, testType                                                                  string
			automated                                                                           bool
		)
		if err := rows.Scan(&it.ID, &it.RunID, &it.CaseID, &it.CaseKey, &it.CaseVersion,
			&assigneeUserID, &assigneeTeamID, &assigneeUserEmail, &assigneeTeamName, &assigneeAvatar,
			&it.CurrentStatus, &it.TestName, &it.CreatedAt, &it.NewerVersion,
			&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated); err != nil {
			return nil, err
		}
		content, err := scanContent(&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated)()
		if err != nil {
			return nil, err
		}
		it.Content = content
		switch {
		case assigneeUserID != nil:
			it.Assignee = &domain.Assignee{Kind: domain.AssigneeKindUser, ID: *assigneeUserID, Name: *assigneeUserEmail, AvatarKey: assigneeAvatar}
		case assigneeTeamID != nil:
			it.Assignee = &domain.Assignee{Kind: domain.AssigneeKindTeam, ID: *assigneeTeamID, Name: *assigneeTeamName}
		}
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
		`SELECT i.id, i.run_id, tr.key, tr.name, i.case_version, i.current_status, i.created_at
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
		if err := rows.Scan(&e.RunItemID, &e.RunID, &e.RunKey, &e.RunName, &e.CaseVersion, &e.Status, &e.CreatedAt); err != nil {
			return nil, err
		}
		execs = append(execs, e)
	}
	return execs, rows.Err()
}

// ExecutionsByCaseRecent lists a case's most recent executions across every
// run, strictly ordered by created_at descending — not by pinned
// case_version, which is not a proxy for recency once a version has been
// restored (add-case-result-history). Bounded by limit so a caller never
// needs to fetch the case's full history for a short recent-activity
// window.
func (r *RunRepo) ExecutionsByCaseRecent(ctx context.Context, caseID string, limit int) ([]domain.CaseExecution, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT i.id, i.run_id, tr.key, tr.name, i.case_version, i.current_status, i.created_at
		 FROM test_run_items i
		 JOIN test_runs tr ON tr.id = i.run_id
		 WHERE i.case_id = $1
		 ORDER BY i.created_at DESC
		 LIMIT $2`, caseID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	execs := []domain.CaseExecution{}
	for rows.Next() {
		var e domain.CaseExecution
		if err := rows.Scan(&e.RunItemID, &e.RunID, &e.RunKey, &e.RunName, &e.CaseVersion, &e.Status, &e.CreatedAt); err != nil {
			return nil, err
		}
		execs = append(execs, e)
	}
	return execs, rows.Err()
}

// AppendResult inserts into the append-only log and updates the item's
// current status in the same transaction (D3). actorKind/actorRefID are the
// resolved real actor behind the result (link-result-actor-to-identity D2) —
// the caller (the service layer) resolves these from the authenticated
// request; res.Actor stays the display name, which may be an override.
func (r *RunRepo) AppendResult(ctx context.Context, itemID string, res domain.NewResult, actorKind domain.ResultActorKind, actorRefID string) (domain.Result, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Result{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := checkItemRunOpen(ctx, tx, itemID); err != nil {
		return domain.Result{}, err
	}

	var refID *string
	if actorRefID != "" {
		refID = &actorRefID
	}

	var out domain.Result
	var outRef *string
	err = tx.QueryRow(ctx,
		`INSERT INTO test_run_results (run_item_id, actor, verdict, comment, start_time, end_time, platform, version, tags, actor_kind, actor_ref_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::text[], '{}'), $10, $11)
		 RETURNING id, run_item_id, actor, verdict, comment, start_time, end_time, platform, version, tags, actor_kind, actor_ref_id, created_at`,
		itemID, res.Actor, res.Verdict, res.Comment, res.StartTime, res.EndTime, res.Platform, res.Version, res.Tags, actorKind, refID,
	).Scan(&out.ID, &out.RunItemID, &out.Actor, &out.Verdict, &out.Comment,
		&out.StartTime, &out.EndTime, &out.Platform, &out.Version, &out.Tags, &out.ActorKind, &outRef, &out.CreatedAt)
	if err != nil {
		return domain.Result{}, err
	}
	if outRef != nil {
		out.ActorRefID = *outRef
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

	if err := linkStagedAttachments(ctx, tx, itemID, out.ID, res.AttachmentIDs); err != nil {
		return domain.Result{}, err
	}
	if _, err := insertInlineAttachments(ctx, tx, itemID, out.ID, res.Attachments); err != nil {
		return domain.Result{}, err
	}
	if len(res.AttachmentIDs) > 0 || len(res.Attachments) > 0 {
		// Read back within the same transaction — a separate pool
		// connection would not yet see these uncommitted inserts/updates.
		rows, err := tx.Query(ctx, `SELECT `+attachmentColumns+` FROM result_attachments WHERE result_id = $1 ORDER BY created_at, id`, out.ID)
		if err != nil {
			return domain.Result{}, err
		}
		for rows.Next() {
			att, err := scanAttachment(rows)
			if err != nil {
				rows.Close()
				return domain.Result{}, err
			}
			out.Attachments = append(out.Attachments, att)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return domain.Result{}, err
		}
		rows.Close()
	}

	return out, tx.Commit(ctx)
}

func (r *RunRepo) Results(ctx context.Context, itemID string) ([]domain.Result, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, run_item_id, actor, verdict, comment, start_time, end_time, platform, version, tags, actor_kind, actor_ref_id, created_at
		 FROM test_run_results WHERE run_item_id = $1 ORDER BY created_at, id`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []domain.Result{}
	for rows.Next() {
		var res domain.Result
		var refID *string
		if err := rows.Scan(&res.ID, &res.RunItemID, &res.Actor, &res.Verdict, &res.Comment,
			&res.StartTime, &res.EndTime, &res.Platform, &res.Version, &res.Tags, &res.ActorKind, &refID, &res.CreatedAt); err != nil {
			return nil, err
		}
		if refID != nil {
			res.ActorRefID = *refID
		}
		results = append(results, res)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	ids := make([]string, len(results))
	for i, res := range results {
		ids[i] = res.ID
	}
	byResult, err := attachmentsByResults(ctx, r.pool, ids)
	if err != nil {
		return nil, err
	}
	for i, res := range results {
		results[i].Attachments = byResult[res.ID]
	}
	return results, nil
}

func (r *RunRepo) SetItemStatus(ctx context.Context, itemID string, status domain.Status) error {
	if err := checkItemRunOpen(ctx, r.pool, itemID); err != nil {
		return err
	}
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

func (r *RunRepo) AssignItemToUser(ctx context.Context, itemID, userID string) error {
	if err := checkItemRunOpen(ctx, r.pool, itemID); err != nil {
		return err
	}
	tag, err := r.pool.Exec(ctx,
		`UPDATE test_run_items SET assignee_user_id = $2, assignee_team_id = NULL WHERE id = $1`, itemID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *RunRepo) AssignItemToTeam(ctx context.Context, itemID, teamID string) error {
	if err := checkItemRunOpen(ctx, r.pool, itemID); err != nil {
		return err
	}
	tag, err := r.pool.Exec(ctx,
		`UPDATE test_run_items SET assignee_team_id = $2, assignee_user_id = NULL WHERE id = $1`, itemID, teamID)
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

// ProjectStatusSummary aggregates current_status counts across every run
// item in a project, across every run regardless of open/closed status —
// the same GROUP BY shape as Summary, scoped up from run_id to project_id
// (add-project-reports-page).
func (r *RunRepo) ProjectStatusSummary(ctx context.Context, projectID string) (domain.ProjectStatusSummary, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT i.current_status, count(*)
		 FROM test_run_items i
		 JOIN test_runs r ON r.id = i.run_id
		 WHERE r.project_id = $1
		 GROUP BY i.current_status`, projectID)
	if err != nil {
		return domain.ProjectStatusSummary{}, err
	}
	defer rows.Close()

	sum := domain.ProjectStatusSummary{Counts: map[domain.Status]int{}}
	for rows.Next() {
		var status domain.Status
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return domain.ProjectStatusSummary{}, err
		}
		sum.Counts[status] = count
		sum.Total += count
	}
	return sum, rows.Err()
}
