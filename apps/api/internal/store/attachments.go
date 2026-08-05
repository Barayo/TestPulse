package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrInvalidAttachment is returned when a request references an attachment
// id that does not belong to the run item it is being linked against —
// distinct from ErrNotFound since the caller's request shape itself is
// wrong (add-run-item-screenshot-attachments spec's "A staged attachment
// from a different item cannot be linked").
var ErrInvalidAttachment = fmt.Errorf("attachment does not belong to this run item")

type AttachmentRepo struct {
	pool *pgxpool.Pool
}

const attachmentColumns = "id, run_item_id, result_id, filename, content_type, created_at"

func scanAttachment(row pgx.Row) (domain.Attachment, error) {
	var out domain.Attachment
	var resultID *string
	if err := row.Scan(&out.ID, &out.RunItemID, &resultID, &out.Filename, &out.ContentType, &out.CreatedAt); err != nil {
		return domain.Attachment{}, err
	}
	if resultID != nil {
		out.ResultID = *resultID
	}
	return out, nil
}

// StageForItem uploads an attachment against a run item before any verdict
// has been recorded for it — result_id stays NULL until a subsequent
// AppendResult call links it (see LinkStaged).
func (r *AttachmentRepo) StageForItem(ctx context.Context, itemID, filename, contentType string, image []byte) (domain.Attachment, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Attachment{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := checkItemRunOpen(ctx, tx, itemID); err != nil {
		return domain.Attachment{}, err
	}

	out, err := scanAttachment(tx.QueryRow(ctx,
		`INSERT INTO result_attachments (run_item_id, filename, content_type, image)
		 VALUES ($1, $2, $3, $4)
		 RETURNING `+attachmentColumns,
		itemID, filename, contentType, image,
	))
	if err != nil {
		return domain.Attachment{}, err
	}
	return out, tx.Commit(ctx)
}

// AttachToResult uploads an attachment directly against an already-recorded
// result — used both for after-the-fact attach from History, and internally
// by InsertInline's single-attachment callers.
func (r *AttachmentRepo) AttachToResult(ctx context.Context, resultID, filename, contentType string, image []byte) (domain.Attachment, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Attachment{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var itemID string
	if err := tx.QueryRow(ctx, `SELECT run_item_id FROM test_run_results WHERE id = $1`, resultID).Scan(&itemID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Attachment{}, ErrNotFound
		}
		return domain.Attachment{}, err
	}
	if err := checkItemRunOpen(ctx, tx, itemID); err != nil {
		return domain.Attachment{}, err
	}

	out, err := scanAttachment(tx.QueryRow(ctx,
		`INSERT INTO result_attachments (run_item_id, result_id, filename, content_type, image)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING `+attachmentColumns,
		itemID, resultID, filename, contentType, image,
	))
	if err != nil {
		return domain.Attachment{}, err
	}
	return out, tx.Commit(ctx)
}

// linkStagedAttachments links previously staged attachments (result_id IS
// NULL) to a newly created result, inside the caller's own transaction —
// called from RunRepo.AppendResult so linking is part of recording the
// verdict, never a separate commit. Every id must already be staged against
// itemID; if any isn't, no rows are updated and ErrInvalidAttachment is
// returned. A package-level function (not an AttachmentRepo method) since it
// operates entirely on the caller-supplied tx and shares no pool state.
func linkStagedAttachments(ctx context.Context, tx pgx.Tx, itemID, resultID string, attachmentIDs []string) error {
	if len(attachmentIDs) == 0 {
		return nil
	}
	tag, err := tx.Exec(ctx,
		`UPDATE result_attachments SET result_id = $1
		 WHERE id = ANY($2) AND run_item_id = $3 AND result_id IS NULL`,
		resultID, attachmentIDs, itemID)
	if err != nil {
		return err
	}
	if int(tag.RowsAffected()) != len(attachmentIDs) {
		return ErrInvalidAttachment
	}
	return nil
}

// insertInlineAttachments creates attachments with result_id set directly,
// inside the caller's own transaction — used by RunRepo.AppendResult and
// RunRepo.Import for a client that submits attachment bytes in the same
// request as the result they belong to.
func insertInlineAttachments(ctx context.Context, tx pgx.Tx, itemID, resultID string, atts []domain.NewAttachment) ([]domain.Attachment, error) {
	out := make([]domain.Attachment, 0, len(atts))
	for _, a := range atts {
		att, err := scanAttachment(tx.QueryRow(ctx,
			`INSERT INTO result_attachments (run_item_id, result_id, filename, content_type, image)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING `+attachmentColumns,
			itemID, resultID, a.Filename, a.ContentType, a.Data,
		))
		if err != nil {
			return nil, err
		}
		out = append(out, att)
	}
	return out, nil
}

// attachmentsByResults batch-loads attachments for several results at once
// (used by RunRepo.Results, which must return them alongside each result).
func attachmentsByResults(ctx context.Context, pool *pgxpool.Pool, resultIDs []string) (map[string][]domain.Attachment, error) {
	if len(resultIDs) == 0 {
		return nil, nil
	}
	rows, err := pool.Query(ctx,
		`SELECT `+attachmentColumns+` FROM result_attachments WHERE result_id = ANY($1) ORDER BY created_at, id`, resultIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]domain.Attachment{}
	for rows.Next() {
		att, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		out[att.ResultID] = append(out[att.ResultID], att)
	}
	return out, rows.Err()
}

// ByResult lists a result's attachments, metadata only (no image bytes).
func (r *AttachmentRepo) ByResult(ctx context.Context, resultID string) ([]domain.Attachment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+attachmentColumns+` FROM result_attachments WHERE result_id = $1 ORDER BY created_at, id`, resultID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Attachment
	for rows.Next() {
		att, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, att)
	}
	return out, rows.Err()
}

// ByItem lists an item's staged (not yet linked to a result) attachments,
// metadata only.
func (r *AttachmentRepo) ByItem(ctx context.Context, itemID string) ([]domain.Attachment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+attachmentColumns+` FROM result_attachments WHERE run_item_id = $1 AND result_id IS NULL ORDER BY created_at, id`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Attachment
	for rows.Next() {
		att, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, att)
	}
	return out, rows.Err()
}

// Get returns an attachment's metadata and raw image bytes, for serving.
func (r *AttachmentRepo) Get(ctx context.Context, id string) (domain.Attachment, []byte, error) {
	var out domain.Attachment
	var resultID *string
	var image []byte
	err := r.pool.QueryRow(ctx,
		`SELECT id, run_item_id, result_id, filename, content_type, image, created_at
		 FROM result_attachments WHERE id = $1`, id,
	).Scan(&out.ID, &out.RunItemID, &resultID, &out.Filename, &out.ContentType, &image, &out.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Attachment{}, nil, ErrNotFound
	}
	if err != nil {
		return domain.Attachment{}, nil, err
	}
	if resultID != nil {
		out.ResultID = *resultID
	}
	return out, image, nil
}

// ProjectID resolves the project an attachment belongs to, via its run
// item's run — used by requirePermission's per-resource resolver for the
// /attachments/{attachmentId} routes.
func (r *AttachmentRepo) ProjectID(ctx context.Context, id string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT tr.project_id FROM result_attachments ra
		 JOIN test_run_items tri ON tri.id = ra.run_item_id
		 JOIN test_runs tr ON tr.id = tri.run_id
		 WHERE ra.id = $1`, id,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// Delete removes an attachment.
func (r *AttachmentRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM result_attachments WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
