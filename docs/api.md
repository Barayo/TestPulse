# API

## The contract

The REST API is defined by the OpenAPI 3 document at
[`packages/shared/openapi.yaml`](../packages/shared/openapi.yaml) — the single
source of truth consumed by:

- the web UI, via the generated TypeScript client (`openapi-typescript` +
  `openapi-fetch`),
- external tooling and future connectors,
- the MCP server (arriving in v0.1), which shares the same service layer.

All application endpoints are versioned under `/api/v1`. Health probes sit at
the root because infrastructure expects them there.

## System endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Liveness: process health only; `200` even when the database is down |
| GET | `/readyz` | Readiness: `200` when the database is reachable and migrations are current, `503 {"status":"unavailable","reason":"..."}` otherwise |
| GET | `/api/v1/meta` | Service name and version, plus `publicProjectsEnabled` — the instance-wide public-project-access kill switch (see below) |
| PATCH | `/api/v1/instance-settings` | Update instance-wide settings — currently just `publicProjectsEnabled` — Tenant Admin only |

Everything else under `/` serves the embedded web UI (with SPA fallback).

Example:

```bash
curl -s http://localhost:8080/api/v1/meta
# {"name":"TestPulse","version":"0.0.1"}
```

## Domain endpoints

All request/response bodies are documented precisely in
[`packages/shared/openapi.yaml`](../packages/shared/openapi.yaml) — the
tables below are a quick map, not the source of truth.

Projects, test cases, runs, and suites are addressed by their
human-readable `key` in the path — never by their internal `id` — see
[Test management: keys](test-management.md#keys) for how a key is derived,
its format, and why it's immutable. A response body always includes both
`id` (the stable internal identifier — never used in a path) and `key`
(what you put in the URL, and in a request body wherever one of these four
resource types is referenced, e.g. `caseKey` in the body of
`POST /api/v1/runs/{runKey}/items`). An unrecognized key in a path 404s the
same way an unrecognized id would in any other API. Folders keep their
internal `id` in paths — they aren't in scope for this scheme.

**Projects**

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/projects` | List projects. Every project carries `isSample`, `true` for the one automatically-seeded showroom project a fresh instance gets on first startup (see [Getting started](getting-started.md)), `false` otherwise |
| POST | `/api/v1/projects` | Create a project (`name`; optional `description`) — Tenant Admin only; the response's `key` is auto-derived from `name`; `isSample` is always `false` for a project created this way |
| GET | `/api/v1/projects/summaries` | Suite count, case count, latest-run pass rate and timestamp (`lastRunAt`), and whether the calling user has favorited it, for every non-archived project, in one request — computed server-side (4 grouped SQL queries) so the request count stays constant regardless of how many projects exist. Consumed by the project list and switcher. |
| GET | `/api/v1/projects/{projectKey}` | Get a project |
| PATCH | `/api/v1/projects/{projectKey}` | Rename, describe, archive, and/or set `publicAccess` — Project Admin+ (renaming never changes `key`) |
| POST | `/api/v1/projects/{projectKey}/favorite` | Star the project for the calling user (idempotent) |
| DELETE | `/api/v1/projects/{projectKey}/favorite` | Unstar the project for the calling user (idempotent) |

**Test cases** — every edit creates a new immutable version; see
[Database](database.md) for the versioning model.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/projects/{projectKey}/cases` | List cases (current version content) |
| POST | `/api/v1/projects/{projectKey}/cases` | Create a case (version 1); optional `folderId` defaults to the project's root folder |
| GET | `/api/v1/cases/{caseKey}` | Get a case at its current version |
| PUT | `/api/v1/cases/{caseKey}` | Edit — creates a new version |
| DELETE | `/api/v1/cases/{caseKey}` | Soft delete (versions stay readable in past runs) |
| GET | `/api/v1/cases/{caseKey}/versions` | Full version history, oldest first |

**Folders** — project-level, orthogonal to suites; every case belongs to
exactly one folder, defaulting to the project's root; see
[Database](database.md) for the tree model.

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectKey}/folders` | List all folders (flat) / create a subfolder (`name`, `parentFolderId` — always required) |
| GET | `/api/v1/folders/{folderId}/delete-preview` | Preview a delete's blast radius: `caseCount`/`folderCount` in the subtree, for the confirmation dialog to show before the user confirms (`add-delete-mode`) |
| DELETE | `/api/v1/folders/{folderId}` | Cascading soft delete: the folder and every folder/case in its subtree (`add-delete-mode`, replacing the old reparent behavior); the root folder cannot be deleted (`400`) |
| PUT | `/api/v1/cases/{caseKey}/folder` | Move a case to a different folder (`folderId`) — suite membership is unaffected |

**Suites**

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectKey}/suites` | List / create — list entries include a batched `passRate`/`lastRunAt` from each suite's most recently created run |
| GET / PUT / DELETE | `/api/v1/suites/{suiteKey}` | Get / rename / delete a single suite |
| PUT / DELETE | `/api/v1/suites/{suiteKey}/cases/{caseKey}` | Add / remove a case (n:m; removing does not delete the case) |
| GET | `/api/v1/suites/{suiteKey}/trend` | Pass-rate trend across the suite's closed runs, oldest first |

**Runs and execution**

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectKey}/runs` | List / create a run — pins each case's *current* version at creation time; body takes `suiteKey` and/or `caseKeys` |
| GET | `/api/v1/runs/{runKey}` | Get a run — response includes `projectKey` alongside `key`, since a run's own route isn't nested under its project's, and `status` (`open`/`closed`) |
| POST | `/api/v1/runs/{runKey}/close` | Seal a run — requires `runRecordResult`, the same permission needed to record a verdict |
| POST | `/api/v1/runs/{runKey}/reopen` | Reopen a closed run — requires `manageProject`, the project-admin-level permission |
| GET / POST | `/api/v1/runs/{runKey}/items` | List items (optionally `?assignee=<userId-or-teamId>`) / add a case to an open run (`caseKey` in the body; pins its then-current version) |
| GET / POST | `/api/v1/items/{itemId}/results` | Append-only result log: list, or record a verdict (`verdict`, `comment`, optional `actor` override — see below) |
| PUT | `/api/v1/items/{itemId}/status` | Set `status` (e.g. `retest`) and/or assign to a real project member: `assigneeUserId` or `assigneeTeamId` (mutually exclusive; the id must belong to the project's membership) |
| GET | `/api/v1/runs/{runKey}/summary` | Item counts by current status |
| POST | `/api/v1/projects/{projectKey}/imports` | Bulk-import a JUnit XML report: matches each `<testcase>` to an existing case by its `key`, creates one run — created `closed`, not `open` — with items/results for every match. `201` if every test matched; `207` if some/all didn't (see [Importing results](importing-results.md)) |
| GET / POST | `/api/v1/items/{itemId}/attachments` | List / stage a screenshot attachment (`multipart/form-data`, field `file`; PNG/JPEG/WebP, max 5MB) against an item before a verdict exists — `result_id` unset until linked via `recordResult`'s `attachmentIds` |
| GET / POST | `/api/v1/results/{resultId}/attachments` | List a result's attachments / attach a screenshot directly to an already-recorded result (after-the-fact attach from History) |
| GET / DELETE | `/api/v1/attachments/{attachmentId}` | The raw image bytes for an attachment, cacheable via `ETag`/`Cache-Control` — Read+ / delete an attachment — requires `runRecordResult` |

**Public project access** — unauthenticated, mirroring the shapes above
under `/api/v1/public/...`; reachable only when both `publicAccess` (the
project's own flag) and `publicProjectsEnabled` (the instance-wide switch)
are true — `404` otherwise, the same response whether the project isn't
public, doesn't exist, or the switch is off (see
[Public project access](test-management.md#public-project-access)).

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/public/projects/{projectKey}` | Get a public project |
| GET | `/api/v1/public/projects/{projectKey}/cases` \| `/folders` \| `/flaky-cases` \| `/suites` \| `/runs` | List, same shapes as the authenticated equivalents |
| GET | `/api/v1/public/cases/{caseKey}` \| `/versions` \| `/executions` | A case, its version history, its execution history |
| GET | `/api/v1/public/suites/{suiteKey}` \| `/trend` | A suite, its pass-rate trend |
| GET | `/api/v1/public/runs/{runKey}` \| `/items` \| `/summary` | A run, its items, its status counts |
| GET | `/api/v1/public/items/{itemId}/results` | A run item's result log |
| GET | `/api/v1/public/attachments/{attachmentId}` | The raw image bytes for an attachment |

No public route ever exposes project membership or a caller's own
permissions (there is no caller), and no public route accepts a write.

Validation errors return `400 {"error": "..."}` naming the offending field;
missing entities return `404 {"error": "not found"}`. Unauthenticated
requests return `401 {"error": "unauthorized"}`; authenticated requests
lacking permission return `403 {"error": "..."}`. A request that conflicts
with the resource's current state — recording a result, updating an item,
or adding an item on a *closed* run — returns `409 {"error": "..."}`.

Recording a result no longer requires a client-supplied `actor` — it
defaults to the authenticated caller's display name, and the response's
`actorKind` (`user`/`agent`/`unknown`) and `actorRefId` record the real
actor behind it. A client may still pass `actor` explicitly to override the
*displayed* name (e.g. an agent recording on behalf of a named human
tester) — the real authenticated actor's `actorKind`/`actorRefId` are still
recorded underneath the override, never spoofed. Results recorded before
this capability shipped read back with `actorKind: "unknown"`.

A result can carry image attachments (screenshots) two ways, both
transactional — a client is never left with a result that exists without
the evidence it was submitted with (`add-run-item-screenshot-attachments`):
`recordResult` and `importResults` each accept an optional `attachments`
array of inline, base64-encoded images (`filename`, `contentType`, `data`;
`importResults`' entries additionally carry `caseKey` to target a specific
matched test), created in the same transaction as the result(s). `recordResult`
also accepts `attachmentIds`, linking attachments previously staged via
`POST /api/v1/items/{itemId}/attachments` (the UI's paste/drag flow, which
uploads immediately but has no result to attach to until a verdict is
recorded). The JUnit XML report itself is never parsed for embedded
attachments — there's no shared convention across tools for it — so
importer authors send screenshots as the request's separate `attachments`
field alongside the report text, not inside it.

**Identity**

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/login` | Log in with `email`/`password`; sets an `HttpOnly` session cookie (30-day sliding expiry). Rate-limited per client IP (burst of 5, refilling at 5/minute) — returns `429` once exhausted |
| POST | `/api/v1/auth/logout` | End the current session |
| GET | `/api/v1/users/me` | The currently authenticated actor, as a user record |
| PATCH | `/api/v1/users/me` | Update the caller's own `displayName`, `avatarKey`, and/or `timezone` — self-service only, no target-user parameter |
| POST | `/api/v1/users/me/avatar` | Upload a custom photo avatar (`multipart/form-data`, field `avatar`; JPEG/PNG/WebP, max 500KB) — server-side center-cropped and resized to 128×128, sets `avatarKey` to the reserved value `"custom"` |
| DELETE | `/api/v1/users/me/avatar` | Remove the caller's custom photo avatar, reverting to the generated default |
| GET | `/api/v1/users/{userId}/avatar` | The raw image bytes for a user's custom photo avatar (always JPEG), if they have one — cacheable via `ETag`/`Cache-Control` |
| GET | `/api/v1/users` | List users |
| POST | `/api/v1/users` | Create a user (`email`, `password`, `isTenantAdmin`) — Tenant Admin only; `displayName` defaults to a name derived from the email's local-part (`jane.doe@x.com` → "Jane Doe") rather than staying unset |
| PATCH | `/api/v1/users/{userId}` | Change `isTenantAdmin`, `deactivate`/`reactivate`, and/or the account's `email`/`password` — Tenant Admin only (`add-update-user`); setting a new `password` revokes every existing session for that account |
| GET | `/api/v1/tokens` | List API tokens — own tokens, or `?userId=` for another user's (Tenant Admin only) |
| POST | `/api/v1/tokens` | Create an API token (`name`, optional `projectId`+`roleId`) for an agent; the full value is returned once and never again |
| DELETE | `/api/v1/tokens/{tokenId}` | Revoke a token — its own creator, or a Tenant Admin |
| GET | `/api/v1/audit?entityType=&entityId=` | Audit history for a specific entity, oldest first |

**Teams** (`add-project-rbac`, Tenant Admin only throughout)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/teams` | List teams |
| POST | `/api/v1/teams` | Create a team (`name`) |
| PATCH | `/api/v1/teams/{teamId}` | Rename a team |
| DELETE | `/api/v1/teams/{teamId}` | Delete a team — cascades its membership and project role assignments |
| GET | `/api/v1/teams/{teamId}/deletion-preview` | Real reference counts for the delete-team confirmation dialog — current member count and distinct projects it holds a role on (`add-team-deletion-preview`) |
| POST | `/api/v1/teams/{teamId}/members/{userId}` | Add a user to a team |
| DELETE | `/api/v1/teams/{teamId}/members/{userId}` | Remove a user from a team |

**Roles** (`add-project-rbac`, fully custom and instance-wide — design.md D10, Tenant Admin only throughout)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/roles` | List all roles |
| POST | `/api/v1/roles` | Create a role (`name`, `rank`, and the ten `can*` permission flags below) |
| PATCH | `/api/v1/roles/{roleId}` | Update a role's name, rank, or permission flags |
| DELETE | `/api/v1/roles/{roleId}` | Delete a role — cascades any project membership/team role assignment referencing it |
| GET | `/api/v1/roles/{roleId}/deletion-preview` | Real reference counts for the delete-role confirmation dialog — direct user assignments, team assignments, and distinct projects touched (`redesign-admin-shell`) |
| POST | `/api/v1/roles/reset` | Restore Tester/Contributor/Project Admin to their factory permission flags, in place — an existing one of the three keeps its `id` (so assignments referencing it stay valid), a missing one is recreated. Every other role, and every assignment, is untouched — not a wipe (design.md D12) |

Each role carries ten independent boolean flags (design.md D11 — concrete,
per-resource actions rather than a handful of broad ones): `canRead`,
`canCaseCreate`, `canCaseEdit`, `canCaseDelete`, `canSectionCreate`,
`canSectionDelete`, `canSuiteCreate`, `canSuiteEditMembership`,
`canRunCreate`, `canRunRecordResult`, `canManageProject`. `rank` is a
display/sort order only, never compared for authorization — see
[Test management](test-management.md#project-roles-and-teams).

**Project membership** (`add-project-rbac`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/projects/{projectKey}/members` | List a project's directly-assigned users and assigned teams with their `roleId` — Read+ |
| GET | `/api/v1/projects/{projectKey}/permissions` | The caller's own effective permission flags on this project — Read+; a Tenant Admin gets every flag `true`. Built for the frontend to hide (not just disable) permission-gated controls (`add-delete-mode`) |
| PUT | `/api/v1/projects/{projectKey}/members/{userId}` | Assign/change a user's project role (`roleId`: a `Role.id`) — Tenant Admin only |
| DELETE | `/api/v1/projects/{projectKey}/members/{userId}` | Remove a user's direct project role assignment — Tenant Admin only |
| PUT | `/api/v1/projects/{projectKey}/teams/{teamId}` | Assign/change a team's project role (`roleId`) — Tenant Admin only |
| DELETE | `/api/v1/projects/{projectKey}/teams/{teamId}` | Remove a team's project role assignment — Tenant Admin only |

## Authentication

Local users (bcrypt-hashed passwords) and scoped API tokens for agents
(`add-identity-basics`); OIDC SSO arrives in v0.2. Every request to a domain
route (projects, cases, suites, runs, folders and their sub-resources) must
resolve to an authenticated actor:

- **Web UI**: session cookie set by `POST /api/v1/auth/login`. The cookie is
  `HttpOnly`, `SameSite=Lax`, and `Secure` whenever the request arrived over
  HTTPS — either terminated by the app itself, or by a reverse proxy in
  front that sets `X-Forwarded-Proto: https` — see
  [Deployment](deployment.md#security-status) for the current HTTPS status.
  If the session goes invalid while the app is
  already in use (cookie expiry, revocation), a `401` on any request opens
  a non-dismissable login modal over the current view rather than an empty
  page or a route change (`handle-session-expiry`) — the email of whoever
  was logged in is pre-filled but can be changed. On success the app
  reloads: the same URL if it's the same user, or the home route if a
  different user logged in instead, since data already held in memory may
  belong to the previous session.
- **Agents**: `Authorization: Bearer tp_<token>`, created via
  `POST /api/v1/tokens` by any authenticated user. A token acts as its own
  actor — distinct from, and never impersonating, the human who created it
  — at that human's *current* permission level, resolved fresh on every
  request (`add-project-rbac`).
- **Scoped agent tokens** (`add-scoped-api-tokens`, backlog #117): creation
  optionally accepts `projectId`+`roleId` to cap a token to a single
  project and a single named role, instead of inheriting its creator's
  full current access. The creator must currently hold every permission
  the chosen role grants — a role broader than the creator's own access is
  rejected at creation (`400`). Enforcement is request-time, not a
  one-time snapshot: a scoped token's effective permissions are the
  *intersection* of the role's flags and the creator's current permissions
  on that project, recomputed on every request, so the token
  automatically narrows if the creator's access later narrows, and stops
  authenticating entirely (`401`) if its role is deleted. A scoped token
  from a Tenant Admin creator is still capped to the scope — Tenant Admin
  status never bypasses a token's own scope. A read-only `Viewer` role is
  seeded by default for the common single-purpose integration case;
  omitting `projectId`/`roleId` keeps today's unscoped, full-access
  behavior.

One instance-wide `Tenant Admin` flag (creates projects, manages user
accounts, teams, and roles, assigns project membership, and has implicit
access to every project) plus fully custom, instance-wide project-scoped
roles (design.md D10) — the Tenant Admin creates/renames/deletes roles and
toggles ten concrete, per-resource permission flags on each (design.md D11)
— assignable to a user directly or via a team. A user's effective permissions on a project are the union of every
role granted to them, not a single ranked role. A non-Tenant-Admin has no
access to a project at all, including read, until explicitly assigned a
role on it. See [Test management](test-management.md#project-roles-and-teams)
for the full permission model. Every write is recorded in an append-only
audit log naming the acting actor (human or agent), queryable per entity via
`GET /api/v1/audit`.

A fresh instance seeds one user as Tenant Admin from `TESTPULSE_ADMIN_EMAIL`
/ `TESTPULSE_ADMIN_PASSWORD` on first startup (skipped once any user exists
— see [Development](development.md)).

## Versioning policy

- `/api/v1` is unstable until v1.0 — breaking changes may occur between 0.x
  releases and are called out in release notes.
- The OpenAPI document version tracks the application version.
