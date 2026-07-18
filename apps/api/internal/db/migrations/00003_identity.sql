-- +goose Up
-- Identity basics (add-identity-basics).
-- Design decisions D1-D7: Actor sum type (User | ApiToken), server-side
-- sessions with sliding 30-day expiry, salted+prefixed API tokens, and an
-- append-only audit log. The instance-wide two-role model (admin/member)
-- from that change is superseded in place by add-project-rbac's
-- is_tenant_admin flag + project-scoped roles (design.md D1) — pre-1.0, no
-- deployment has data to preserve, so this amends rather than migrates.

CREATE TABLE users (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email             text NOT NULL UNIQUE CHECK (email <> ''),
    password_hash     text NOT NULL,
    is_tenant_admin   boolean NOT NULL DEFAULT false,
    deactivated_at    timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now()
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

-- Project metadata (enrich-project-list).
ALTER TABLE projects ADD COLUMN description text NOT NULL DEFAULT '';

-- Per-user starred projects (design D2). Both sides CASCADE — a favorite
-- has no meaning once either the user or the project is gone.
CREATE TABLE project_favorites (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, project_id)
);

-- Project-scoped RBAC (add-project-rbac, design.md D7). A team is a named
-- group with no scope of its own — it only matters once assigned a role on
-- a project (project_team_roles). A user's effective permissions on a
-- project are the union (OR) of every applicable role's flags, reachable
-- via project_members and/or project_team_roles (service-layer
-- resolution; see design.md D3/D10).
CREATE TABLE teams (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL CHECK (name <> ''),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
    team_id uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, user_id)
);

-- Fully custom, instance-wide roles (design.md D10) — a Tenant Admin can
-- create/rename/delete roles and toggle what each one can do. `rank` is a
-- display/sort-order integer only, never compared in authorization logic:
-- access is decided purely by OR-ing the ten can_* flags (design.md D11 —
-- concrete, per-resource actions rather than five broad ones) across every
-- role a user holds on a project (no fixed ordinal ladder anymore).
CREATE TABLE roles (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                      text NOT NULL UNIQUE CHECK (name <> ''),
    rank                      integer NOT NULL DEFAULT 0,
    can_read                  boolean NOT NULL DEFAULT true,
    can_case_create           boolean NOT NULL DEFAULT false,
    can_case_edit             boolean NOT NULL DEFAULT false,
    can_case_delete           boolean NOT NULL DEFAULT false,
    can_section_create        boolean NOT NULL DEFAULT false,
    can_section_delete        boolean NOT NULL DEFAULT false,
    can_suite_create          boolean NOT NULL DEFAULT false,
    can_suite_edit_membership boolean NOT NULL DEFAULT false,
    can_run_create            boolean NOT NULL DEFAULT false,
    can_run_record_result     boolean NOT NULL DEFAULT false,
    can_manage_project        boolean NOT NULL DEFAULT false,
    created_at                timestamptz NOT NULL DEFAULT now()
);

-- Seeded defaults reproduce the three original fixed roles' net permissions
-- exactly, so an instance that never opens the Roles admin page sees
-- identical behavior to before D11 split the flags more finely.
INSERT INTO roles (
    name, rank, can_read, can_case_create, can_case_edit, can_case_delete,
    can_section_create, can_section_delete, can_suite_create,
    can_suite_edit_membership, can_run_create, can_run_record_result, can_manage_project
) VALUES
    ('Tester',        1, true, false, false, false, false, false, false, false, true,  true,  false),
    ('Contributor',   2, true, true,  true,  false, true,  false, true,  true,  true,  true,  false),
    ('Project Admin', 3, true, true,  true,  true,  true,  true,  true,  true,  true,  true,  true);

CREATE TABLE project_members (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id    uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE project_team_roles (
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    team_id    uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
    role_id    uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, team_id)
);

-- +goose Down
DROP TABLE project_team_roles;
DROP TABLE project_members;
DROP TABLE roles;
DROP TABLE team_members;
DROP TABLE teams;
DROP TABLE project_favorites;
ALTER TABLE projects DROP COLUMN description;
DROP TABLE audit_log;
DROP TABLE api_tokens;
DROP TABLE sessions;
DROP TABLE users;
