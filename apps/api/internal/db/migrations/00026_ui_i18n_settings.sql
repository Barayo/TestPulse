-- +goose Up
-- add-ui-i18n design.md D3/D5: instance-wide default UI language, plus
-- whether a user's own personal language preference (if set) is allowed
-- to override it. Off by default, matching this project's existing
-- conservative-default pattern for admin-gated settings.
ALTER TABLE instance_settings
    ADD COLUMN default_language text NOT NULL DEFAULT 'en'
        CONSTRAINT instance_settings_default_language_check
        CHECK (default_language IN ('en', 'es', 'fr', 'de', 'pt', 'zh')),
    ADD COLUMN per_user_language_enabled boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE instance_settings
    DROP COLUMN default_language,
    DROP COLUMN per_user_language_enabled;
