-- +goose Up
-- Identity basics (add-identity-basics).
-- Design decisions D1-D7: Actor sum type (User | ApiToken), server-side
-- sessions with sliding 30-day expiry, salted+prefixed API tokens, two
-- instance-wide roles, and an append-only audit log.

CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL UNIQUE CHECK (email <> ''),
    password_hash   text NOT NULL,
    role            text NOT NULL CHECK (role IN ('admin', 'member')),
    deactivated_at  timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Session id is the opaque secret itself (256-bit random, base62-encoded by
-- the application) — the cookie carries exactly this value (D2).
CREATE TABLE sessions (
    id         text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Only the hash and a short display prefix are stored; the full token is
-- shown once at creation and never persisted (D3).
CREATE TABLE api_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by   uuid NOT NULL REFERENCES users (id),
    name         text NOT NULL CHECK (name <> ''),
    token_hash   text NOT NULL UNIQUE,
    token_prefix text NOT NULL,
    revoked_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_tokens_created_by_idx ON api_tokens (created_by);

-- Append-only: application code only ever INSERTs here (D5). actor_name is
-- denormalized so history survives the actor's own deletion.
CREATE TABLE audit_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_kind  text NOT NULL CHECK (actor_kind IN ('user', 'agent')),
    actor_id    text NOT NULL,
    actor_name  text NOT NULL,
    action      text NOT NULL,
    entity_type text NOT NULL,
    entity_id   text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, occurred_at);

-- Project metadata (enrich-project-list). Added here rather than in
-- 00002_core_domain.sql: owner_id references users, and 00002 runs before
-- 00003 by filename order, so users must already exist.
ALTER TABLE projects ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN owner_id uuid REFERENCES users (id) ON DELETE SET NULL;

-- Per-user starred projects (design D2). Both sides CASCADE — a favorite
-- has no meaning once either the user or the project is gone.
CREATE TABLE project_favorites (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, project_id)
);

-- +goose Down
DROP TABLE project_favorites;
ALTER TABLE projects DROP COLUMN owner_id;
ALTER TABLE projects DROP COLUMN description;
DROP TABLE audit_log;
DROP TABLE api_tokens;
DROP TABLE sessions;
DROP TABLE users;
