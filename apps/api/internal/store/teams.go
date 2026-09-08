package store

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TeamRepo struct {
	pool *pgxpool.Pool
}

func (r *TeamRepo) Create(ctx context.Context, name string) (domain.Team, error) {
	t := domain.Team{MemberIDs: []string{}}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO teams (name) VALUES ($1) RETURNING id, name, created_at`, name,
	).Scan(&t.ID, &t.Name, &t.CreatedAt)
	return t, err
}

func (r *TeamRepo) Get(ctx context.Context, id string) (domain.Team, error) {
	t := domain.Team{ID: id}
	err := r.pool.QueryRow(ctx,
		`SELECT name, created_at FROM teams WHERE id = $1`, id,
	).Scan(&t.Name, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Team{}, ErrNotFound
	}
	if err != nil {
		return domain.Team{}, err
	}
	members, err := r.members(ctx, id)
	if err != nil {
		return domain.Team{}, err
	}
	t.MemberIDs = members
	return t, nil
}

func (r *TeamRepo) List(ctx context.Context) ([]domain.Team, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, name, created_at FROM teams ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	teams := []domain.Team{}
	for rows.Next() {
		var t domain.Team
		if err := rows.Scan(&t.ID, &t.Name, &t.CreatedAt); err != nil {
			return nil, err
		}
		teams = append(teams, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range teams {
		members, err := r.members(ctx, teams[i].ID)
		if err != nil {
			return nil, err
		}
		teams[i].MemberIDs = members
	}
	return teams, nil
}

// ListPage is List, cursor-paginated (add-cursor-pagination). Preserves
// List's existing created_at ASC (insertion) order and per-team
// MemberIDs enrichment, with id ASC as the deterministic tiebreak.
func (r *TeamRepo) ListPage(ctx context.Context, cursor string, limit int) ([]domain.Team, string, error) {
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
		`SELECT id, name, created_at FROM teams
		 WHERE $1::timestamptz IS NULL OR (created_at, id) > ($1, $2)
		 ORDER BY created_at ASC, id ASC
		 LIMIT $3`, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	teams := []domain.Team{}
	for rows.Next() {
		var t domain.Team
		if err := rows.Scan(&t.ID, &t.Name, &t.CreatedAt); err != nil {
			return nil, "", err
		}
		teams = append(teams, t)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(teams) > limit {
		last := teams[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		teams = teams[:limit]
	}
	for i := range teams {
		members, err := r.members(ctx, teams[i].ID)
		if err != nil {
			return nil, "", err
		}
		teams[i].MemberIDs = members
	}
	return teams, nextCursor, nil
}

func (r *TeamRepo) Rename(ctx context.Context, id, name string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE teams SET name = $2 WHERE id = $1`, id, name)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete removes the team; team_members and project_team_roles rows
// referencing it CASCADE (design.md D7), so any user whose effective role
// depended solely on this team loses that access.
func (r *TeamRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM teams WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// TeamReferenceCounts reports how much a team would take with it if deleted:
// its current member count, and the count of distinct projects it holds a
// role on (via project_team_roles) — surfaced in the deletion-preview UI
// before the destructive action is enabled.
func (r *TeamRepo) TeamReferenceCounts(ctx context.Context, teamID string) (memberCount, projectCount int, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT
		   (SELECT count(*) FROM team_members WHERE team_id = $1),
		   (SELECT count(DISTINCT project_id) FROM project_team_roles WHERE team_id = $1)`,
		teamID,
	).Scan(&memberCount, &projectCount)
	return memberCount, projectCount, err
}

func (r *TeamRepo) AddMember(ctx context.Context, teamID, userID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)
		 ON CONFLICT (team_id, user_id) DO NOTHING`, teamID, userID)
	return err
}

func (r *TeamRepo) RemoveMember(ctx context.Context, teamID, userID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, teamID, userID)
	return err
}

// TeamIDsForUser lists every team a user belongs to — used to resolve a
// user's effective project role via team-derived assignments (design.md D3).
func (r *TeamRepo) TeamIDsForUser(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT team_id FROM team_members WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *TeamRepo) members(ctx context.Context, teamID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT user_id FROM team_members WHERE team_id = $1`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
