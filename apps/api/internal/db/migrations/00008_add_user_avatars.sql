-- +goose Up
-- add-custom-avatar-upload: stores a user's uploaded photo avatar,
-- separately from the users table so listing/fetching users never pulls
-- image bytes along with it (design.md). Always JPEG at this point — the
-- processing pipeline re-encodes every upload before it reaches this
-- table, regardless of the original format.
CREATE TABLE user_avatars (
    user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    image        bytea NOT NULL,
    content_type text NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE user_avatars;
