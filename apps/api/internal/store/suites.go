package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SuiteRepo struct {
	pool *pgxpool.Pool
}

// ProjectID resolves the project a suite belongs to — used by
// requirePermission's per-resource resolver (add-project-rbac design.md D5).
func (r *SuiteRepo) ProjectID(ctx context.Context, suiteID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM test_suites WHERE id = $1`, suiteID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// Create inserts a suite and claims its key in one transaction
// (add-human-readable-keys D2/D3).
func (r *SuiteRepo) Create(ctx context.Context, projectID, name string) (domain.Suite, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Suite{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	key, err := claimEntityKey(ctx, tx, projectID, "suite", "%s-S%d")
	if err != nil {
		return domain.Suite{}, fmt.Errorf("claiming suite key: %w", err)
	}

	var s domain.Suite
	err = tx.QueryRow(ctx,
		`INSERT INTO test_suites (key, project_id, name) VALUES ($1, $2, $3)
		 RETURNING id, key, project_id, name, created_at`, key, projectID, name,
	).Scan(&s.ID, &s.Key, &s.ProjectID, &s.Name, &s.CreatedAt)
	if err != nil {
		return domain.Suite{}, err
	}
	s.CaseIDs = []string{}
	return s, tx.Commit(ctx)
}

// IDByKey resolves a suite's key to its internal id — used at the API
// boundary to translate a key-based path param before delegating to
// UUID-based service/store calls (add-human-readable-keys D4).
func (r *SuiteRepo) IDByKey(ctx context.Context, key string) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `SELECT id FROM test_suites WHERE key = $1`, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

func (r *SuiteRepo) Get(ctx context.Context, suiteID string) (domain.Suite, error) {
	var s domain.Suite
	err := r.pool.QueryRow(ctx,
		`SELECT id, key, project_id, name, created_at FROM test_suites WHERE id = $1`, suiteID,
	).Scan(&s.ID, &s.Key, &s.ProjectID, &s.Name, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Suite{}, ErrNotFound
	}
	if err != nil {
		return domain.Suite{}, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT sc.case_id FROM suite_cases sc
		 JOIN test_cases c ON c.id = sc.case_id AND NOT c.deleted
		 WHERE sc.suite_id = $1 ORDER BY c.created_at`, suiteID)
	if err != nil {
		return domain.Suite{}, err
	}
	s.CaseIDs = []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return domain.Suite{}, err
		}
		s.CaseIDs = append(s.CaseIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return domain.Suite{}, err
	}

	rate, lastRunAt, err := r.latestRunStats(ctx, suiteID)
	if err != nil {
		return domain.Suite{}, err
	}
	s.PassRate = rate
	s.LastRunAt = lastRunAt
	return s, nil
}

// latestRunStats returns the pass rate and created-at of a single suite's
// most recently created run (open or closed — same "latest run" semantic
// ProjectSummary already uses), or nil/nil if it has never had a run.
func (r *SuiteRepo) latestRunStats(ctx context.Context, suiteID string) (*int, *time.Time, error) {
	var lastRunAt time.Time
	var total, passCount int
	err := r.pool.QueryRow(ctx,
		`SELECT r.created_at, count(i.id), count(i.id) FILTER (WHERE i.current_status = 'pass')
		 FROM (
		     SELECT id, created_at FROM test_runs
		     WHERE suite_id = $1 ORDER BY created_at DESC LIMIT 1
		 ) r
		 LEFT JOIN test_run_items i ON i.run_id = r.id
		 GROUP BY r.created_at`, suiteID,
	).Scan(&lastRunAt, &total, &passCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	var rate *int
	if total > 0 {
		r := int(float64(passCount) / float64(total) * 100)
		rate = &r
	}
	return rate, &lastRunAt, nil
}

func (r *SuiteRepo) List(ctx context.Context, projectID string) ([]domain.Suite, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, key, project_id, name, created_at FROM test_suites
		 WHERE project_id = $1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	suites := []domain.Suite{}
	order := []string{}
	byID := map[string]int{}
	for rows.Next() {
		var s domain.Suite
		if err := rows.Scan(&s.ID, &s.Key, &s.ProjectID, &s.Name, &s.CreatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		byID[s.ID] = len(suites)
		order = append(order, s.ID)
		suites = append(suites, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(suites) == 0 {
		return suites, nil
	}

	for i := range suites {
		full, err := r.Get(ctx, suites[i].ID)
		if err != nil {
			return nil, err
		}
		suites[i].CaseIDs = full.CaseIDs
	}

	// Batched "latest run per suite" — one grouped query for every suite in
	// the project, not one query per suite (mirrors ProjectRepo.Summaries;
	// see rework-suites-landing-ux/design.md's revised Decisions).
	statsRows, err := r.pool.Query(ctx,
		`SELECT r.suite_id, r.created_at, count(i.id), count(i.id) FILTER (WHERE i.current_status = 'pass')
		 FROM (
		     SELECT DISTINCT ON (suite_id) id, suite_id, created_at
		     FROM test_runs
		     WHERE suite_id = ANY($1)
		     ORDER BY suite_id, created_at DESC
		 ) r
		 LEFT JOIN test_run_items i ON i.run_id = r.id
		 GROUP BY r.suite_id, r.created_at`, order)
	if err != nil {
		return nil, err
	}
	defer statsRows.Close()
	for statsRows.Next() {
		var suiteID string
		var lastRunAt time.Time
		var total, passCount int
		if err := statsRows.Scan(&suiteID, &lastRunAt, &total, &passCount); err != nil {
			return nil, err
		}
		i, ok := byID[suiteID]
		if !ok {
			continue
		}
		suites[i].LastRunAt = &lastRunAt
		if total > 0 {
			rate := int(float64(passCount) / float64(total) * 100)
			suites[i].PassRate = &rate
		}
	}
	return suites, statsRows.Err()
}

// Rename updates a suite's name and returns the suite as it now stands
// (without its case IDs — callers needing those should follow with Get).
func (r *SuiteRepo) Rename(ctx context.Context, suiteID, name string) (domain.Suite, error) {
	var s domain.Suite
	err := r.pool.QueryRow(ctx,
		`UPDATE test_suites SET name = $2 WHERE id = $1
		 RETURNING id, key, project_id, name, created_at`, suiteID, name,
	).Scan(&s.ID, &s.Key, &s.ProjectID, &s.Name, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Suite{}, ErrNotFound
	}
	return s, err
}

// Delete removes a suite. suite_cases rows cascade automatically
// (ON DELETE CASCADE); any run that named this suite as its source keeps
// its own history but has its suite_id cleared (ON DELETE SET NULL,
// link-runs-to-suite) — member cases and past runs are never touched.
func (r *SuiteRepo) Delete(ctx context.Context, suiteID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM test_suites WHERE id = $1`, suiteID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *SuiteRepo) AddCase(ctx context.Context, suiteID, caseID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO suite_cases (suite_id, case_id) VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`, suiteID, caseID)
	return err
}

func (r *SuiteRepo) RemoveCase(ctx context.Context, suiteID, caseID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM suite_cases WHERE suite_id = $1 AND case_id = $2`, suiteID, caseID)
	return err
}

// Trend returns a suite's pass-rate trend: its closed runs, oldest first,
// each with its full status-count breakdown (add-suite-pass-rate-trend).
// Open runs are excluded — their counts are still mid-flight, not a
// completed outcome.
func (r *SuiteRepo) Trend(ctx context.Context, suiteID string) (domain.SuiteTrend, error) {
	var suiteKey string
	if err := r.pool.QueryRow(ctx, `SELECT key FROM test_suites WHERE id = $1`, suiteID).Scan(&suiteKey); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.SuiteTrend{}, ErrNotFound
		}
		return domain.SuiteTrend{}, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT tr.id, tr.key, tr.name, tr.created_at, tri.current_status, count(*)
		 FROM test_runs tr
		 JOIN test_run_items tri ON tri.run_id = tr.id
		 WHERE tr.suite_id = $1 AND tr.status = 'closed'
		 GROUP BY tr.id, tr.key, tr.name, tr.created_at, tri.current_status
		 ORDER BY tr.created_at ASC`, suiteID)
	if err != nil {
		return domain.SuiteTrend{}, err
	}
	defer rows.Close()

	trend := domain.SuiteTrend{SuiteID: suiteID, SuiteKey: suiteKey, Points: []domain.SuiteTrendPoint{}}
	index := map[string]int{}
	for rows.Next() {
		var runID, runKey, runName string
		var createdAt time.Time
		var status domain.Status
		var count int
		if err := rows.Scan(&runID, &runKey, &runName, &createdAt, &status, &count); err != nil {
			return domain.SuiteTrend{}, err
		}
		i, ok := index[runID]
		if !ok {
			i = len(trend.Points)
			index[runID] = i
			trend.Points = append(trend.Points, domain.SuiteTrendPoint{
				RunKey: runKey, RunName: runName, CreatedAt: createdAt, Counts: map[domain.Status]int{},
			})
		}
		trend.Points[i].Counts[status] = count
		trend.Points[i].Total += count
	}
	return trend, rows.Err()
}
