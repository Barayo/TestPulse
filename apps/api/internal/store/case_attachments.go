package store

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CaseAttachmentRepo stores reference files attached to a test case's
// identity (add-case-reference-attachments design.md D1/D3) — a table and
// repo entirely independent of AttachmentRepo's run-result evidence.
type CaseAttachmentRepo struct {
	pool *pgxpool.Pool
}

const caseAttachmentColumns = "id, case_id, filename, content_type, created_at"

func scanCaseAttachment(row pgx.Row) (domain.CaseAttachment, error) {
	var out domain.CaseAttachment
	if err := row.Scan(&out.ID, &out.CaseID, &out.Filename, &out.ContentType, &out.CreatedAt); err != nil {
		return domain.CaseAttachment{}, err
	}
	return out, nil
}

// Create stores a reference file against a case.
func (r *CaseAttachmentRepo) Create(ctx context.Context, caseID, filename, contentType string, image []byte) (domain.CaseAttachment, error) {
	return scanCaseAttachment(r.pool.QueryRow(ctx,
		`INSERT INTO case_attachments (case_id, filename, content_type, image)
		 VALUES ($1, $2, $3, $4)
		 RETURNING `+caseAttachmentColumns,
		caseID, filename, contentType, image,
	))
}

// ByCase lists a case's attachments, metadata only (no image bytes).
func (r *CaseAttachmentRepo) ByCase(ctx context.Context, caseID string) ([]domain.CaseAttachment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+caseAttachmentColumns+` FROM case_attachments WHERE case_id = $1 ORDER BY created_at, id`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.CaseAttachment
	for rows.Next() {
		att, err := scanCaseAttachment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, att)
	}
	return out, rows.Err()
}

// Get returns an attachment's metadata and raw file bytes, for serving.
func (r *CaseAttachmentRepo) Get(ctx context.Context, id string) (domain.CaseAttachment, []byte, error) {
	var out domain.CaseAttachment
	var image []byte
	err := r.pool.QueryRow(ctx,
		`SELECT id, case_id, filename, content_type, image, created_at
		 FROM case_attachments WHERE id = $1`, id,
	).Scan(&out.ID, &out.CaseID, &out.Filename, &out.ContentType, &image, &out.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.CaseAttachment{}, nil, ErrNotFound
	}
	if err != nil {
		return domain.CaseAttachment{}, nil, err
	}
	return out, image, nil
}

// ProjectID resolves the project a case attachment belongs to, via its
// case — used by requirePermission's per-resource resolver for the
// /case-attachments/{attachmentId} routes.
func (r *CaseAttachmentRepo) ProjectID(ctx context.Context, id string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT tc.project_id FROM case_attachments ca
		 JOIN test_cases tc ON tc.id = ca.case_id
		 WHERE ca.id = $1`, id,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// Delete removes an attachment.
func (r *CaseAttachmentRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM case_attachments WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
