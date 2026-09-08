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

// IDsByKeys resolves every one of keys to its internal id in a single
// batched query, rather than one round trip per key (#180: CreateRun's
// case-key resolution looped a query per key, an unbounded N+1 reachable
// by any actor holding runCreate). A key with no matching, non-deleted
// case is simply absent from the returned map — callers detect a missing
// key themselves by checking for it, the same way a single IDByKey miss
// surfaces as ErrNotFound at the call site.
func (r *CaseRepo) IDsByKeys(ctx context.Context, keys []string) (map[string]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT key, id FROM test_cases WHERE key = ANY($1) AND NOT deleted`, keys,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byKey := make(map[string]string, len(keys))
	for rows.Next() {
		var key, id string
		if err := rows.Scan(&key, &id); err != nil {
			return nil, err
		}
		byKey[key] = id
	}
	return byKey, rows.Err()
}

// ProjectIDs resolves every one of ids to its project id in a single
// batched query, rather than one round trip per id (#180, same
// N+1 as IDsByKeys). An id with no matching case row is simply absent
// from the returned map.
func (r *CaseRepo) ProjectIDs(ctx context.Context, ids []string) (map[string]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, project_id FROM test_cases WHERE id = ANY($1)`, ids,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := make(map[string]string, len(ids))
	for rows.Next() {
		var id, projectID string
		if err := rows.Scan(&id, &projectID); err != nil {
			return nil, err
		}
		byID[id] = projectID
	}
	return byID, rows.Err()
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
func (r *CaseRepo) Create(ctx context.Context, projectID, folderID string, content domain.CaseContent, actorKind domain.ResultActorKind, actorRefID string) (domain.TestCase, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.TestCase{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	folderID, err = resolveFolderID(ctx, tx, projectID, folderID)
	if err != nil {
		return domain.TestCase{}, err
	}
	c, err := insertCase(ctx, tx, projectID, folderID, content, actorKind, actorRefID)
	if err != nil {
		return domain.TestCase{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.TestCase{}, err
	}
	return c, nil
}

// CreateBatch inserts every content in contents, all in one transaction: if
// any insert fails (invalid data the caller's own validation missed, or a
// DB-level constraint), none of the batch is created (add-mcp-server's
// bulk_add_cases tool — atomic, all-or-nothing per design.md). All cases
// share the same projectID/folderID, matching how a single agent tool call
// populates one suite in one place.
func (r *CaseRepo) CreateBatch(ctx context.Context, projectID, folderID string, contents []domain.CaseContent, actorKind domain.ResultActorKind, actorRefID string) ([]domain.TestCase, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	folderID, err = resolveFolderID(ctx, tx, projectID, folderID)
	if err != nil {
		return nil, err
	}
	cases := make([]domain.TestCase, 0, len(contents))
	for _, content := range contents {
		c, err := insertCase(ctx, tx, projectID, folderID, content, actorKind, actorRefID)
		if err != nil {
			return nil, err
		}
		cases = append(cases, c)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return cases, nil
}

// resolveFolderID returns folderID unchanged unless it's empty, in which
// case it resolves to projectID's root folder (design D8).
func resolveFolderID(ctx context.Context, tx pgx.Tx, projectID, folderID string) (string, error) {
	if folderID != "" {
		return folderID, nil
	}
	if err := tx.QueryRow(ctx,
		`SELECT id FROM test_case_folders WHERE project_id = $1 AND parent_folder_id IS NULL`,
		projectID).Scan(&folderID); err != nil {
		return "", fmt.Errorf("resolving root folder: %w", err)
	}
	return folderID, nil
}

// insertCase inserts one case and its version 1 within tx, the shared logic
// behind both Create and CreateBatch.
func insertCase(ctx context.Context, tx pgx.Tx, projectID, folderID string, content domain.CaseContent, actorKind domain.ResultActorKind, actorRefID string) (domain.TestCase, error) {
	steps, err := marshalSteps(content.Steps)
	if err != nil {
		return domain.TestCase{}, err
	}
	customFields, err := marshalCustomFields(content.CustomFields)
	if err != nil {
		return domain.TestCase{}, err
	}

	key, err := claimEntityKey(ctx, tx, projectID, "case", "%s-%d")
	if err != nil {
		return domain.TestCase{}, fmt.Errorf("claiming case key: %w", err)
	}

	var refID *string
	if actorRefID != "" {
		refID = &actorRefID
	}

	var c domain.TestCase
	err = tx.QueryRow(ctx,
		`INSERT INTO test_cases (key, project_id, folder_id) VALUES ($1, $2, $3)
		 RETURNING id, key, project_id, folder_id, current_version, created_at`, key, projectID, folderID,
	).Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt)
	if err != nil {
		return domain.TestCase{}, err
	}
	err = tx.QueryRow(ctx,
		`INSERT INTO test_case_versions (case_id, version, title, description, steps, expected_result, priority, tags, platform, test_type, automated, custom_fields, format, gherkin_source, actor_kind, actor_ref_id)
		 VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		 RETURNING created_at`,
		c.ID, content.Title, content.Description, steps, content.ExpectedResult,
		defaultPriority(content.Priority), tagsOrEmpty(content.Tags),
		content.Platform, content.TestType, content.Automated, customFields,
		defaultFormat(content.Format), content.GherkinSource, actorKind, refID,
	).Scan(&c.UpdatedAt)
	if err != nil {
		return domain.TestCase{}, err
	}
	c.Content = normalizeContent(content)
	return c, nil
}

// NewVersion appends an immutable version and bumps current_version.
func (r *CaseRepo) NewVersion(ctx context.Context, caseID string, content domain.CaseContent, actorKind domain.ResultActorKind, actorRefID string) (domain.TestCase, error) {
	steps, err := marshalSteps(content.Steps)
	if err != nil {
		return domain.TestCase{}, err
	}
	customFields, err := marshalCustomFields(content.CustomFields)
	if err != nil {
		return domain.TestCase{}, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.TestCase{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var refID *string
	if actorRefID != "" {
		refID = &actorRefID
	}

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
	err = tx.QueryRow(ctx,
		`INSERT INTO test_case_versions (case_id, version, title, description, steps, expected_result, priority, tags, platform, test_type, automated, custom_fields, format, gherkin_source, actor_kind, actor_ref_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		 RETURNING created_at`,
		c.ID, c.CurrentVersion, content.Title, content.Description, steps,
		content.ExpectedResult, defaultPriority(content.Priority), tagsOrEmpty(content.Tags),
		content.Platform, content.TestType, content.Automated, customFields,
		defaultFormat(content.Format), content.GherkinSource, actorKind, refID,
	).Scan(&c.UpdatedAt)
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
		customFieldsJSON             []byte
		format, gherkinSource        string
	)
	err := r.pool.QueryRow(ctx,
		`SELECT c.id, c.key, c.project_id, c.folder_id, c.current_version, c.created_at, v.created_at,
		        v.title, v.description, v.steps, v.expected_result, v.priority, v.tags, v.platform, v.test_type, v.automated, v.custom_fields, v.format, v.gherkin_source,
		        c.jira_issue_key, c.jira_issue_summary, c.jira_issue_status, c.jira_last_synced_at
		 FROM test_cases c
		 JOIN test_case_versions v ON v.case_id = c.id AND v.version = c.current_version
		 WHERE c.id = $1 AND NOT c.deleted`, caseID,
	).Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt, &c.UpdatedAt,
		&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated, &customFieldsJSON, &format, &gherkinSource,
		&c.JiraIssueKey, &c.JiraIssueSummary, &c.JiraIssueStatus, &c.JiraLastSyncedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TestCase{}, ErrNotFound
	}
	if err != nil {
		return domain.TestCase{}, err
	}
	content, err := scanContent(&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated, &customFieldsJSON, &format, &gherkinSource)()
	if err != nil {
		return domain.TestCase{}, err
	}
	c.Content = content
	return c, nil
}

func (r *CaseRepo) List(ctx context.Context, projectID string) ([]domain.TestCase, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT c.id, c.key, c.project_id, c.folder_id, c.current_version, c.created_at, v.created_at,
		        v.title, v.description, v.steps, v.expected_result, v.priority, v.tags, v.platform, v.test_type, v.automated, v.custom_fields, v.format, v.gherkin_source,
		        c.jira_issue_key, c.jira_issue_summary, c.jira_issue_status, c.jira_last_synced_at
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
			customFieldsJSON             []byte
			format, gherkinSource        string
		)
		if err := rows.Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt, &c.UpdatedAt,
			&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated, &customFieldsJSON, &format, &gherkinSource,
			&c.JiraIssueKey, &c.JiraIssueSummary, &c.JiraIssueStatus, &c.JiraLastSyncedAt); err != nil {
			return nil, err
		}
		content, err := scanContent(&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated, &customFieldsJSON, &format, &gherkinSource)()
		if err != nil {
			return nil, err
		}
		c.Content = content
		cases = append(cases, c)
	}
	return cases, rows.Err()
}

// ListPage is List, cursor-paginated (add-cursor-pagination). Preserves
// List's existing created_at ASC (insertion) order, with id ASC as the
// deterministic tiebreak.
func (r *CaseRepo) ListPage(ctx context.Context, projectID, cursor string, limit int) ([]domain.TestCase, string, error) {
	limit = clampLimit(limit)
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
		`SELECT c.id, c.key, c.project_id, c.folder_id, c.current_version, c.created_at, v.created_at,
		        v.title, v.description, v.steps, v.expected_result, v.priority, v.tags, v.platform, v.test_type, v.automated, v.custom_fields, v.format, v.gherkin_source,
		        c.jira_issue_key, c.jira_issue_summary, c.jira_issue_status, c.jira_last_synced_at
		 FROM test_cases c
		 JOIN test_case_versions v ON v.case_id = c.id AND v.version = c.current_version
		 WHERE c.project_id = $1 AND NOT c.deleted
		   AND ($2::timestamptz IS NULL OR (c.created_at, c.id) > ($2, $3))
		 ORDER BY c.created_at ASC, c.id ASC
		 LIMIT $4`, projectID, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", err
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
			customFieldsJSON             []byte
			format, gherkinSource        string
		)
		if err := rows.Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt, &c.UpdatedAt,
			&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated, &customFieldsJSON, &format, &gherkinSource,
			&c.JiraIssueKey, &c.JiraIssueSummary, &c.JiraIssueStatus, &c.JiraLastSyncedAt); err != nil {
			return nil, "", err
		}
		content, err := scanContent(&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated, &customFieldsJSON, &format, &gherkinSource)()
		if err != nil {
			return nil, "", err
		}
		c.Content = content
		cases = append(cases, c)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(cases) > limit {
		last := cases[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		cases = cases[:limit]
	}
	return cases, nextCursor, nil
}

func (r *CaseRepo) Versions(ctx context.Context, caseID string) ([]domain.CaseVersion, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT case_id, version, created_at, actor_kind, actor_ref_id, `+contentColumns+`
		 FROM test_case_versions WHERE case_id = $1 ORDER BY version`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := []domain.CaseVersion{}
	for rows.Next() {
		var (
			v                            domain.CaseVersion
			refID                        *string
			title, description, expected string
			priority                     string
			stepsJSON                    []byte
			tags                         []string
			platform, testType           string
			automated                    bool
			customFieldsJSON             []byte
			format, gherkinSource        string
		)
		if err := rows.Scan(&v.CaseID, &v.Version, &v.CreatedAt, &v.ActorKind, &refID,
			&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated, &customFieldsJSON, &format, &gherkinSource); err != nil {
			return nil, err
		}
		if refID != nil {
			v.ActorRefID = *refID
		}
		content, err := scanContent(&title, &description, &stepsJSON, &expected, &priority, &tags, &platform, &testType, &automated, &customFieldsJSON, &format, &gherkinSource)()
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

// ListJiraLinked returns only cases with a non-null jira_issue_key, via a
// DB-level filter — not a client-side scan of List's full result set
// (add-jira-connector, aggregation-performance-caution).
func (r *CaseRepo) ListJiraLinked(ctx context.Context, projectID string) ([]domain.TestCase, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT c.id, c.key, c.project_id, c.folder_id, c.current_version, c.created_at,
		        c.jira_issue_key, c.jira_issue_summary, c.jira_issue_status, c.jira_last_synced_at
		 FROM test_cases c
		 WHERE c.project_id = $1 AND NOT c.deleted AND c.jira_issue_key IS NOT NULL
		 ORDER BY c.created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cases := []domain.TestCase{}
	for rows.Next() {
		var c domain.TestCase
		if err := rows.Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt,
			&c.JiraIssueKey, &c.JiraIssueSummary, &c.JiraIssueStatus, &c.JiraLastSyncedAt); err != nil {
			return nil, err
		}
		cases = append(cases, c)
	}
	return cases, rows.Err()
}

// SetJiraLink sets or clears (jiraIssueKey == nil) a case's Jira link.
// Clearing also clears the cached summary/status/sync-timestamp — a cache
// belongs to a specific link, never to no link (add-jira-connector).
func (r *CaseRepo) SetJiraLink(ctx context.Context, caseID string, jiraIssueKey *string) (domain.TestCase, error) {
	var c domain.TestCase
	err := r.pool.QueryRow(ctx,
		`UPDATE test_cases
		 SET jira_issue_key = $2,
		     jira_issue_summary = CASE WHEN $2::text IS NULL THEN NULL ELSE jira_issue_summary END,
		     jira_issue_status = CASE WHEN $2::text IS NULL THEN NULL ELSE jira_issue_status END,
		     jira_last_synced_at = CASE WHEN $2::text IS NULL THEN NULL ELSE jira_last_synced_at END
		 WHERE id = $1 AND NOT deleted
		 RETURNING id, key, project_id, folder_id, current_version, created_at,
		           jira_issue_key, jira_issue_summary, jira_issue_status, jira_last_synced_at`,
		caseID, jiraIssueKey,
	).Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt,
		&c.JiraIssueKey, &c.JiraIssueSummary, &c.JiraIssueStatus, &c.JiraLastSyncedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TestCase{}, ErrNotFound
	}
	return c, err
}

// SetJiraSync writes the Jira connector's cached issue data. Requires the
// case to already have a jiraIssueKey set (ErrJiraLinkNotSet otherwise) —
// cached data always describes an existing link, never an orphan one.
func (r *CaseRepo) SetJiraSync(ctx context.Context, caseID, summary, status string, syncedAt time.Time) (domain.TestCase, error) {
	var c domain.TestCase
	err := r.pool.QueryRow(ctx,
		`UPDATE test_cases
		 SET jira_issue_summary = $2, jira_issue_status = $3, jira_last_synced_at = $4
		 WHERE id = $1 AND NOT deleted AND jira_issue_key IS NOT NULL
		 RETURNING id, key, project_id, folder_id, current_version, created_at,
		           jira_issue_key, jira_issue_summary, jira_issue_status, jira_last_synced_at`,
		caseID, summary, status, syncedAt,
	).Scan(&c.ID, &c.Key, &c.ProjectID, &c.FolderID, &c.CurrentVersion, &c.CreatedAt,
		&c.JiraIssueKey, &c.JiraIssueSummary, &c.JiraIssueStatus, &c.JiraLastSyncedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		// Ambiguous between "case not found" and "no jira link set" — check
		// which, since callers need to tell a bad id from a missing link.
		if _, getErr := r.Get(ctx, caseID); errors.Is(getErr, ErrNotFound) {
			return domain.TestCase{}, ErrNotFound
		}
		return domain.TestCase{}, ErrJiraLinkNotSet
	}
	return c, err
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

func defaultFormat(f domain.Format) domain.Format {
	if f == "" {
		return domain.FormatSteps
	}
	return f
}

func tagsOrEmpty(tags []string) []string {
	if tags == nil {
		return []string{}
	}
	return tags
}

func normalizeContent(c domain.CaseContent) domain.CaseContent {
	c.Priority = defaultPriority(c.Priority)
	c.Format = defaultFormat(c.Format)
	c.Tags = tagsOrEmpty(c.Tags)
	if c.Steps == nil {
		c.Steps = []domain.Step{}
	}
	return c
}
