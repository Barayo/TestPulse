-- +goose Up
-- add-color-theme-customization: instance-wide color theme, either a
-- built-in preset or a fully custom, Tenant-Admin-authored palette.
ALTER TABLE instance_settings
    ADD COLUMN color_theme text NOT NULL DEFAULT 'teal'
        CONSTRAINT instance_settings_color_theme_check
        CHECK (color_theme IN ('teal', 'indigo', 'ocean', 'forest', 'custom')),
    ADD COLUMN custom_palette jsonb;

-- +goose Down
ALTER TABLE instance_settings
    DROP COLUMN color_theme,
    DROP COLUMN custom_palette;
