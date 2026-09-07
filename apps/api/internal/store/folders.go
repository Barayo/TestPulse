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
var ErrRootFolder = fmt.Errorf("root folder cannot be moved or deleted")

// ErrFolderCycle is returned when a folder move's target is the folder
// itself or a descendant of it — reparenting into either would disconnect
// the folder from the tree or create an unreachable loop.
var ErrFolderCycle = fmt.Errorf("a folder cannot be moved into itself or one of its own subfolders")

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
// The root folder is never deletable, so no deleted filter is needed here.
func (r *FolderRepo) Root(ctx context.Context, projectID string) (domain.Folder, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+folderColumns+` FROM test_case_folders
		 WHERE project_id = $1 AND parent_folder_id IS NULL`, projectID)
	return scanFolder(row)
}

// Get returns ErrNotFound for a soft-deleted folder, matching CaseRepo.Get's
// behavior for a soft-deleted case (add-delete-mode).
func (r *FolderRepo) Get(ctx context.Context, folderID string) (domain.Folder, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+folderColumns+` FROM test_case_folders WHERE id = $1 AND NOT deleted`, folderID)
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

// List returns every non-deleted folder in a project (flat; callers
// reconstruct the tree from ParentFolderID).
func (r *FolderRepo) List(ctx context.Context, projectID string) ([]domain.Folder, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+folderColumns+` FROM test_case_folders WHERE project_id = $1 AND NOT deleted ORDER BY created_at`,
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

// ListPage is List, cursor-paginated (add-cursor-pagination). Preserves
// List's existing created_at ASC (insertion) order, with id ASC as the
// deterministic tiebreak.
func (r *FolderRepo) ListPage(ctx context.Context, projectID, cursor string, limit int) ([]domain.Folder, string, error) {
	var cursorCreatedAt any
	var cursorID any
	if cursor != "" {
		createdAt, id, err := decodeCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		cursorCreatedAt, cursorID = createdAt, id
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+folderColumns+` FROM test_case_folders
		 WHERE project_id = $1 AND NOT deleted
		   AND ($2::timestamptz IS NULL OR (created_at, id) > ($2, $3))
		 ORDER BY created_at ASC, id ASC
		 LIMIT $4`,
		projectID, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	folders := []domain.Folder{}
	for rows.Next() {
		f, err := scanFolder(rows)
		if err != nil {
			return nil, "", err
		}
		folders = append(folders, f)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(folders) > limit {
		last := folders[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		folders = folders[:limit]
	}
	return folders, nextCursor, nil
}

// subtreeCTE finds every folder in folderID's subtree, including folderID
// itself, via a recursive walk of parent_folder_id — arbitrarily deep,
// avoiding N+1 queries or loading the tree into Go to walk it (add-delete-
// mode design.md). The recursive step is also pinned to the root's own
// project_id -- defense in depth (#175) so a future write bug that lets a
// folder get reparented across a project boundary can't turn a routine
// delete/move in one project into a cascade that reaches into another.
const subtreeCTE = `
	WITH RECURSIVE subtree AS (
		SELECT id, project_id FROM test_case_folders WHERE id = $1
		UNION ALL
		SELECT f.id, f.project_id FROM test_case_folders f
		JOIN subtree s ON f.parent_folder_id = s.id
		WHERE NOT f.deleted AND f.project_id = s.project_id
	)`

// Delete soft-deletes a non-root folder and every folder and case anywhere
// in its subtree, in one transaction (add-delete-mode) — replacing the
// previous reparent-then-hard-delete behavior. The root folder cannot be
// deleted.
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
		subtreeCTE+` UPDATE test_cases SET deleted = true
		 WHERE folder_id IN (SELECT id FROM subtree) AND NOT deleted`,
		folderID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		subtreeCTE+` UPDATE test_case_folders SET deleted = true
		 WHERE id IN (SELECT id FROM subtree)`,
		folderID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Move reparents folderID under targetParentID. Rejects moving the root
// folder (ErrRootFolder, it has no parent) and rejects a target that is
// folderID itself or anywhere in its own subtree (ErrFolderCycle), reusing
// subtreeCTE rather than walking the tree in Go.
func (r *FolderRepo) Move(ctx context.Context, folderID, targetParentID string) (domain.Folder, error) {
	var parentFolderID *string
	err := r.pool.QueryRow(ctx,
		`SELECT parent_folder_id FROM test_case_folders WHERE id = $1 AND NOT deleted`, folderID,
	).Scan(&parentFolderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Folder{}, ErrNotFound
	}
	if err != nil {
		return domain.Folder{}, err
	}
	if parentFolderID == nil {
		return domain.Folder{}, ErrRootFolder
	}

	var inSubtree bool
	if err := r.pool.QueryRow(ctx,
		subtreeCTE+` SELECT EXISTS (SELECT 1 FROM subtree WHERE id = $2)`,
		folderID, targetParentID,
	).Scan(&inSubtree); err != nil {
		return domain.Folder{}, err
	}
	if inSubtree {
		return domain.Folder{}, ErrFolderCycle
	}

	row := r.pool.QueryRow(ctx,
		`UPDATE test_case_folders SET parent_folder_id = $2 WHERE id = $1 RETURNING `+folderColumns,
		folderID, targetParentID)
	return scanFolder(row)
}

// SubtreeCounts previews how many cases and descendant folders (not
// including folderID itself) a delete of folderID would remove — computed
// before the confirmation dialog opens (add-delete-mode design.md).
func (r *FolderRepo) SubtreeCounts(ctx context.Context, folderID string) (caseCount, folderCount int, err error) {
	err = r.pool.QueryRow(ctx,
		subtreeCTE+`
		 SELECT
		   (SELECT count(*) FROM test_cases WHERE folder_id IN (SELECT id FROM subtree) AND NOT deleted),
		   (SELECT count(*) FROM subtree) - 1`,
		folderID).Scan(&caseCount, &folderCount)
	return caseCount, folderCount, err
}
