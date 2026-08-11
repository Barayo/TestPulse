-- +goose Up
-- Sessions previously stored the raw session secret directly as their
-- primary key — a DB read (backup leak, insider access, a future SQLi)
-- handed back a directly-usable, live session credential. This mirrors
-- api_tokens.token_hash, which already never stores the raw token
-- (backlog #116): only a SHA-256 hash is kept from here on.
--
-- Existing rows hold the raw secret in plaintext — exactly what this
-- migration eliminates — so there is no hash to backfill from data being
-- removed. Cleared once, forcing a re-login: an acceptable one-time cost
-- for a security hardening change, not a reason to keep the plaintext
-- form around longer.
DELETE FROM sessions;
ALTER TABLE sessions RENAME COLUMN id TO session_hash;

-- +goose Down
ALTER TABLE sessions RENAME COLUMN session_hash TO id;
