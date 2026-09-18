-- +goose Up
-- add-configurable-project-landing: instance-wide default for which view a
-- project opens into. "dashboard" preserves today's fixed panel view, so no
-- existing instance's behavior changes on upgrade.
ALTER TABLE instance_settings
    ADD COLUMN default_landing_view text NOT NULL DEFAULT 'dashboard'
        CONSTRAINT instance_settings_default_landing_view_check
        CHECK (default_landing_view IN ('dashboard', 'library', 'suites', 'runs', 'reports'));

-- +goose Down
ALTER TABLE instance_settings
    DROP COLUMN default_landing_view;
