-- +goose Up
-- enable-public-project-access: an instance-wide kill switch, controlled
-- only by a Tenant Admin, that gates whether any project's own
-- public_access flag can take effect at all. Singleton row enforced via
-- `id boolean primary key check (id)` — id can only ever be true, so a
-- second row is structurally impossible.
CREATE TABLE instance_settings (
    id                       boolean PRIMARY KEY DEFAULT true CHECK (id),
    public_projects_enabled  boolean NOT NULL DEFAULT true,
    updated_at               timestamptz NOT NULL DEFAULT now()
);
INSERT INTO instance_settings (id) VALUES (true);

ALTER TABLE projects ADD COLUMN public_access boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE projects DROP COLUMN public_access;
DROP TABLE instance_settings;
