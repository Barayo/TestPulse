-- +goose Up
-- link-run-item-assignee-to-identity: assignment is current, mutable state
-- (not an audit log), and nothing has published a version yet, so this is
-- a deliberate, one-time breaking reset rather than the additive
-- kind+ref_id-alongside-legacy-text pattern used for result actors.
-- Real foreign keys let Postgres enforce referential integrity and handle
-- the referenced user/team being deleted, instead of the application
-- maintaining a denormalized ref_id by hand.
ALTER TABLE test_run_items
    DROP COLUMN assignee,
    ADD COLUMN assignee_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN assignee_team_id uuid REFERENCES teams (id) ON DELETE SET NULL,
    ADD CONSTRAINT test_run_items_assignee_single
        CHECK (assignee_user_id IS NULL OR assignee_team_id IS NULL);

-- +goose Down
ALTER TABLE test_run_items
    DROP CONSTRAINT test_run_items_assignee_single,
    DROP COLUMN assignee_user_id,
    DROP COLUMN assignee_team_id,
    ADD COLUMN assignee text NOT NULL DEFAULT '';
