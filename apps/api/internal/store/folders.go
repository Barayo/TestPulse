package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type FolderRepo struct {
	pool *pgxpool.Pool
}

// ErrRootFolder is returned when an operation that isn't allowed on a
// project's root folder (e.g. deletion) is attempted.
var ErrRootFolder = fmt.Errorf("root folder cannot be deleted")

func scanFolder(row pgx.Row) (domain.Folder, error) {
	var f domain.Folder
	var parent *string
	if err := row.Scan(&f.ID, &f.ProjectID, &parent, &f.Name, &f.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Folder{}, ErrNotFound
		}
		return domain.Folder{}, err
	}
	if parent != nil {
		f.ParentFolderID = *parent
	}
	return f, nil
}

const folderColumns = "id, project_id, parent_folder_id, name, created_at"

// ProjectID resolves the project a folder belongs to — used by
// requirePermission's per-resource resolver (add-project-rbac design.md D5).
func (r *FolderRepo) ProjectID(ctx context.Context, folderID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM test_case_folders WHERE id = $1`, folderID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// Root returns a project's automatically-created root folder (design D8).
func (r *FolderRepo) Root(ctx context.Context, projectID string) (domain.Folder, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+folderColumns+` FROM test_case_folders
		 WHERE project_id = $1 AND parent_folder_id IS NULL`, projectID)
	return scanFolder(row)
}

func (r *FolderRepo) Get(ctx context.Context, folderID string) (domain.Folder, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+folderColumns+` FROM test_case_folders WHERE id = $1`, folderID)
	return scanFolder(row)
}

// Create inserts a subfolder; a parent is always required (only the DB
// trigger on project creation may create a root folder).
func (r *FolderRepo) Create(ctx context.Context, projectID, parentFolderID, name string) (domain.Folder, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO test_case_folders (project_id, parent_folder_id, name)
		 VALUES ($1, $2, $3) RETURNING `+folderColumns,
		projectID, parentFolderID, name)
	return scanFolder(row)
}

// List returns every folder in a project (flat; callers reconstruct the
// tree from ParentFolderID).
func (r *FolderRepo) List(ctx context.Context, projectID string) ([]domain.Folder, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+folderColumns+` FROM test_case_folders WHERE project_id = $1 ORDER BY created_at`,
		projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	folders := []domain.Folder{}
	for rows.Next() {
		f, err := scanFolder(rows)
		if err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}
	return folders, rows.Err()
}

// Delete removes a non-root folder, reparenting its direct child folders and
// cases to the deleted folder's parent (design D8). The root folder cannot
// be deleted.
func (r *FolderRepo) Delete(ctx context.Context, folderID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var parentFolderID *string
	err = tx.QueryRow(ctx,
		`SELECT parent_folder_id FROM test_case_folders WHERE id = $1`, folderID,
	).Scan(&parentFolderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if parentFolderID == nil {
		return ErrRootFolder
	}

	if _, err := tx.Exec(ctx,
		`UPDATE test_case_folders SET parent_folder_id = $2 WHERE parent_folder_id = $1`,
		folderID, *parentFolderID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE test_cases SET folder_id = $2 WHERE folder_id = $1`,
		folderID, *parentFolderID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM test_case_folders WHERE id = $1`, folderID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
