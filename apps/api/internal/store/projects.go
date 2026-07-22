package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProjectRepo struct {
	pool *pgxpool.Pool
}

// maxKeyCollisionAttempts bounds the numeric-suffix retry loop in Create —
// practically unreachable, just a safety bound against an infinite loop bug
// (add-human-readable-keys design.md D1).
const maxKeyCollisionAttempts = 50

// Create inserts a project with a key derived from name (add-human-readable-keys
// D1). On a key collision (Postgres unique-violation 23505 on projects.key)
// it retries with a numeric-suffixed candidate until one is free.
func (r *ProjectRepo) Create(ctx context.Context, name, description string) (domain.Project, error) {
	base := domain.DeriveProjectKey(name)
	candidate := base
	for attempt := 1; attempt <= maxKeyCollisionAttempts; attempt++ {
		var p domain.Project
		err := r.pool.QueryRow(ctx,
			`INSERT INTO projects (key, name, description) VALUES ($1, $2, $3)
			 RETURNING id, key, name, archived, description, is_sample, created_at`, candidate, name, description,
		).Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.CreatedAt)
		if err == nil {
			return p, nil
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "projects_key_key" {
			candidate = fmt.Sprintf("%s%d", base, attempt+1)
			continue
		}
		return domain.Project{}, err
	}
	return domain.Project{}, fmt.Errorf("could not find a unique key for project %q after %d attempts", name, maxKeyCollisionAttempts)
}

func (r *ProjectRepo) Get(ctx context.Context, id string) (domain.Project, error) {
	var p domain.Project
	err := r.pool.QueryRow(ctx,
		`SELECT id, key, name, archived, description, is_sample, created_at FROM projects WHERE id = $1`, id,
	).Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.CreatedAt)
	if err != nil {
		return domain.Project{}, ErrNotFound
	}
	return p, nil
}

// MarkSample flags a project as the automatically-seeded showroom project
// (add-sample-project) — called once, right after creating it, rather than
// threading an isSample parameter through Create (which every normal
// project-creation call site would then need to pass false for).
func (r *ProjectRepo) MarkSample(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE projects SET is_sample = true WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// IDByKey resolves a project's key to its internal id — used at the API
// boundary to translate a key-based path param before delegating to
// UUID-based service/store calls (add-human-readable-keys D4).
func (r *ProjectRepo) IDByKey(ctx context.Context, key string) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `SELECT id FROM projects WHERE key = $1`, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

func (r *ProjectRepo) List(ctx context.Context) ([]domain.Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, key, name, archived, description, is_sample, created_at FROM projects ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

// ListForMember returns every project userID has an effective role on —
// directly assigned or via a team — for non-Tenant-Admins, whose project
// list is scoped to membership (design.md D6). Tenant Admins use List
// instead (implicit access to everything).
func (r *ProjectRepo) ListForMember(ctx context.Context, userID string) ([]domain.Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT p.id, p.key, p.name, p.archived, p.description, p.is_sample, p.created_at
		 FROM projects p
		 WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id = $1)
		    OR p.id IN (
		        SELECT ptr.project_id FROM project_team_roles ptr
		        JOIN team_members tm ON tm.team_id = ptr.team_id
		        WHERE tm.user_id = $1
		    )
		 ORDER BY p.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.CreatedAt); err != nil {
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

func (r *ProjectRepo) SetDescription(ctx context.Context, id, description string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE projects SET description = $2 WHERE id = $1`, id, description)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Star marks a project as one of the caller's favorites. Idempotent — a
// second star from the same user is a no-op, not an error.
func (r *ProjectRepo) Star(ctx context.Context, userID, projectID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO project_favorites (user_id, project_id) VALUES ($1, $2)
		 ON CONFLICT (user_id, project_id) DO NOTHING`, userID, projectID)
	return err
}

// Unstar removes a project from the caller's favorites. A no-op, not an
// error, when the project wasn't favorited.
func (r *ProjectRepo) Unstar(ctx context.Context, userID, projectID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM project_favorites WHERE user_id = $1 AND project_id = $2`, userID, projectID)
	return err
}

func (r *ProjectRepo) IsFavorite(ctx context.Context, userID, projectID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM project_favorites WHERE user_id = $1 AND project_id = $2)`,
		userID, projectID,
	).Scan(&exists)
	return exists, err
}

// Summaries returns, per non-archived project, its suite count, case count,
// latest-run pass rate, and whether userID has favorited it — as four
// grouped queries (design.md D3), not one query per project, so the cost
// stays O(1) in the number of HTTP round trips regardless of how many
// projects exist.
func (r *ProjectRepo) Summaries(ctx context.Context, userID string) ([]domain.ProjectSummary, error) {
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
		        r.created_at,
		        count(i.id) AS total,
		        count(i.id) FILTER (WHERE i.current_status = 'pass') AS pass_count
		 FROM (
		     SELECT DISTINCT ON (project_id) id, project_id, created_at
		     FROM test_runs
		     ORDER BY project_id, created_at DESC
		 ) r
		 LEFT JOIN test_run_items i ON i.run_id = r.id
		 GROUP BY r.project_id, r.created_at`)
	if err != nil {
		return nil, err
	}
	for passRates.Next() {
		var projectID string
		var lastRunAt time.Time
		var total, passCount int
		if err := passRates.Scan(&projectID, &lastRunAt, &total, &passCount); err != nil {
			passRates.Close()
			return nil, err
		}
		if s, ok := summaries[projectID]; ok {
			s.LastRunAt = &lastRunAt
			if total > 0 {
				rate := int(float64(passCount) / float64(total) * 100)
				s.PassRate = &rate
			}
		}
	}
	passRates.Close()
	if err := passRates.Err(); err != nil {
		return nil, err
	}

	favorites, err := r.pool.Query(ctx,
		`SELECT project_id FROM project_favorites WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	for favorites.Next() {
		var projectID string
		if err := favorites.Scan(&projectID); err != nil {
			favorites.Close()
			return nil, err
		}
		if s, ok := summaries[projectID]; ok {
			s.IsFavorite = true
		}
	}
	favorites.Close()
	if err := favorites.Err(); err != nil {
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
