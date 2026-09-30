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
			 RETURNING id, key, name, archived, description, is_sample, public_access, created_at`, candidate, name, description,
		).Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.PublicAccess, &p.CreatedAt)
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
		`SELECT id, key, name, archived, description, is_sample, public_access, auto_archive_exempt, assignee_restricted_recording, landing_view, created_at FROM projects WHERE id = $1`, id,
	).Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.PublicAccess, &p.AutoArchiveExempt, &p.AssigneeRestrictedRecording, &p.LandingView, &p.CreatedAt)
	if err != nil {
		return domain.Project{}, ErrNotFound
	}
	return p, nil
}

// SetAutoArchiveExempt sets whether this project is exempt from the
// instance-wide auto-archive-inactive-projects policy (design.md D9 of
// add-data-retention). Permission enforcement (Tenant-Admin-only) lives in
// the service layer, not here.
func (r *ProjectRepo) SetAutoArchiveExempt(ctx context.Context, id string, exempt bool) error {
	_, err := r.pool.Exec(ctx, `UPDATE projects SET auto_archive_exempt = $1 WHERE id = $2`, exempt, id)
	return err
}

// SetLandingView sets or clears (view == nil) this project's own
// landing-view override (add-configurable-project-landing design.md D1) —
// nil reverts it to inheriting the instance-wide default.
func (r *ProjectRepo) SetLandingView(ctx context.Context, id string, view *string) error {
	_, err := r.pool.Exec(ctx, `UPDATE projects SET landing_view = $1 WHERE id = $2`, view, id)
	return err
}

// ListEligibleForAutoArchive returns every non-archived, non-exempt,
// non-deleting project whose activity — the newest of its own created_at
// and the most recent created_at across its runs, case versions, and
// suites — is older than days (design.md D9 of add-data-retention). The
// activity signal is computed here, per sweep, rather than maintained as a
// column — one query across all eligible projects, not a per-project round
// trip. A pure age filter — callers (the auto-archive worker) are
// responsible for treating days == 0 as "policy off" before calling this.
func (r *ProjectRepo) ListEligibleForAutoArchive(ctx context.Context, days int) ([]domain.Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.id, p.key, p.name, p.archived, p.description, p.is_sample, p.public_access, p.auto_archive_exempt, p.created_at
		 FROM projects p
		 WHERE p.archived = false
		   AND p.deleting_at IS NULL
		   AND p.auto_archive_exempt = false
		   AND GREATEST(
		         p.created_at,
		         COALESCE((SELECT MAX(created_at) FROM test_runs WHERE project_id = p.id), p.created_at),
		         COALESCE((SELECT MAX(tcv.created_at) FROM test_case_versions tcv JOIN test_cases tc ON tc.id = tcv.case_id WHERE tc.project_id = p.id), p.created_at),
		         COALESCE((SELECT MAX(created_at) FROM test_suites WHERE project_id = p.id), p.created_at)
		       ) < now() - make_interval(days => $1)
		 ORDER BY p.created_at`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.PublicAccess, &p.AutoArchiveExempt, &p.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
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

// KeysByIDs resolves every one of ids to its key in a single batched query,
// rather than one round trip per id (fix-mcp-output-id-leaks, mirroring
// CaseRepo.IDsByKeys' shape). An id with no matching project row is simply
// absent from the returned map.
func (r *ProjectRepo) KeysByIDs(ctx context.Context, ids []string) (map[string]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, key FROM projects WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := make(map[string]string, len(ids))
	for rows.Next() {
		var id, key string
		if err := rows.Scan(&id, &key); err != nil {
			return nil, err
		}
		byID[id] = key
	}
	return byID, rows.Err()
}

// IsArchived reports whether a project is archived, via a cheap
// single-column lookup (mirroring checkRunOpen's style, runs.go) rather
// than a full Get — this runs on every mutating request in the app once
// wired into Service.EnsureProjectWritable (enforce-archived-project-readonly).
// Only a genuine "no such row" collapses to ErrNotFound — any other error
// (a dropped connection, a cancelled context, pool exhaustion) propagates
// as itself, since this sits on Authorize, the shared chokepoint for
// nearly every write in the app: masking real infra failures as 404s
// would make them invisible to both the caller and respond()'s own
// error-logging path.
func (r *ProjectRepo) IsArchived(ctx context.Context, id string) (bool, error) {
	var archived bool
	err := r.pool.QueryRow(ctx, `SELECT archived FROM projects WHERE id = $1`, id).Scan(&archived)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	return archived, err
}

func (r *ProjectRepo) List(ctx context.Context) ([]domain.Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, key, name, archived, description, is_sample, public_access, created_at
		 FROM projects WHERE deleting_at IS NULL ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.PublicAccess, &p.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

// ListPage is List, cursor-paginated (add-mcp-search-listprojects-pagination,
// mirroring add-cursor-pagination's established *Page shape) — backs
// list_projects' MCP tool for an unscoped/Tenant-Admin caller. List itself
// is untouched; REST's existing project listing still needs the complete
// set.
func (r *ProjectRepo) ListPage(ctx context.Context, cursor string, limit int) ([]domain.Project, string, error) {
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
		`SELECT id, key, name, archived, description, is_sample, public_access, created_at
		 FROM projects
		 WHERE deleting_at IS NULL
		   AND ($1::timestamptz IS NULL OR (created_at, id) > ($1, $2))
		 ORDER BY created_at ASC, id ASC
		 LIMIT $3`, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.PublicAccess, &p.CreatedAt); err != nil {
			return nil, "", err
		}
		projects = append(projects, p)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(projects) > limit {
		last := projects[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		projects = projects[:limit]
	}
	return projects, nextCursor, nil
}

// ListForMember returns every project userID has an effective role on —
// directly assigned or via a team — for non-Tenant-Admins, whose project
// list is scoped to membership (design.md D6). Tenant Admins use List
// instead (implicit access to everything).
func (r *ProjectRepo) ListForMember(ctx context.Context, userID string) ([]domain.Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT p.id, p.key, p.name, p.archived, p.description, p.is_sample, p.public_access, p.created_at
		 FROM projects p
		 WHERE p.deleting_at IS NULL
		   AND (p.id IN (SELECT project_id FROM project_members WHERE user_id = $1)
		    OR p.id IN (
		        SELECT ptr.project_id FROM project_team_roles ptr
		        JOIN team_members tm ON tm.team_id = ptr.team_id
		        WHERE tm.user_id = $1
		    ))
		 ORDER BY p.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.PublicAccess, &p.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

// ListForMemberPage is ListForMember, cursor-paginated
// (add-mcp-search-listprojects-pagination) — backs list_projects' MCP
// tool for a scoped/non-admin caller.
func (r *ProjectRepo) ListForMemberPage(ctx context.Context, userID, cursor string, limit int) ([]domain.Project, string, error) {
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
		`SELECT DISTINCT p.id, p.key, p.name, p.archived, p.description, p.is_sample, p.public_access, p.created_at
		 FROM projects p
		 WHERE p.deleting_at IS NULL
		   AND (p.id IN (SELECT project_id FROM project_members WHERE user_id = $1)
		    OR p.id IN (
		        SELECT ptr.project_id FROM project_team_roles ptr
		        JOIN team_members tm ON tm.team_id = ptr.team_id
		        WHERE tm.user_id = $1
		    ))
		   AND ($2::timestamptz IS NULL OR (p.created_at, p.id) > ($2, $3))
		 ORDER BY p.created_at ASC, p.id ASC
		 LIMIT $4`, userID, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.PublicAccess, &p.CreatedAt); err != nil {
			return nil, "", err
		}
		projects = append(projects, p)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(projects) > limit {
		last := projects[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		projects = projects[:limit]
	}
	return projects, nextCursor, nil
}

// ListPublic returns every non-archived project with public_access = true —
// the raw candidate set for the discovery index, before the instance-wide
// switch is applied at the service layer (add-public-project-discovery D2).
func (r *ProjectRepo) ListPublic(ctx context.Context) ([]domain.Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, key, name, archived, description, is_sample, public_access, created_at
		 FROM projects WHERE public_access AND NOT archived ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.PublicAccess, &p.CreatedAt); err != nil {
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

// SetPublicAccess toggles a project's opt-in unauthenticated read access
// (enable-public-project-access). Also gated at request time by the
// instance-wide InstanceSettings.PublicProjectsEnabled kill switch.
func (r *ProjectRepo) SetPublicAccess(ctx context.Context, id string, public bool) error {
	tag, err := r.pool.Exec(ctx, `UPDATE projects SET public_access = $2 WHERE id = $1`, id, public)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetAssigneeRestrictedRecording toggles whether recording a result or
// changing a run item's status on this project requires the actor to match
// the item's assignee (restrict-run-item-status-to-assignee). Permission
// enforcement (manageProject) lives in the service layer, not here.
func (r *ProjectRepo) SetAssigneeRestrictedRecording(ctx context.Context, id string, restricted bool) error {
	tag, err := r.pool.Exec(ctx, `UPDATE projects SET assignee_restricted_recording = $2 WHERE id = $1`, id, restricted)
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

// Summaries returns, per project not queued for deletion (archived or
// not — add-data-retention design.md D7: the delete-project confirmation
// dialog needs real counts for the one project this always excluded
// before), its suite count, case count, latest-run pass rate, whether
// userID has favorited it, and its assigned tags — as five grouped queries
// (add-project-tags design.md D3, extending project-stats's original
// four), not one query per project, so the cost stays O(1) in the number
// of HTTP round trips regardless of how many projects exist.
func (r *ProjectRepo) Summaries(ctx context.Context, userID string) ([]domain.ProjectSummary, error) {
	ids, err := r.pool.Query(ctx, `SELECT id, archived FROM projects WHERE deleting_at IS NULL ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	order := []string{}
	summaries := map[string]*domain.ProjectSummary{}
	for ids.Next() {
		var id string
		var archived bool
		if err := ids.Scan(&id, &archived); err != nil {
			ids.Close()
			return nil, err
		}
		order = append(order, id)
		summaries[id] = &domain.ProjectSummary{ProjectID: id, Archived: archived, Tags: []string{}}
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

	tags, err := r.pool.Query(ctx,
		`SELECT project_tags.project_id, tags.name
		 FROM project_tags
		 JOIN tags ON tags.id = project_tags.tag_id`)
	if err != nil {
		return nil, err
	}
	for tags.Next() {
		var projectID, name string
		if err := tags.Scan(&projectID, &name); err != nil {
			tags.Close()
			return nil, err
		}
		if s, ok := summaries[projectID]; ok {
			s.Tags = append(s.Tags, name)
		}
	}
	tags.Close()
	if err := tags.Err(); err != nil {
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

// Unarchive restores a previously-archived project to active
// (add-data-retention design.md D7) — mirrors Archive exactly.
func (r *ProjectRepo) Unarchive(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE projects SET archived = false WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// MarkForDeletion queues a project for background permanent deletion
// (design.md D6) — the project is hidden from List/Summaries from this
// instant, but its rows are not actually removed until the background
// worker (service layer) drives PurgeBatch/Purge to completion.
func (r *ProjectRepo) MarkForDeletion(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE projects SET deleting_at = now() WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListPendingDeletion returns every project queued for background deletion
// — polled by the worker at startup and periodically, so a server restart
// mid-purge simply resumes (design.md D6 resumability).
func (r *ProjectRepo) ListPendingDeletion(ctx context.Context) ([]domain.Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, key, name, archived, description, is_sample, public_access, created_at
		 FROM projects WHERE deleting_at IS NOT NULL ORDER BY deleting_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []domain.Project{}
	for rows.Next() {
		var p domain.Project
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Archived, &p.Description, &p.IsSample, &p.PublicAccess, &p.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

// purgeBatchQueries maps each usage-scaled child table to a query deleting
// up to $2 of its rows scoped to project $1 — chunked rather than one
// project-wide cascade, per design.md D6 (avoids one giant transaction on
// a project with a large run/result history). Tables without their own
// project_id join through their parent to reach it.
var purgeBatchQueries = map[string]string{
	"test_run_results": `DELETE FROM test_run_results WHERE id IN (
		SELECT trr.id FROM test_run_results trr
		JOIN test_run_items tri ON tri.id = trr.run_item_id
		JOIN test_runs tr ON tr.id = tri.run_id
		WHERE tr.project_id = $1 LIMIT $2)`,
	"test_run_items": `DELETE FROM test_run_items WHERE id IN (
		SELECT tri.id FROM test_run_items tri
		JOIN test_runs tr ON tr.id = tri.run_id
		WHERE tr.project_id = $1 LIMIT $2)`,
	"test_runs": `DELETE FROM test_runs WHERE id IN (
		SELECT id FROM test_runs WHERE project_id = $1 LIMIT $2)`,
	"test_case_versions": `DELETE FROM test_case_versions WHERE (case_id, version) IN (
		SELECT tcv.case_id, tcv.version FROM test_case_versions tcv
		JOIN test_cases tc ON tc.id = tcv.case_id
		WHERE tc.project_id = $1 LIMIT $2)`,
	"test_cases": `DELETE FROM test_cases WHERE id IN (
		SELECT id FROM test_cases WHERE project_id = $1 LIMIT $2)`,
}

// PurgeBatch deletes up to limit rows of one usage-scaled child table
// belonging to projectID, returning how many it actually removed — 0 means
// that table is now empty for this project. The caller (the background
// worker) loops per table until each returns 0 before calling Purge.
func (r *ProjectRepo) PurgeBatch(ctx context.Context, projectID, table string, limit int) (int, error) {
	query, ok := purgeBatchQueries[table]
	if !ok {
		return 0, fmt.Errorf("purge: unknown table %q", table)
	}
	tag, err := r.pool.Exec(ctx, query, projectID, limit)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// Purge issues the final DELETE FROM projects once every usage-scaled
// child table has been fully drained via PurgeBatch. Everything left at
// this point (sections, suites, suite_cases, membership rows) is small and
// bounded by project setup rather than execution volume, so it's cleaned
// up by the ON DELETE CASCADE FKs in this one closing statement (design.md
// D2/D6) rather than needing its own batching.
func (r *ProjectRepo) Purge(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM projects WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
