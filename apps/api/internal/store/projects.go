package store

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProjectRepo struct {
	pool *pgxpool.Pool
}

func (r *ProjectRepo) Create(ctx context.Context, name string) (domain.Project, error) {
	var p domain.Project
	err := r.pool.QueryRow(ctx,
		`INSERT INTO projects (name) VALUES ($1)
		 RETURNING id, name, archived, created_at`, name,
	).Scan(&p.ID, &p.Name, &p.Archived, &p.CreatedAt)
	return p, err
}

func (r *ProjectRepo) Get(ctx context.Context, id string) (domain.Project, error) {
	var p domain.Project
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, archived, created_at FROM projects WHERE id = $1`, id,
	).Scan(&p.ID, &p.Name, &p.Archived, &p.CreatedAt)
	if err != nil {
		return domain.Project{}, ErrNotFound
	}
	return p, nil
}

func (r *ProjectRepo) List(ctx context.Context) ([]domain.Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, archived, created_at FROM projects ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Archived, &p.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func (r *ProjectRepo) Rename(ctx context.Context, id, name string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE projects SET name = $2 WHERE id = $1`, id, name)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Summaries returns, per non-archived project, its suite count, case count,
// and latest-run pass rate — as three grouped queries (design.md), not one
// query per project, so the cost stays O(1) in the number of HTTP round
// trips regardless of how many projects exist.
func (r *ProjectRepo) Summaries(ctx context.Context) ([]domain.ProjectSummary, error) {
	ids, err := r.pool.Query(ctx, `SELECT id FROM projects WHERE NOT archived ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	order := []string{}
	summaries := map[string]*domain.ProjectSummary{}
	for ids.Next() {
		var id string
		if err := ids.Scan(&id); err != nil {
			ids.Close()
			return nil, err
		}
		order = append(order, id)
		summaries[id] = &domain.ProjectSummary{ProjectID: id}
	}
	ids.Close()
	if err := ids.Err(); err != nil {
		return nil, err
	}

	suiteCounts, err := r.pool.Query(ctx,
		`SELECT project_id, count(*) FROM test_suites GROUP BY project_id`)
	if err != nil {
		return nil, err
	}
	for suiteCounts.Next() {
		var projectID string
		var count int
		if err := suiteCounts.Scan(&projectID, &count); err != nil {
			suiteCounts.Close()
			return nil, err
		}
		if s, ok := summaries[projectID]; ok {
			s.SuiteCount = count
		}
	}
	suiteCounts.Close()
	if err := suiteCounts.Err(); err != nil {
		return nil, err
	}

	caseCounts, err := r.pool.Query(ctx,
		`SELECT project_id, count(*) FROM test_cases WHERE NOT deleted GROUP BY project_id`)
	if err != nil {
		return nil, err
	}
	for caseCounts.Next() {
		var projectID string
		var count int
		if err := caseCounts.Scan(&projectID, &count); err != nil {
			caseCounts.Close()
			return nil, err
		}
		if s, ok := summaries[projectID]; ok {
			s.CaseCount = count
		}
	}
	caseCounts.Close()
	if err := caseCounts.Err(); err != nil {
		return nil, err
	}

	passRates, err := r.pool.Query(ctx,
		`SELECT r.project_id,
		        count(i.id) AS total,
		        count(i.id) FILTER (WHERE i.current_status = 'pass') AS pass_count
		 FROM (
		     SELECT DISTINCT ON (project_id) id, project_id
		     FROM test_runs
		     ORDER BY project_id, created_at DESC
		 ) r
		 JOIN test_run_items i ON i.run_id = r.id
		 GROUP BY r.project_id`)
	if err != nil {
		return nil, err
	}
	for passRates.Next() {
		var projectID string
		var total, passCount int
		if err := passRates.Scan(&projectID, &total, &passCount); err != nil {
			passRates.Close()
			return nil, err
		}
		if s, ok := summaries[projectID]; ok && total > 0 {
			rate := int(float64(passCount) / float64(total) * 100)
			s.PassRate = &rate
		}
	}
	passRates.Close()
	if err := passRates.Err(); err != nil {
		return nil, err
	}

	out := make([]domain.ProjectSummary, 0, len(order))
	for _, id := range order {
		out = append(out, *summaries[id])
	}
	return out, nil
}

func (r *ProjectRepo) Archive(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE projects SET archived = true WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
