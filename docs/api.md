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
| GET | `/api/v1/meta` | Service name and version |

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

**Projects**

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/projects` | List projects |
| POST | `/api/v1/projects` | Create a project (`name`; optional `description`, `ownerId`) |
| GET | `/api/v1/projects/summaries` | Suite count, case count, latest-run pass rate and timestamp (`lastRunAt`), and whether the calling user has favorited it, for every non-archived project, in one request — computed server-side (4 grouped SQL queries) so the request count stays constant regardless of how many projects exist. Consumed by the project list and switcher. |
| GET | `/api/v1/projects/{projectId}` | Get a project |
| PATCH | `/api/v1/projects/{projectId}` | Rename, describe, assign an owner to, and/or archive |
| POST | `/api/v1/projects/{projectId}/favorite` | Star the project for the calling user (idempotent) |
| DELETE | `/api/v1/projects/{projectId}/favorite` | Unstar the project for the calling user (idempotent) |

**Test cases** — every edit creates a new immutable version; see
[Database](database.md) for the versioning model.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/projects/{projectId}/cases` | List cases (current version content) |
| POST | `/api/v1/projects/{projectId}/cases` | Create a case (version 1); optional `folderId` defaults to the project's root folder |
| GET | `/api/v1/cases/{caseId}` | Get a case at its current version |
| PUT | `/api/v1/cases/{caseId}` | Edit — creates a new version |
| DELETE | `/api/v1/cases/{caseId}` | Soft delete (versions stay readable in past runs) |
| GET | `/api/v1/cases/{caseId}/versions` | Full version history, oldest first |

**Folders** — project-level, orthogonal to suites; every case belongs to
exactly one folder, defaulting to the project's root; see
[Database](database.md) for the tree model.

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectId}/folders` | List all folders (flat) / create a subfolder (`name`, `parentFolderId` — always required) |
| DELETE | `/api/v1/folders/{folderId}` | Delete, reparenting child folders and cases to its parent; the root folder cannot be deleted (`400`) |
| PUT | `/api/v1/cases/{caseId}/folder` | Move a case to a different folder (`folderId`) — suite membership is unaffected |

**Suites**

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectId}/suites` | List / create |
| PUT / DELETE | `/api/v1/suites/{suiteId}/cases/{caseId}` | Add / remove a case (n:m; removing does not delete the case) |

**Runs and execution**

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectId}/runs` | List / create a run — pins each case's *current* version at creation time |
| GET | `/api/v1/runs/{runId}` | Get a run |
| GET / POST | `/api/v1/runs/{runId}/items` | List items (optionally `?assignee=`) / add a case to an open run (pins its then-current version) |
| GET / POST | `/api/v1/items/{itemId}/results` | Append-only result log: list, or record a verdict (`actor`, `verdict`, `comment`) |
| PUT | `/api/v1/items/{itemId}/status` | Set `status` (e.g. `retest`) and/or `assignee` |
| GET | `/api/v1/runs/{runId}/summary` | Item counts by current status |

Validation errors return `400 {"error": "..."}` naming the offending field;
missing entities return `404 {"error": "not found"}`. Unauthenticated
requests return `401 {"error": "unauthorized"}`; authenticated requests
lacking permission return `403 {"error": "..."}`.

**Identity**

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/login` | Log in with `email`/`password`; sets an `HttpOnly` session cookie (30-day sliding expiry) |
| POST | `/api/v1/auth/logout` | End the current session |
| GET | `/api/v1/users/me` | The currently authenticated actor, as a user record |
| GET | `/api/v1/users` | List users |
| POST | `/api/v1/users` | Create a user (`email`, `password`, `role`) — admin only |
| PATCH | `/api/v1/users/{userId}` | Change `role` and/or `deactivate` — admin only |
| GET | `/api/v1/tokens` | List API tokens — own tokens, or `?userId=` for another user's (admin only) |
| POST | `/api/v1/tokens` | Create an API token (`name`) for an agent; the full value is returned once and never again |
| DELETE | `/api/v1/tokens/{tokenId}` | Revoke a token — its own creator, or an admin |
| GET | `/api/v1/audit?entityType=&entityId=` | Audit history for a specific entity, oldest first |

## Authentication

Local users (bcrypt-hashed passwords) and scoped API tokens for agents
(`add-identity-basics`); OIDC SSO arrives in v0.2. Every request to a domain
route (projects, cases, suites, runs, folders and their sub-resources) must
resolve to an authenticated actor:

- **Web UI**: session cookie set by `POST /api/v1/auth/login`. The cookie is
  `HttpOnly`, `SameSite=Lax`, and `Secure` whenever the request itself
  arrived over TLS — see [Deployment](deployment.md#security-status) for the
  current HTTPS status.
- **Agents**: `Authorization: Bearer tp_<token>`, created via
  `POST /api/v1/tokens` by any authenticated user. A token acts as its own
  actor — distinct from, and never impersonating, the human who created it
  — at that human's role.

Two instance-wide roles: `admin` (the above, plus user management) and
`member` (full read/write on domain data). Every write is recorded in an
append-only audit log naming the acting actor (human or agent), queryable
per entity via `GET /api/v1/audit`.

A fresh instance seeds one admin from `TESTPULSE_ADMIN_EMAIL` /
`TESTPULSE_ADMIN_PASSWORD` on first startup (skipped once any user exists —
see [Development](development.md)).

## Versioning policy

- `/api/v1` is unstable until v1.0 — breaking changes may occur between 0.x
  releases and are called out in release notes.
- The OpenAPI document version tracks the application version.
