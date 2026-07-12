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
