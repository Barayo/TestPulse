-- +goose Up
-- add-user-profile: self-service display name, avatar, and timezone.
-- avatar_key is a plain string key into a static, bundled preset gallery
-- (see design.md) — not a foreign key into any blob/file table, since
-- nothing is ever uploaded.
ALTER TABLE users
    ADD COLUMN display_name text,
    ADD COLUMN avatar_key text,
    ADD COLUMN timezone text;

-- +goose Down
ALTER TABLE users
    DROP COLUMN display_name,
    DROP COLUMN avatar_key,
    DROP COLUMN timezone;
