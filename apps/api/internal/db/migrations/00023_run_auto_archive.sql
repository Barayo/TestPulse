-- +goose Up
-- auto-archive-runs: a run gains a reversible archived flag (mirroring
-- projects' own archived column), plus an instance-wide age threshold that
-- drives RunAutoArchiveWorker (design.md D1) — 0 means the policy is off,
-- same convention as run_retention_days/auto_archive_inactive_days.
ALTER TABLE test_runs ADD COLUMN archived boolean DEFAULT false NOT NULL;
ALTER TABLE instance_settings ADD COLUMN run_auto_archive_inactive_days integer DEFAULT 0 NOT NULL;

-- +goose Down
ALTER TABLE instance_settings DROP COLUMN run_auto_archive_inactive_days;
ALTER TABLE test_runs DROP COLUMN archived;
