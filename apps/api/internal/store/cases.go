package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CaseRepo struct {
	pool *pgxpool.Pool
}

// ProjectID resolves the project a case belongs to — used by
// requirePermission's per-resource resolver (add-project-rbac design.md D5).
func (r *CaseRepo) ProjectID(ctx context.Context, caseID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM test_cases WHERE id = $1`, caseID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// IDByKey resolves a case's key to its internal id — used at the API
// boundary to translate a key-based path/body identifier before delegating
// to UUID-based service/store calls (add-human-readable-keys D4).
func (r *CaseRepo) IDByKey(ctx context.Context, key string) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx,
		`SELECT id FROM test_cases WHERE key = $1 AND NOT deleted`, key,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

// IDByKeyInProject resolves a case's key to its internal id, scoped to one
// project — a key belonging to a different project is ErrNotFound, not a
// match (add-execution-import: an import only ever matches within its own
// target project).
func (r *CaseRepo) IDByKeyInProject(ctx context.Context, projectID, key string) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx,
		`SELECT id FROM test_cases WHERE key = $1 AND project_id = $2 AND NOT deleted`, key, projectID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

// Create inserts a case and its version 1 in one transaction. An empty
// folderID resolves to the project's root folder (design D8).
func (r *CaseRepo) Create(ctx context.Context, projectID, folderID string, content domain.CaseContent) (domain.TestCase, error) {
	steps, err := marshalSteps(content.Steps)
	if err != nil {
		return domain.TestCase{}, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.TestCase{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if folderID == "" {
		if err := tx.QueryRow(ctx,
			`SELECT id FROM test_case_folders WHERE project_id = $1 AND parent_folder_id IS NULL`,
			projectID).Scan(&folderID); err != nil {
			return domain.TestCase{}, fmt.Errorf("resolving root folder: %w", err)
		}
	}

	key, err := claimEntityKey(ctx, tx, projectID, "case", "%s-%d")
	if err != nil {
		return domain.TestCase{}, fmt.Errorf("claiming case key: %w", err)
	}

	var c domain.TestCase
	err = tx.QueryRow(ctx,
		`INSERT INTO test_cases (key, project_id, folder_id) VALUES ($1, $2, $3)
		 RETURNING id, key, project_id, folder_id, current_version, created_at`, key, projectID, folderID,
	).Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt)
	if err != nil {
		return domain.TestCase{}, err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO test_case_versions (case_id, version, title, description, steps, expected_result, priority, tags, platform, test_type, automated)
		 VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		c.ID, content.Title, content.Description, steps, content.ExpectedResult,
		defaultPriority(content.Priority), tagsOrEmpty(content.Tags),
		content.Platform, content.TestType, content.Automated)
	if err != nil {
		return domain.TestCase{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.TestCase{}, err
	}
	c.Content = normalizeContent(content)
	return c, nil
}

// NewVersion appends an immutable version and bumps current_version.
func (r *CaseRepo) NewVersion(ctx context.Context, caseID string, content domain.CaseContent) (domain.TestCase, error) {
	steps, err := marshalSteps(content.Steps)
	if err != nil {
		return domain.TestCase{}, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.TestCase{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var c domain.TestCase
	err = tx.QueryRow(ctx,
		`UPDATE test_cases SET current_version = current_version + 1
		 WHERE id = $1 AND NOT deleted
		 RETURNING id, key, project_id, current_version, created_at`, caseID,
	).Scan(&c.ID, &c.Key, &c.ProjectID, &c.CurrentVersion, &c.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TestCase{}, ErrNotFound
	}
	if err != nil {
		return domain.TestCase{}, err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO test_case_versions (case_id, version, title, description, steps, expected_result, priority, tags, platform, test_type, automated)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		c.ID, c.CurrentVersion, content.Title, content.Description, steps,
		content.ExpectedResult, defaultPriority(content.Priority), tagsOrEmpty(content.Tags),
		content.Platform, content.TestType, content.Automated)
	if err != nil {
		return domain.TestCase{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.TestCase{}, err
	}
	c.Content = normalizeContent(content)
	return c, nil
}

func (r *CaseRepo) Get(ctx context.Context, caseID string) (domain.TestCase, error) {
	var (
		c                            domain.TestCase
		title, description, expected string
		priority                     string
		stepsJSON                    []byte
		tags                         []string
		platform, testType           string
		automated                    bool
	)
	err := r.pool.QueryRow(ctx,
		`SELECT c.id, c.key, c.project_id, c.folder_id, c.current_version, c.created_at,
		        v.title, v.description, v.steps, v.expected_result, v.priority, v.tags, v.platform, v.test_type, v.automated
		 FROM test_cases c
		 JOIN test_case_versions v ON v.case_id = c.id AND v.version = c.current_version
		 WHERE c.id = $1 AND NOT c.deleted`, caseID,
	).Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt,
		&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TestCase{}, ErrNotFound
	}
	if err != nil {
		return domain.TestCase{}, err
	}
	content, err := scanContent(&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated)()
	if err != nil {
		return domain.TestCase{}, err
	}
	c.Content = content
	return c, nil
}

func (r *CaseRepo) List(ctx context.Context, projectID string) ([]domain.TestCase, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT c.id, c.key, c.project_id, c.folder_id, c.current_version, c.created_at,
		        v.title, v.description, v.steps, v.expected_result, v.priority, v.tags, v.platform, v.test_type, v.automated
		 FROM test_cases c
		 JOIN test_case_versions v ON v.case_id = c.id AND v.version = c.current_version
		 WHERE c.project_id = $1 AND NOT c.deleted
		 ORDER BY c.created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cases := []domain.TestCase{}
	for rows.Next() {
		var (
			c                            domain.TestCase
			title, description, expected string
			priority                     string
			stepsJSON                    []byte
			tags                         []string
			platform, testType           string
			automated                    bool
		)
		if err := rows.Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt,
			&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated); err != nil {
			return nil, err
		}
		content, err := scanContent(&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated)()
		if err != nil {
			return nil, err
		}
		c.Content = content
		cases = append(cases, c)
	}
	return cases, rows.Err()
}

func (r *CaseRepo) Versions(ctx context.Context, caseID string) ([]domain.CaseVersion, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT case_id, version, created_at, `+contentColumns+`
		 FROM test_case_versions WHERE case_id = $1 ORDER BY version`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := []domain.CaseVersion{}
	for rows.Next() {
		var (
			v                            domain.CaseVersion
			title, description, expected string
			priority                     string
			stepsJSON                    []byte
			tags                         []string
			platform, testType           string
			automated                    bool
		)
		if err := rows.Scan(&v.CaseID, &v.Version, &v.CreatedAt,
			&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated); err != nil {
			return nil, err
		}
		content, err := scanContent(&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated)()
		if err != nil {
			return nil, err
		}
		v.Content = content
		versions = append(versions, v)
	}
	return versions, rows.Err()
}

// Move relocates a case to a different folder. Suite membership is
// unaffected — folders and suites are orthogonal (design D8).
func (r *CaseRepo) Move(ctx context.Context, caseID, folderID string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE test_cases SET folder_id = $2 WHERE id = $1 AND NOT deleted`, caseID, folderID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *CaseRepo) SoftDelete(ctx context.Context, caseID string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE test_cases SET deleted = true WHERE id = $1 AND NOT deleted`, caseID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func defaultPriority(p domain.Priority) domain.Priority {
	if p == "" {
		return domain.PriorityMedium
	}
	return p
}

func tagsOrEmpty(tags []string) []string {
	if tags == nil {
		return []string{}
	}
	return tags
}

func normalizeContent(c domain.CaseContent) domain.CaseContent {
	c.Priority = defaultPriority(c.Priority)
	c.Tags = tagsOrEmpty(c.Tags)
	if c.Steps == nil {
		c.Steps = []domain.Step{}
	}
	return c
}
