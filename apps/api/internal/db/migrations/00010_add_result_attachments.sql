-- +goose Up
-- add-run-item-screenshot-attachments: image evidence attached to a run
-- item's result. run_item_id is set on every row (even before result_id is
-- known) so a screenshot pasted before a verdict is recorded is still
-- scoped to the right item for authorization; result_id is filled in once
-- the attachment is linked to (or created directly against) a result.
-- Unlike user_avatars, images are stored as-uploaded — no crop/resize,
-- since evidence must not be silently altered.
CREATE TABLE result_attachments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_item_id  uuid NOT NULL REFERENCES test_run_items (id) ON DELETE CASCADE,
    result_id    uuid REFERENCES test_run_results (id) ON DELETE CASCADE,
    filename     text NOT NULL,
    content_type text NOT NULL,
    image        bytea NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX result_attachments_result_id_idx ON result_attachments (result_id);
CREATE INDEX result_attachments_run_item_id_idx ON result_attachments (run_item_id) WHERE result_id IS NULL;

-- +goose Down
DROP TABLE result_attachments;
