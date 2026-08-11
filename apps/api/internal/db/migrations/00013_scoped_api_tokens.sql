-- +goose Up
-- A token MAY be scoped to exactly one project and one role, reusing the
-- exact same roles table project members already use — not a bespoke
-- per-token permission concept (backlog #117, design.md D1). Both NULL is
-- the "unscoped, full inheritance" sentinel (existing behavior,
-- unchanged); the CHECK constraint keeps the pair from ever being
-- half-set. ON DELETE CASCADE on both mirrors project_members' existing,
-- already-tested precedent: deleting a role/project a token depends on
-- deletes the token outright — fails closed, never silently upgrades a
-- scoped token to unscoped/full access.
ALTER TABLE api_tokens
    ADD COLUMN project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
    ADD COLUMN role_id    uuid REFERENCES roles (id) ON DELETE CASCADE,
    ADD CONSTRAINT api_tokens_scope_check CHECK ((project_id IS NULL) = (role_id IS NULL));

-- None of the three existing seeded roles is pure read-only (Tester
-- already includes runCreate/runRecordResult) — the single most common
-- token-scoping ask (design.md D2). Rank 0: more restrictive than
-- Tester's rank 1.
INSERT INTO roles (
    name, rank, can_read, can_case_create, can_case_edit, can_case_delete,
    can_section_create, can_section_delete, can_suite_create,
    can_suite_edit_membership, can_run_create, can_run_record_result, can_manage_project
) VALUES
    ('Viewer', 0, true, false, false, false, false, false, false, false, false, false, false);

-- +goose Down
DELETE FROM roles WHERE name = 'Viewer';
ALTER TABLE api_tokens
    DROP CONSTRAINT api_tokens_scope_check,
    DROP COLUMN project_id,
    DROP COLUMN role_id;
