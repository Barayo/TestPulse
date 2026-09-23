-- +goose Up
-- project-activity-feed: the owning project for an audit entry, resolved
-- and populated at write time (Service.audit) going forward. Nullable —
-- entries for tenant-level entities (user, team, role, instance_settings,
-- api_token) never get one. No backfill of existing rows (design.md):
-- historical entries simply have no project association.
ALTER TABLE audit_log ADD COLUMN project_id text;
CREATE INDEX audit_log_project_id_occurred_at_idx ON audit_log (project_id, occurred_at DESC);

-- +goose Down
DROP INDEX audit_log_project_id_occurred_at_idx;
ALTER TABLE audit_log DROP COLUMN project_id;
