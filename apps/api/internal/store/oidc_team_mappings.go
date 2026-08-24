package store

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OIDCTeamMappingRepo manages claim-value→Team mapping rows
// (add-sso-oidc design.md D10) — additive-only sync, evaluated by the
// service layer on every OIDC login.
type OIDCTeamMappingRepo struct {
	pool *pgxpool.Pool
}

func (r *OIDCTeamMappingRepo) Create(ctx context.Context, claimValue, teamID string) (domain.OIDCTeamMapping, error) {
	var m domain.OIDCTeamMapping
	err := r.pool.QueryRow(ctx,
		`INSERT INTO oidc_team_mappings (claim_value, team_id) VALUES ($1, $2) RETURNING id, claim_value, team_id`,
		claimValue, teamID,
	).Scan(&m.ID, &m.ClaimValue, &m.TeamID)
	return m, err
}

func (r *OIDCTeamMappingRepo) List(ctx context.Context) ([]domain.OIDCTeamMapping, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, claim_value, team_id FROM oidc_team_mappings ORDER BY claim_value`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	mappings := []domain.OIDCTeamMapping{}
	for rows.Next() {
		var m domain.OIDCTeamMapping
		if err := rows.Scan(&m.ID, &m.ClaimValue, &m.TeamID); err != nil {
			return nil, err
		}
		mappings = append(mappings, m)
	}
	return mappings, rows.Err()
}

func (r *OIDCTeamMappingRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM oidc_team_mappings WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
