-- +goose Up
-- link-runs-to-suite: record which suite a run was created from, if any.
--
-- A REAL incremental migration, not an amend-in-place — the pre-1.0 "amend
-- the existing migration file" policy (CLAUDE.md) assumes no deployment has
-- data to preserve yet, but testpulse.fly.dev is a real, continuously
-- running instance whose Postgres is already past this table's original
-- migration (00002). Amending 00002 in place left the already-deployed
-- database with a stale schema — goose only compares migration *version
-- numbers* against what it has already applied, not file content, so an
-- edited-in-place file with a version it already ran is silently skipped,
-- not re-applied. This file is the fix: a genuinely new version goose has
-- never seen, so it actually runs on the next deploy.
ALTER TABLE test_runs
    ADD COLUMN suite_id uuid REFERENCES test_suites (id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE test_runs DROP COLUMN suite_id;
