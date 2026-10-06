-- +goose Up
-- add-ui-i18n design.md D4: a user's personal UI language preference,
-- nullable like timezone — unset means "follow the instance default" (or,
-- while PerUserLanguageEnabled is false, always the instance default
-- regardless of this value).
ALTER TABLE users
    ADD COLUMN language text
        CONSTRAINT users_language_check
        CHECK (language IS NULL OR language IN ('en', 'es', 'fr', 'de', 'pt', 'zh'));

-- +goose Down
ALTER TABLE users
    DROP COLUMN language;
