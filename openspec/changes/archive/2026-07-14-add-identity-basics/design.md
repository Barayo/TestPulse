## Context

Every route under `/api/v1` is currently unauthenticated (`mountAPI` wires
handlers directly with no auth middleware — `apps/api/internal/server.go`),
and there is no `User`/session/token concept anywhere in
`apps/api/internal/domain`. `docs/api.md` already carries a forward-looking
warning ("Do not expose this API on an untrusted network... Local users,
sessions, and scoped agent API tokens arrive in `add-identity-basics`") — this
change makes that true. It is the last v0.1 rung before `add-mcp-server`,
which needs a way to authenticate MCP clients; the design here is shaped so
`add-mcp-server` can reuse the same token mechanism without changes.

`establish-architecture`'s constraint "Agents are first-class actors (scoped
API tokens, never SSO); every future capability treats 'actor' as
human-or-agent" is the load-bearing decision for this whole design: humans
and agents are two flavors of the same `Actor` concept, not a human system
with agents bolted on.

## Goals / Non-Goals

**Goals:**
- Every request to a domain route resolves to exactly one authenticated
  `Actor` (a user via session, or an agent via API token) or is rejected.
- Every write is attributable: an audit entry names the actor, the action,
  and the entity touched.
- Admins can create/revoke users and agent tokens without a database console.
- The web UI has a working login screen and stops functioning as an
  anonymous-access tool.

**Non-Goals:**
- SSO/OIDC (`add-sso-oidc`, v0.2).
- Per-project role scoping (`add-project-rbac`, v0.2) — roles are
  instance-wide in this change; a `member` can read/write every project.
- Self-service registration, password reset via email, MFA — all deferred;
  v0.1 admins are provisioned via a bootstrap step (see Migration Plan) and
  create other users directly.
- Rate limiting / brute-force lockout on login — noted as an open question,
  not blocking v0.1.
- Rich audit-log UI (filtering, export) — `add-reporting` (v0.3) is the
  natural home for audit *analysis*; this change only guarantees the data is
  captured and readable via a simple per-entity endpoint.

## Decisions

### D1: `Actor` is a sum type of `User` and `ApiToken`, not one `users` table with a "bot" flag
A `service`-layer `Actor` interface/struct carries `{ID, Kind ("user" |
"agent"), DisplayName}` resolved once per request by auth middleware and
threaded through `context.Context` (mirroring how `establish-architecture`
already threads request-scoped values). Storage stays as two tables (`users`,
`api_tokens`) because their lifecycle and fields differ (password hash vs.
token hash + scopes) — unifying them into one polymorphic table would need
nullable-column gymnastics for no real benefit at this scale.

**Alternative considered**: single `actors` table with a `type` discriminator
and nullable type-specific columns. Rejected — two small tables with a
shared interface in Go is simpler than one wide table with per-type NULLs,
and this repo already favors explicit domain types (`Folder`, `TestCase`,
etc.) over generic polymorphic rows.

### D2: Sessions are server-side, stored in Postgres, referenced by an opaque cookie, 30-day sliding expiry
`POST /auth/login` creates a row in a `sessions` table (`id`, `user_id`,
`created_at`, `expires_at`) and sets an `HttpOnly`, `Secure`, `SameSite=Lax`
cookie containing only the session `id` (a random 256-bit token, not a JWT).
`expires_at` starts at 30 days out and is pushed forward on each request
that successfully authenticates with it (sliding window) — appropriate for
a small, trusted team where forcing frequent re-logins adds friction
without a real security payoff at this stage.
Chosen over JWTs because: sessions need to be revocable immediately on
logout/password change (a stateless JWT can't be revoked without a
denylist, which reintroduces server-side state anyway), and the API has no
current need for cross-service token verification that would justify JWT's
self-contained-claims benefit. Session lookup is one indexed query per
request — acceptable at TestPulse's scale (same reasoning as
[[testpulse-aggregation-performance-caution]]: don't add complexity the
current scale doesn't need).

### D3: API tokens are shown once, stored as a salted hash, prefixed for identification
Token format: `tp_<random-32-bytes-base62>`. On creation, the full token is
returned once in the response body and never again; the DB stores only
`sha256(token)` plus a `token_prefix` (first 8 chars) so the UI can list
"which token is which" without ever re-displaying secrets. This mirrors
GitHub/Stripe-style API key UX and avoids storing anything reversible.

### D4: Two roles, enforced by a single `RequireRole` middleware parameter, not a permissions matrix
`admin` and `member` are a Go `enum`-style string type on `User`. A
`RequireRole(domain.RoleAdmin)` middleware wraps only *user* management
routes (create/deactivate a user is admin-only); agent API token
management is available to any authenticated user (see D3.1) and every
other domain route just requires *any* authenticated actor. No per-action
permission table — with two roles and one scope level, a matrix is
premature (`add-project-rbac` in v0.2 is where real per-project/per-role
authorization logic belongs).

### D3.1: Any authenticated user (admin or member) can create and revoke their own agent API tokens
A token is scoped to the user who created it (`api_tokens.created_by`) —
useful for a member wiring up their own agent workflow without needing an
admin in the loop for every new integration. A user can only list/revoke
tokens they created; only an admin can list/revoke *any* user's tokens (for
offboarding). This is a lighter-weight trust model than user creation
itself: creating a token doesn't grant new privileges beyond the creating
user's own — the token acts *as* that user, at that user's role.

### D5: Audit log is a single append-only table, written synchronously in the same transaction as the write it records
`audit_log(id, actor_kind, actor_id, actor_name, action, entity_type,
entity_id, occurred_at)`. Written via a small `service`-layer helper called
at the end of each mutating service method (`CreateProject`,
`UpsertCase`, etc.) inside the same DB transaction, so an audit entry can
never be silently dropped by a failure between the domain write and the
audit write. `actor_name` is denormalized (copied at write time) so the log
stays readable even after a user is deleted — audit history must survive
its actor's deletion.

**Alternative considered**: emit audit events async via a channel/queue.
Rejected for v0.1 — adds operational complexity (a queue, at-least-once
semantics) for a guarantee ("never lose an audit entry") that's actually
easier to get from a same-transaction write.

**Implementation note (as actually built)**: the Actor is threaded through
`context.Context` (see D1) rather than as an explicit parameter on every
mutating method, so `Service.audit(ctx, ...)` reads the actor set by the
`Authenticate` middleware and calls `store.Audit.Append` as a plain
sequential write immediately after the domain write succeeds — not literally
wrapped in the same SQL transaction as originally described above. This is a
simplification, not the crash-safe guarantee D5 describes: a failure between
the two writes could in principle lose an audit entry. Accepted for this
pass (pre-1.0, no production traffic yet); revisit if this ever becomes a
real reliability concern. A call made before an Actor exists in context
(i.e. before task 5.2 protects a given route) simply records nothing rather
than erroring — every domain route has authentication and a resolved Actor
once task 5 is complete.

### D6: Auth is chi middleware resolving `Actor` from either a session cookie or a `Bearer` token, in that order
One `Authenticate` middleware tries, in order: (1) `Authorization: Bearer
tp_...` header → API token lookup, (2) session cookie → session lookup. This
lets a human tester in the browser and an agent calling the same route share
one middleware stack. Unauthenticated requests get `401
{"error":"unauthorized"}`; `/healthz`, `/readyz`, `/api/v1/meta`, and
`/api/v1/auth/login` stay unauthenticated (health checks and the login
endpoint itself can't require auth).

### D7: Web UI stores no token; it only relies on the session cookie
The web app never sees or stores a bearer token — it authenticates purely via
the `HttpOnly` session cookie set by `/auth/login`, with `fetch`/
`openapi-fetch` calls sending `credentials: 'include'`. API tokens are an
agent-only concept, created and copied by an admin from the UI's token
management screen but never used to authenticate the UI itself. This keeps
XSS blast radius lower (no token in `localStorage`/JS-readable storage).

## Risks / Trade-offs

- **[Risk] Every existing E2E/unit test that calls the API anonymously now
  fails 401** → Mitigation: `apps/api/internal/testutil` gets a test-user /
  test-session helper so existing tests can authenticate with minimal
  changes; Playwright E2E specs get a shared login-as-admin step (likely a
  `beforeEach` or global setup) — tracked explicitly as tasks, not left
  implicit.
- **[Risk] No initial admin exists on a fresh database — chicken-and-egg for
  first login** → Mitigation: a bootstrap step seeds one admin from
  `TESTPULSE_ADMIN_EMAIL` / `TESTPULSE_ADMIN_PASSWORD` env vars on first
  startup if the `users` table is empty (consistent with CLAUDE.md's "config
  only via `TESTPULSE_*` env vars, required values fail fast by name" — but
  here they're optional-with-a-default-admin-skip, since a running instance
  with existing users must never re-seed).
- **[Risk] Session table grows unbounded** → Mitigation: expired sessions
  are deleted lazily (on next login attempt referencing them) plus a
  `DELETE FROM sessions WHERE expires_at < now()` run at API startup; a
  dedicated cleanup job is unnecessary at this scale.
- **[Trade-off] No rate limiting on `/auth/login`** → accepted for v0.1,
  called out as an Open Question; local-network/trusted-deployment
  assumption still holds per `docs/deployment.md`'s existing security
  warning, which this change narrows but doesn't yet fully retire.

## Migration Plan

1. Add migration (amend `00002_core_domain.sql` is not appropriate here —
   this is new tables, not a schema change to an existing domain area, so it
   is a new `00003_identity.sql` per `CLAUDE.md`'s policy: "amend the
   existing migration file **for the schema in question**" applies to
   *modifying* an existing domain's tables, not to genuinely new tables)
   creating `users`, `sessions`, `api_tokens`, `audit_log`.
2. Ship the bootstrap-admin-from-env behavior alongside the migration so a
   fresh `docker compose up` remains usable out of the box.
3. Land backend auth (domain/store/service/middleware) behind the OpenAPI
   contract change, then wire the web login screen — sequenced so the API
   is fully testable via `curl`/integration tests before the UI depends on
   it.
4. Flip existing domain routes to `Authenticate`-protected last, once the
   login flow and test helpers exist, to avoid a window where the API is
   half-protected and hard to test.
5. Rollback: this is pre-1.0 with no real deployment data (per CLAUDE.md);
   rollback is "revert the migration and the commit," not a data-preserving
   downgrade path.

## Open Questions

- Rate limiting / lockout on failed logins — defer to a follow-up or fold
  into `add-sso-oidc`'s hardening work? Leaning defer, not blocking v0.1.
