## Why

TestPulse currently has no identity layer at all — every request is
anonymous and every actor is implicitly trusted. The v0.1 MVP story is "an
agent can manage your tests," which per `ROADMAP.md` requires **agents to be
first-class actors** (scoped API tokens, never SSO) and every write to be
attributable to a human or an agent. Without this, `add-mcp-server` (the next
v0.1 rung) has no way to authenticate the agents it serves, and there is no
audit trail distinguishing human edits from agent edits. This is the last
piece of v0.1's identity story before SSO (deliberately deferred to v0.2's
`add-sso-oidc`).

## What Changes

- Local user accounts: username/email + bcrypt-hashed password, created by
  an admin (no public self-registration in v0.1).
- Session-based login for the web UI: `POST /api/v1/auth/login` sets an
  HTTP-only session cookie; `POST /api/v1/auth/logout` invalidates it.
- Two roles, instance-wide (not yet per-project — that's v0.2's
  `add-project-rbac`): `admin` (manage users/tokens, full read/write) and
  `member` (full read/write on domain data, no user/token management).
- Scoped API tokens for agents: any authenticated user (admin or member)
  creates a named token, shown once at creation, hashed at rest; every
  request authenticated by a token is treated as its own actor (never
  impersonating a human), acting at its creator's role. A user manages only
  the tokens they created; an admin can manage any user's tokens.
- Every write endpoint records an audit entry: `{actor (user or token),
  action, entity, entity_id, timestamp}` — append-only, queryable per entity.
- All existing domain routes (`/api/v1/projects/**`, `/api/v1/cases/**`,
  `/api/v1/suites/**`, `/api/v1/runs/**`, `/api/v1/folders/**`) require
  authentication once this ships — **BREAKING** for any existing anonymous
  caller (acceptable pre-1.0 per `CLAUDE.md`'s migration policy: no real
  deployment has data to protect yet).
- Minimal web UI: a login page and a logged-in user's identity in the app
  shell (name + logout); admin-only screen to manage users and tokens.

## Capabilities

### New Capabilities

- `authentication`: local user accounts (bcrypt), session login/logout, and
  scoped API tokens for agents — establishing *who* is making a request.
- `authorization`: the two-role model (admin/member) and enforcement of
  which authenticated actor may perform which action.
- `audit-log`: an append-only record of actor identity and action for every
  write, queryable per entity, so agent- and human-originated changes are
  both traceable.

### Modified Capabilities

- (none — existing `test-authoring`, `test-execution`, `ui-navigation`,
  `project-stats` requirements are unchanged; their endpoints simply start
  requiring an authenticated actor, which is an implementation detail of
  this change, not a change to their own behavioral contracts)

## Impact

- **API**: new `/api/v1/auth/*` and `/api/v1/users/*` / `/api/v1/tokens/*`
  routes in `packages/shared/openapi.yaml`; every existing domain route
  gains an auth requirement (contract-first: `make generate` after the
  OpenAPI edit).
- **Backend**: new `apps/api/internal/domain` types (`User`, `Session`,
  `ApiToken`, `AuditEntry`); new `store`/`service` packages; a new
  `apps/api/internal/db/migrations` migration (users, sessions, api_tokens,
  audit_log tables); chi middleware for auth + audit on every write.
- **Frontend**: new login route, auth-aware app shell (redirect to login
  when unauthenticated), admin screens for user/token management, and every
  existing `api.GET/POST/PUT/DELETE` call needs credentials included
  (session cookie) or a bearer token attached.
- **Docs**: `docs/api.md` (new auth section, already stubbed with a
  forward-reference), `docs/architecture.md`, `docs/development.md` (how to
  log in locally / seed an initial admin), `docs/deployment.md` (the
  "endpoints are open" warning is retired).
- **Downstream**: unblocks `add-mcp-server`, which will authenticate MCP
  clients via the same scoped API tokens.
