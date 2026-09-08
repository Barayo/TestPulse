# API

## The contract

The REST API is defined by the OpenAPI 3 document at
[`packages/shared/openapi.yaml`](../packages/shared/openapi.yaml) — the single
source of truth consumed by:

- the web UI, via the generated TypeScript client (`openapi-typescript` +
  `openapi-fetch`),
- external tooling and future connectors.

All application endpoints are versioned under `/api/v1`. Health probes sit at
the root because infrastructure expects them there. The [MCP server](mcp-server.md)
(`/mcp`) is a separate protocol, not part of this OpenAPI contract, but its
tools are thin wrappers over the same service layer these REST handlers use
— see that page for the tool reference.

## Request body limits

Every `/api/v1` request body is capped at 32MB by default — generous
enough for a large JUnit XML report plus several inline base64-encoded
screenshots (`POST /projects/{projectKey}/imports`), but finite. The
pre-authentication routes (`/auth/login`, `/auth/forgot-password`,
`/auth/reset-password`, `/setup`) get a much tighter 64KB ceiling instead,
since none of them ever legitimately carries more than an email/password
pair. A body over its route's limit is rejected before being fully read
into memory. Attachment and avatar uploads (`multipart/form-data`) have
their own separate, smaller limit — see the 5MB note on their routes
below.

## Cursor pagination

Eight list endpoints — `GET /api/v1/projects/{projectKey}/runs`,
`GET /api/v1/runs/{runKey}/items`, `GET /api/v1/users`, `GET /api/v1/teams`,
`GET /api/v1/roles`, `GET /api/v1/projects/{projectKey}/cases`,
`GET /api/v1/projects/{projectKey}/folders`, and
`GET /api/v1/projects/{projectKey}/suites` — plus their public,
unauthenticated `cases`/`folders`/`suites`/`runs`/`runs/{runKey}/items`
siblings under `/api/v1/public/...` (same handlers, same shape) — always
return a cursor-paginated envelope, never a bare array:

```json
{ "items": [ /* ... */ ], "nextCursor": "eyJjcmVhdGVkQXQiOi4uLn0=" }
```

- **`nextCursor`** is `null` on the last page, otherwise an opaque token.
  Treat it as a black box: never construct or decode it — pass it back
  verbatim as the next request's `cursor` query parameter to resume
  immediately after the current page, with no gap or overlap even when
  rows share an identical `created_at`. A `cursor` value that isn't one
  this endpoint issued (malformed, or from a different endpoint) is
  rejected with `400` rather than silently returning an arbitrary page.
- **`limit`** is optional, defaults to 50, and is silently clamped to a
  maximum of 200 — never rejected. `limit=0`, a negative value, or
  omitting it entirely all fall back to the default.
- **Ordering** is unchanged from before pagination was introduced:
  `GET /projects/{projectKey}/runs` stays newest-first (`created_at
  DESC`); every other affected endpoint stays insertion-order
  (`created_at ASC`), with `GET /roles` ordering by `rank` first, as it
  already did. Every endpoint adds `id` as a deterministic tiebreaker so
  a `created_at` tie never skips or duplicates a row across pages.

A handful of internal, non-HTTP code paths that genuinely need a complete
result set (first-run setup's user-existence check, resetting roles to
their factory defaults, run comparison) are unaffected — they call
separate, still-unbounded store methods that this pagination layer
doesn't sit in front of.

This is the pattern for any future list endpoint, too: a new list
endpoint should return this same `{ items, nextCursor }` shape rather than
a bare array.

## System endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Liveness: process health only; `200` even when the database is down |
| GET | `/readyz` | Readiness: `200` when the database is reachable and at the latest applied migration, `503 {"status":"unavailable","reason":"..."}` otherwise |
| GET | `/api/v1/meta` | Service name and version, plus `publicProjectsEnabled` (see below), `passwordResetEnabled` — whether self-service password recovery is available (SMTP configured), `ssoEnabled`/`ssoOnly` — whether OIDC/SSO login is configured and whether password login is disabled instance-wide (`add-sso-oidc`), and `colorTheme`/`customPalette` (see below) |
| GET | `/api/v1/instance-settings` | Read instance-wide settings (`publicProjectsEnabled`, `runRetentionDays`, `autoArchiveInactiveDays`, `colorTheme`, `customPalette`, `oidcIssuer`, `oidcClientId`, `oidcClientSecretSet`, `oidcGroupClaim`, `oidcAdminClaimValues`, `oidcOnly`, `sessionTimeoutDays`) — Tenant Admin only. The OIDC client secret itself is never returned, only whether one is set |
| PATCH | `/api/v1/instance-settings` | Update instance-wide settings — any subset of `publicProjectsEnabled`, `runRetentionDays`, `autoArchiveInactiveDays`, `colorTheme`/`customPalette` (`add-data-retention`/`add-color-theme-customization`), `sessionTimeoutDays` (1–90, `add-session-timeout-setting` — only affects sessions created/extended afterward, not already-active ones), or `oidcIssuer`/`oidcClientId`/`oidcClientSecret`/`oidcGroupClaim`/`oidcAdminClaimValues`/`oidcOnly`/`disableSso` (`add-sso-oidc`) — Tenant Admin only. Changing the issuer/client ID/client secret validates the new values via live OIDC discovery before persisting anything, `400` on failure. `oidcClientSecret` is write-only (omit to keep the current one); `disableSso: true` clears every OIDC field at once |
| GET | `/api/v1/sso/team-mappings` | List claim→Team mappings (`add-sso-oidc`) — Tenant Admin only |
| POST | `/api/v1/sso/team-mappings` | Create a claim→Team mapping (`claimValue`, `teamId`) — on every OIDC login, a user whose ID token's group claim includes `claimValue` is added to that Team if not already a member (additive only) — Tenant Admin only |
| DELETE | `/api/v1/sso/team-mappings/{mappingId}` | Delete a claim→Team mapping — Tenant Admin only |

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
| GET | `/api/v1/projects/summaries` | Suite count, case count, latest-run pass rate and timestamp (`lastRunAt`), whether the calling user has favorited it, and its assigned tags (`tags`, `add-project-tags`), for every non-archived project, in one request — computed server-side (5 grouped SQL queries) so the request count stays constant regardless of how many projects exist. Consumed by the project list and switcher. |
| GET | `/api/v1/projects/{projectKey}` | Get a project |
| PATCH | `/api/v1/projects/{projectKey}` | Rename, describe, archive/unarchive (`archived: true`/`false`, both directions — `add-data-retention` D7), and/or set `publicAccess` — Project Admin+ (renaming never changes `key`). `autoArchiveExempt` (`add-data-retention` D9 — exempts the project from the instance-wide auto-archive policy) is accepted in the same request body but enforced separately: rejected with `403` from anyone but a Tenant Admin, even a Project Admin who otherwise passes this route's `manageProject` gate |
| DELETE | `/api/v1/projects/{projectKey}` | Permanently delete an **already-archived** project and everything scoped to it — `400` if the project isn't archived first. Returns `202 Accepted`: the project is hidden from lists immediately, but the actual purge (sections, cases, versions, suites, runs, items, results, membership) happens asynchronously in the background over the following seconds-to-minutes. Requires `projectDelete`, kept separate from `manageProject` (`add-data-retention` D4) |
| POST | `/api/v1/projects/{projectKey}/favorite` | Star the project for the calling user (idempotent) |
| DELETE | `/api/v1/projects/{projectKey}/favorite` | Unstar the project for the calling user (idempotent) |
| PUT | `/api/v1/projects/{projectKey}/tags/{tagName}` | Assign a tag to the project (`add-project-tags`) — requires `read` on the project, same bar as favoriting; creates the shared vocabulary entry if it doesn't already exist, case-insensitively (idempotent) |
| DELETE | `/api/v1/projects/{projectKey}/tags/{tagName}` | Remove a tag from the project (idempotent) — the tag itself stays in the shared vocabulary for reuse |
| GET | `/api/v1/tags` | List the full shared tag vocabulary, for the project list's filter control and the tag picker's autocomplete |

**Test cases** — every edit creates a new immutable version; see
[Database](database.md) for the versioning model.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/projects/{projectKey}/cases` | List cases (current version content) — [cursor-paginated](#cursor-pagination) |
| POST | `/api/v1/projects/{projectKey}/cases` | Create a case (version 1); optional `folderId` defaults to the project's root folder |
| GET | `/api/v1/cases/{caseKey}` | Get a case at its current version |
| PUT | `/api/v1/cases/{caseKey}` | Edit — creates a new version |
| DELETE | `/api/v1/cases/{caseKey}` | Soft delete (versions stay readable in past runs) |
| GET | `/api/v1/cases/{caseKey}/versions` | Full version history, oldest first |
| POST | `/api/v1/cases/{caseKey}/versions/{version}/restore` | Restore an old version's content as a **new** current version — never rewinds `currentVersion` in place |
| GET | `/api/v1/cases/{caseKey}/executions` | Every execution that has pinned this case, across all runs. Default: grouped by pinned version, then time. `?order=recent&limit=N` (N ≤ 50): the N most recent executions strictly by recency, bounded server-side. `limit` without `order=recent`, or `limit` above 50, is rejected with 400. |

**Custom fields** (`add-case-custom-fields`) — project-scoped case classification fields, either `text` or `select` (a closed, admin-defined option list); a field's `fieldType` is fixed at creation. Case content's `customFields` is a `{fieldId: value}` map (a select field's value is one of its option ids).

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/projects/{projectKey}/custom-fields` | List a project's custom field definitions, ordered by their admin-set position, each with its options if `select` |
| POST | `/api/v1/projects/{projectKey}/custom-fields` | Define a field (`name`, `fieldType`) — requires `manageProject` |
| PUT | `/api/v1/projects/{projectKey}/custom-fields/order` | Set the display order of a project's fields (`fieldIds`, the full new order) — requires `manageProject` |
| PATCH | `/api/v1/custom-fields/{fieldId}` | Rename a field (`name`) — `fieldType` is immutable, requires `manageProject` |
| DELETE | `/api/v1/custom-fields/{fieldId}` | Delete a field — does not rewrite any case version's recorded content, requires `manageProject` |
| GET | `/api/v1/custom-fields/{fieldId}/deletion-preview` | How many of the project's current cases have a value set for this field, requires `manageProject` |
| POST | `/api/v1/custom-fields/{fieldId}/options` | Add an option to a `select` field (`value`), requires `manageProject` |
| DELETE | `/api/v1/custom-fields/{fieldId}/options/{optionId}` | Remove an option from a `select` field, requires `manageProject` |
| PUT | `/api/v1/custom-fields/{fieldId}/options/order` | Set the display order of a `select` field's options (`optionIds`), requires `manageProject` |

**Shared step groups** (`add-reusable-steps`) — project-scoped, named, ordered lists of steps a case's own step content may reference instead of retyping them. A case step carrying `groupRef` (`{groupKey}` on input) is resolved and snapshotted into the saved version's content server-side at save time — editing the source group afterward never changes an already-saved version. List/get require `read`; create/update/delete require `manageProject`. See [Test management](test-management.md#test-cases-and-versioning) for the snapshot/staleness/refresh/detach model.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/projects/{projectKey}/step-groups` | List a project's shared step groups |
| POST | `/api/v1/projects/{projectKey}/step-groups` | Create a step group (`name`, `steps`) — requires `manageProject` |
| GET | `/api/v1/step-groups/{groupId}` | Get a step group |
| PUT | `/api/v1/step-groups/{groupId}` | Rename and/or redefine a step group's steps — requires `manageProject`. Never changes an already-saved case version that referenced it |
| DELETE | `/api/v1/step-groups/{groupId}` | Soft-delete a step group — requires `manageProject`. Already-saved case versions are unaffected |

**Folders** — project-level, orthogonal to suites; every case belongs to
exactly one folder, defaulting to the project's root; see
[Database](database.md) for the tree model.

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectKey}/folders` | List all folders (flat, [cursor-paginated](#cursor-pagination)) / create a subfolder (`name`, `parentFolderId` — always required) |
| GET | `/api/v1/folders/{folderId}/delete-preview` | Preview a delete's blast radius: `caseCount`/`folderCount` in the subtree, for the confirmation dialog to show before the user confirms (`add-delete-mode`) |
| DELETE | `/api/v1/folders/{folderId}` | Cascading soft delete: the folder and every folder/case in its subtree (`add-delete-mode`, replacing the old reparent behavior); the root folder cannot be deleted (`400`) |
| PUT | `/api/v1/folders/{folderId}` | Move (reparent) a folder to a different parent (`parentFolderId`), requires `sectionEdit` (`add-library-folder-selection`). Rejects a target that is the folder itself or anywhere in its own subtree, and rejects moving the root folder — both `400`, never a `500` or a silent no-op |
| PUT | `/api/v1/cases/{caseKey}/folder` | Move a case to a different folder (`folderId`) — suite membership is unaffected |

**Suites**

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectKey}/suites` | List ([cursor-paginated](#cursor-pagination)) / create — list entries include a batched `passRate`/`lastRunAt` from each suite's most recently created run |
| GET / PUT / DELETE | `/api/v1/suites/{suiteKey}` | Get / rename / delete a single suite |
| PUT / DELETE | `/api/v1/suites/{suiteKey}/cases/{caseKey}` | Add / remove a case (n:m; removing does not delete the case) |
| GET | `/api/v1/suites/{suiteKey}/trend?includeOpen=` | Status-breakdown trend across the suite's most recent 15 closed runs, oldest first; `includeOpen=true` adds the current open run as a trailing, marked point |

**Releases and Test Plans** — optional (`introduce-release-test-plan`); a project that never creates one is unaffected.

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectKey}/releases` | List (optionally `?status=active\|maintained\|eol`) / create a release. Create requires `manageProject` |
| GET | `/api/v1/projects/{projectKey}/plans` | Every test plan across all of the project's releases, in one batched request — populates a Test Plan picker without an N+1 releases-then-plans fetch |
| GET / PUT / DELETE | `/api/v1/releases/{releaseKey}` | Get / update (`name`, `description`, `status`) / delete a release. Delete is `409` while it still has test plans. Write requires `manageProject` |
| GET | `/api/v1/releases/{releaseKey}/rollup` | Aggregated `{runCount, passRate}` across every run belonging to any of the release's test plans — a single server-side aggregate query |
| GET / POST | `/api/v1/releases/{releaseKey}/plans` | List / create a test plan scoped to the release. Create requires `manageProject` |
| GET / PUT / DELETE | `/api/v1/plans/{planKey}` | Get / update (`name`, `description`) / delete a test plan. Delete is `409` while it still has runs. Write requires `manageProject` |
| GET | `/api/v1/plans/{planKey}/rollup` | Aggregated `{runCount, passRate}` across the test plan's own runs |
| GET | `/api/v1/plans/{planKey}/runs` | The runs scoped to a single test plan, newest first |

**Runs and execution**

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v1/projects/{projectKey}/runs` | List ([cursor-paginated](#cursor-pagination), newest first) / create a run — pins each case's *current* version at creation time; body takes `suiteKey` and/or `caseKeys`, plus an optional `testPlanKey` (`introduce-release-test-plan`) to scope the run to a Test Plan |
| GET | `/api/v1/runs/{runKey}` | Get a run — response includes `projectKey` alongside `key`, since a run's own route isn't nested under its project's, and `status` (`open`/`closed`) |
| POST | `/api/v1/runs/{runKey}/close` | Seal a run — requires `runRecordResult`, the same permission needed to record a verdict |
| POST | `/api/v1/runs/{runKey}/reopen` | Reopen a closed run — requires `manageProject`, the project-admin-level permission |
| DELETE | `/api/v1/runs/{runKey}` | Permanently delete a run, its items, and its results (`204`) — no archived precondition, unlike project deletion. Requires `runDelete` (`add-data-retention` D1). A closed run may also be deleted automatically by the run-retention worker once past the configured age threshold — see [Test management](test-management.md#run-retention) |
| GET / POST | `/api/v1/runs/{runKey}/items` | List items ([cursor-paginated](#cursor-pagination), optionally `?assignee=<userId-or-teamId>`) / add a case to an open run (`caseKey` in the body; pins its then-current version) |
| GET / POST | `/api/v1/items/{itemId}/results` | Append-only result log: list, or record a verdict (`verdict`, `comment`, optional `actor` override — see below) |
| PUT | `/api/v1/items/{itemId}/status` | Set `status` (e.g. `retest`) and/or assign to a real project member: `assigneeUserId` or `assigneeTeamId` (mutually exclusive; the id must belong to the project's membership) |
| GET | `/api/v1/runs/{runKey}/summary` | Item counts by current status |
| GET | `/api/v1/projects/{projectKey}/runs/status-summary` | Item counts by current status, aggregated across every run in the project (open and closed) — the project-wide equivalent of a single run's own `/summary`, backing the Reports page |
| GET | `/api/v1/projects/{projectKey}/flaky-cases` | Every case whose current version is currently flaky (both a pass and a failed/blocked result), with its computed `rate` |
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
| GET | `/api/v1/public/projects/{projectKey}/cases` \| `/folders` \| `/flaky-cases` \| `/suites` \| `/runs` \| `/runs/status-summary` \| `/custom-fields` | List, same shapes as the authenticated equivalents — `cases`, `folders`, `suites`, and `runs` are [cursor-paginated](#cursor-pagination), same handlers as their authenticated siblings |
| GET | `/api/v1/public/cases/{caseKey}` \| `/versions` \| `/executions` | A case, its version history, its execution history — `/executions` supports the same `order=recent&limit=N` params as the authenticated route |
| GET | `/api/v1/public/suites/{suiteKey}` \| `/trend?includeOpen=` | A suite, its status-breakdown trend — same `includeOpen` support as the authenticated route |
| GET | `/api/v1/public/runs/{runKey}` \| `/items` \| `/summary` | A run, its items ([cursor-paginated](#cursor-pagination)), its status counts |
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
| POST | `/api/v1/setup` | Create the instance's first Tenant Admin (`email`/`password`, chosen directly) and log in as it, in one request — only available while the instance has zero users (`add-first-run-setup`); `409` once any user exists. Not rate-limited (self-closing after first use) |
| POST | `/api/v1/auth/login` | Log in with `email`/`password`; sets an `HttpOnly` session cookie with a Tenant-Admin-configurable sliding expiry (`sessionTimeoutDays` instance setting, default 30, bounded 1–90 — `add-session-timeout-setting`). Rate-limited per client IP (burst of 5, refilling at 5/minute by default — see `TESTPULSE_LOGIN_RATE_LIMIT_PER_MINUTE`/`_BURST`, [Deployment](deployment.md#configuration-reference)) — returns `429` once exhausted |
| POST | `/api/v1/auth/logout` | End the current session |
| POST | `/api/v1/auth/forgot-password` | Request a password-reset email (`email`) — only available when the instance has SMTP configured (`passwordResetEnabled` on `GET /api/v1/meta`). Always returns `200` regardless of outcome (unknown email, deactivated account, SMTP not configured) — never leaks account existence or instance configuration. Rate-limited the same way as login |
| POST | `/api/v1/auth/reset-password` | Redeem a password-reset token (`token`, `newPassword`) — single-use, expires 30 minutes after the email was sent. Revokes every existing session for the account and clears `mustChangePassword` if it was set |
| GET | `/api/v1/auth/oidc/login` | Start OIDC/SSO login (`add-sso-oidc`) — redirects (`302`) to the configured identity provider's authorization endpoint. `404` when SSO isn't configured (`ssoEnabled` on `GET /api/v1/meta`) |
| GET | `/api/v1/auth/oidc/callback` | OIDC/SSO callback (`code`, `state` query params) — completes login exactly like `POST /api/v1/auth/login`, sets the same session cookie, then redirects (`302`) to the app. JIT-provisions a new account on first login for an unrecognized email; `401` on an invalid/expired `state` or ID token; `404` when SSO isn't configured |
| GET | `/api/v1/users/me` | The currently authenticated actor, as a user record |
| PATCH | `/api/v1/users/me` | Update the caller's own `displayName`, `avatarKey`, and/or `timezone` — self-service only, no target-user parameter |
| POST | `/api/v1/users/me/password` | Change the caller's own password (`currentPassword`, `newPassword`) — the current password is verified server-side. Revokes every session for the account, including the one making the request, and clears `mustChangePassword` (`add-change-own-password`) |
| POST | `/api/v1/users/me/avatar` | Upload a custom photo avatar (`multipart/form-data`, field `avatar`; JPEG/PNG/WebP, max 500KB) — server-side center-cropped and resized to 128×128, sets `avatarKey` to the reserved value `"custom"` |
| DELETE | `/api/v1/users/me/avatar` | Remove the caller's custom photo avatar, reverting to the generated default |
| GET | `/api/v1/users/{userId}/avatar` | The raw image bytes for a user's custom photo avatar (always JPEG), if they have one — cacheable via `ETag`/`Cache-Control` |
| GET | `/api/v1/users` | List users — [cursor-paginated](#cursor-pagination) |
| POST | `/api/v1/users` | Create a user (`email`, `password`, `isTenantAdmin`) — Tenant Admin only; `displayName` defaults to a name derived from the email's local-part (`jane.doe@x.com` → "Jane Doe") rather than staying unset |
| PATCH | `/api/v1/users/{userId}` | Change `isTenantAdmin`, `deactivate`/`reactivate`, the account's `email`, and/or `requirePasswordChange` — Tenant Admin only. A Tenant Admin can no longer set another account's password value directly (`add-change-own-password`); see the two endpoints below instead |
| POST | `/api/v1/users/{userId}/password-reset-email` | Trigger a password-reset email for a specific account — Tenant Admin only, only available when the instance has SMTP configured (`add-change-own-password`) |
| POST | `/api/v1/users/{userId}/generate-temporary-password` | Generate a random temporary password for an account — Tenant Admin only, the SMTP-less fallback (rejected if SMTP *is* configured — the reset-email endpoint is required then). Sets `mustChangePassword` and revokes every existing session in the same action; the raw value is returned once and never retrievable again (`add-change-own-password`) |
| GET | `/api/v1/tokens` | List API tokens — own tokens, or `?userId=` for another user's (Tenant Admin only) |
| POST | `/api/v1/tokens` | Create an API token (`name`, optional `projectId`+`roleId`) for an agent; the full value is returned once and never again |
| DELETE | `/api/v1/tokens/{tokenId}` | Revoke a token — its own creator, or a Tenant Admin |
| GET | `/api/v1/audit?entityType=&entityId=` | Audit history for a specific entity, oldest first |

**Teams** (`add-project-rbac`, Tenant Admin only throughout)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/teams` | List teams — [cursor-paginated](#cursor-pagination) |
| POST | `/api/v1/teams` | Create a team (`name`) |
| PATCH | `/api/v1/teams/{teamId}` | Rename a team |
| DELETE | `/api/v1/teams/{teamId}` | Delete a team — cascades its membership and project role assignments |
| GET | `/api/v1/teams/{teamId}/deletion-preview` | Real reference counts for the delete-team confirmation dialog — current member count and distinct projects it holds a role on (`add-team-deletion-preview`) |
| POST | `/api/v1/teams/{teamId}/members/{userId}` | Add a user to a team |
| DELETE | `/api/v1/teams/{teamId}/members/{userId}` | Remove a user from a team |

**Roles** (`add-project-rbac`, fully custom and instance-wide — design.md D10, Tenant Admin only throughout)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/roles` | List all roles — [cursor-paginated](#cursor-pagination), ordered by `rank` first |
| POST | `/api/v1/roles` | Create a role (`name`, `rank`, and the ten `can*` permission flags below) |
| PATCH | `/api/v1/roles/{roleId}` | Update a role's name, rank, or permission flags |
| DELETE | `/api/v1/roles/{roleId}` | Delete a role — cascades any project membership/team role assignment referencing it |
| GET | `/api/v1/roles/{roleId}/deletion-preview` | Real reference counts for the delete-role confirmation dialog — direct user assignments, team assignments, and distinct projects touched (`redesign-admin-shell`) |
| POST | `/api/v1/roles/reset` | Restore Tester/Contributor/Project Admin to their factory permission flags, in place — an existing one of the three keeps its `id` (so assignments referencing it stay valid), a missing one is recreated. Every other role, and every assignment, is untouched — not a wipe (design.md D12) |

Each role carries thirteen independent boolean flags (design.md D11 —
concrete, per-resource actions rather than a handful of broad ones):
`canRead`, `canCaseCreate`, `canCaseEdit`, `canCaseDelete`,
`canSectionCreate`, `canSectionEdit` (`add-library-folder-selection` —
moving/reparenting a section), `canSectionDelete`, `canSuiteCreate`,
`canSuiteEditMembership`, `canRunCreate`, `canRunRecordResult`,
`canManageProject`, plus `canRunDelete` and `canProjectDelete`
(`add-data-retention` D3 — kept independent of `canRunCreate`/
`canRunRecordResult` and `canManageProject` respectively, so a role that can
create or seal runs, or rename/archive a project, doesn't automatically
gain the power to permanently destroy one). `rank` is a display/sort order
only, never compared for authorization — see
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
audit log naming the acting actor — human, agent, or (`add-data-retention`
D8) `system` for an unattended background process such as the automatic
run-retention sweep — queryable per entity via `GET /api/v1/audit`. An
entry MAY carry an optional structured `detail`
object with action-specific before/after state — a case move records
`{from, to}` (folder ids), a case-version restore records
`{restoredFrom, newVersion}`; most actions carry no `detail` at all.

A fresh instance seeds one user as Tenant Admin from `TESTPULSE_ADMIN_EMAIL`
/ `TESTPULSE_ADMIN_PASSWORD` on first startup (skipped once any user exists
— see [Development](development.md)). If either is unset, `POST
/api/v1/setup` (unauthenticated, only available while the instance has zero
users) lets the first visitor create that account themselves instead
(`add-first-run-setup`) — `GET /api/v1/meta`'s `setupRequired` field
reports whether this is currently open.

A Tenant Admin sets the instance's color theme via `PATCH
/api/v1/instance-settings`' `colorTheme` field — one of `teal` (default),
`indigo`, `ocean`, `forest`, or `custom`. Setting `custom` additionally
requires `customPalette`, a `{light, dark}` object with 10 `#RRGGBB` hex
fields per mode (`background`, `foreground`, `card`, `primary`,
`primaryForeground`, `muted`, `mutedForeground`, `accent`, `border`,
`input`); every other visual token is derived from these. The active
theme applies instance-wide — to every authenticated user and anonymous
public-project visitor, not just the admin who set it — so `GET
/api/v1/meta` carries `colorTheme` (and `customPalette`, when active)
unauthenticated, the same reasoning `publicProjectsEnabled` is exposed
there for (`add-color-theme-customization`).

## Versioning policy

- `/api/v1` is unstable until v1.0 — breaking changes may occur between 0.x
  releases and are called out in release notes.
- The OpenAPI document version tracks the application version.
