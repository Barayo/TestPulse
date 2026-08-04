-- +goose Up
-- link-case-version-actor-to-identity: records who created each test case
-- version, mirroring test_run_results.actor_kind/actor_ref_id exactly — no
-- FK, so a version's attribution survives that actor being deleted later.
ALTER TABLE test_case_versions
    ADD COLUMN actor_kind text NOT NULL DEFAULT 'unknown'
        CHECK (actor_kind IN ('user', 'agent', 'unknown')),
    ADD COLUMN actor_ref_id text;

-- +goose Down
ALTER TABLE test_case_versions
    DROP COLUMN actor_kind,
    DROP COLUMN actor_ref_id;
