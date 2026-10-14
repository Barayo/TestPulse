-- +goose Up
-- add-run-configurations (#129): an optional free-text label on a run
-- (e.g. "Chrome", "Firefox", "iOS Safari"), same spirit as cases' free-
-- text platform/tags — not a managed/enumerated value. Set once at
-- creation; no update endpoint exists for it, same as Name.
ALTER TABLE test_runs
    ADD COLUMN configuration text;

-- +goose Down
ALTER TABLE test_runs
    DROP COLUMN configuration;
