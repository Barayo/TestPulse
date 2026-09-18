-- +goose Up
-- add-configurable-project-landing: a project's own landing-view override.
-- NULL means "inherit the instance-wide default".
ALTER TABLE projects
    ADD COLUMN landing_view text
        CONSTRAINT projects_landing_view_check
        CHECK (landing_view IS NULL OR landing_view IN ('dashboard', 'library', 'suites', 'runs', 'reports'));

-- +goose Down
ALTER TABLE projects
    DROP COLUMN landing_view;
