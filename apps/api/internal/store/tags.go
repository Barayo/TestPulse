package store

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TagRepo manages the shared, deduplicated project tag vocabulary
// (add-project-tags) — a tag name normalizes to lowercase/trimmed on
// assignment so the same typed name always resolves to the same tag,
// regardless of caller casing.
type TagRepo struct {
	pool *pgxpool.Pool
}

func normalizeTagName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// Assign links a tag name to a project, creating the vocabulary entry if it
// doesn't already exist (case-insensitively). Idempotent — assigning the
// same tag to the same project twice is a no-op, not an error.
func (r *TagRepo) Assign(ctx context.Context, projectID, name string) error {
	normalized := normalizeTagName(name)
	var tagID string
	err := r.pool.QueryRow(ctx,
		`INSERT INTO tags (name) VALUES ($1)
		 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
		 RETURNING id`, normalized,
	).Scan(&tagID)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx,
		`INSERT INTO project_tags (project_id, tag_id) VALUES ($1, $2)
		 ON CONFLICT (project_id, tag_id) DO NOTHING`, projectID, tagID)
	return err
}

// Remove unlinks a tag from a project. The tag itself stays in the shared
// vocabulary, available for reuse, even if this was its last assignment. A
// no-op, not an error, when the project didn't have that tag assigned.
func (r *TagRepo) Remove(ctx context.Context, projectID, name string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM project_tags
		 WHERE project_id = $1 AND tag_id = (SELECT id FROM tags WHERE name = $2)`,
		projectID, normalizeTagName(name))
	return err
}

// NamesForProject returns the tag names currently assigned to a project.
func (r *TagRepo) NamesForProject(ctx context.Context, projectID string) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT tags.name FROM project_tags
		 JOIN tags ON tags.id = project_tags.tag_id
		 WHERE project_tags.project_id = $1
		 ORDER BY tags.name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// ListNames returns the full shared tag vocabulary, for filter/picker
// option lists.
func (r *TagRepo) ListNames(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT name FROM tags ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}
