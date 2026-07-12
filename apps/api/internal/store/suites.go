package store

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SuiteRepo struct {
	pool *pgxpool.Pool
}

func (r *SuiteRepo) Create(ctx context.Context, projectID, name string) (domain.Suite, error) {
	var s domain.Suite
	err := r.pool.QueryRow(ctx,
		`INSERT INTO test_suites (project_id, name) VALUES ($1, $2)
		 RETURNING id, project_id, name, created_at`, projectID, name,
	).Scan(&s.ID, &s.ProjectID, &s.Name, &s.CreatedAt)
	s.CaseIDs = []string{}
	return s, err
}

func (r *SuiteRepo) Get(ctx context.Context, suiteID string) (domain.Suite, error) {
	var s domain.Suite
	err := r.pool.QueryRow(ctx,
		`SELECT id, project_id, name, created_at FROM test_suites WHERE id = $1`, suiteID,
	).Scan(&s.ID, &s.ProjectID, &s.Name, &s.CreatedAt)
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
	defer rows.Close()

	s.CaseIDs = []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return domain.Suite{}, err
		}
		s.CaseIDs = append(s.CaseIDs, id)
	}
	return s, rows.Err()
}

func (r *SuiteRepo) List(ctx context.Context, projectID string) ([]domain.Suite, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, project_id, name, created_at FROM test_suites
		 WHERE project_id = $1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	suites := []domain.Suite{}
	for rows.Next() {
		var s domain.Suite
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.Name, &s.CreatedAt); err != nil {
			return nil, err
		}
		suites = append(suites, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range suites {
		full, err := r.Get(ctx, suites[i].ID)
		if err != nil {
			return nil, err
		}
		suites[i].CaseIDs = full.CaseIDs
	}
	return suites, nil
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
