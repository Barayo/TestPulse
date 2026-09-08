## Context

Eight list endpoints currently return their full, unbounded result set on
every request: `GET /projects/{projectKey}/runs`, `GET /runs/{runKey}/items`,
`GET /users`, `GET /teams`, `GET /roles`, `GET /projects/{projectKey}/cases`,
`GET /projects/{projectKey}/folders`, and `GET /projects/{projectKey}/suites`.
Run history and run items grow with every execution over a project's
lifetime; the other six grow with instance/project headcount and content.
None are paginated today. `GET /audit` was considered but excluded — it
already takes `entityType`/`entityId` query params (added alongside issue
#160's fix), so a single request is bounded by that entity's own edit
history, not an unbounded global feed. `GET /projects` and
`GET /projects/summaries` were also excluded: `ProjectsPage` does
client-side search/sort/filter over the full in-memory list today, and
paginating would force that server-side — a materially bigger change the
originating issue (#29) itself flagged as out of scope for this pass.

Every internal (non-HTTP) caller of the affected store methods was audited
before deciding the store-layer approach:
- `Service.HasAnyUser` (`identity.go:165`) and `Service.BootstrapAdmin`
  (`identity.go:281`) call `store.Users.List` to check whether any user
  exists yet, ahead of the setup wizard.
- `Service.ResetRolesToDefaults` (`project_rbac.go:222`) calls
  `store.Roles.List` to find the three seeded roles by name.
- Run comparison (`service.go:1329`/`1333`) calls `store.Runs.Items` for
  both runs' complete item sets.

All four need the full set and must not be forced through pagination.

## Goals / Non-Goals

**Goals:**
- Bound the response size and query cost of the eight listed endpoints
  regardless of how large the underlying table grows.
- One consistent pagination contract (envelope, cursor semantics, limit
  handling) across all eight, so the web app and MCP tools need only one
  client-side pattern.
- Zero behavior change for internal, non-HTTP callers that need a
  complete, unbounded result set.

**Non-Goals:**
- Paginating `GET /audit`, `GET /projects`, or `GET /projects/summaries`
  (see Context for why each is excluded).
- Offset/limit or page-number UX (e.g. "page 3 of 12") — cursor pagination
  only supports forward "load more", matching what every affected UI does
  today anyway.
- Changing MCP's `search`/`list_projects` pagination gap (tracked
  separately as #149).
- Any database schema change — `created_at`/`id` already exist on every
  affected table.

## Decisions

### Cursor pagination, not offset/limit
Every affected list is either genuinely append-only and time-ordered (run
history, run items) or, while technically mutable, still benefits from a
single consistent client-side pattern (users, teams, roles, cases, folders,
suites) rather than maintaining two pagination shapes. Cursor pagination
stays correct under concurrent inserts — offset/limit drifts (a row
inserted between two page fetches shifts every subsequent offset, causing
skipped or duplicated rows), which matters most for run items on an
actively-executing run. None of the affected UIs need numbered-page
jump-to-N today; every one is a scroll-and-load-more list.

**Alternative considered**: offset/limit for the six non-run-history
entities (bounded, more "browse a roster" in feel), cursor for runs/items.
Rejected — two envelope shapes and two client-side pagination components
for a marginal UX gain no current page actually uses.

### Cursor shape: opaque base64 token over `(created_at, id)`
Every affected table already has both columns. Encoding both (not just
`created_at`) makes the cursor stable under a `created_at` tie — two rows
inserted in the same millisecond still get a deterministic, gap-free
ordering via the `id` tiebreak. The cursor is base64-encoded JSON
(`{"createdAt": "...", "id": "..."}`) and treated as fully opaque by every
client: never constructed by hand, only ever replayed from a prior
response's `nextCursor`.

### Response envelope: breaking change, applied uniformly
`{ items: T[], nextCursor: string | null }` for all eight endpoints,
immediately, with no bare-array fallback. The only real consumers today
are the web app and MCP tools, both updated in this same change — there
are no external API customers yet to protect with a transition period, and
a permanent dual-shape (bare array vs. wrapped, depending on whether a
client opted in) would be a standing footgun for every future consumer.

### Sort order: preserve each entity's existing order, don't impose a new one
The original plan was `created_at DESC` (newest first) uniformly. Checking
every affected entity's current `List`/`Items` query before implementing
(task 2.1's audit habit, applied to every entity in turn) found this
assumption was backwards for all but one: only `RunRepo.List` actually
orders `created_at DESC` today. `RunRepo.Items` (run items), `UserRepo.
List`, `TeamRepo.List`, `RoleRepo.List` (`rank, created_at`), `CaseRepo.
List`, `FolderRepo.List`, and `SuiteRepo.List` are all `created_at ASC` —
insertion order.

Rather than impose a new "newest first" order onto six different existing
UI lists as an unannounced side effect of adding pagination, every `*Page`
method preserves its sibling's existing order, with `id` (ASC or DESC to
match) added purely as the tiebreak cursor pagination needs for
determinism. Only `RunListPage` is `created_at DESC, id DESC`; every other
`*Page` method is `created_at ASC, id ASC` (`RoleListPage`: `rank ASC,
created_at ASC, id ASC`, preserving the tier ordering `List` already
guarantees). Run items' insertion order remains additionally load-bearing
for the execution board's j/k keyboard navigation, as originally noted —
it's just no longer the only entity keeping ASC.

### Store layer: additive `ListPage`/`ItemsPage`, existing methods untouched
Per the Context audit, four internal call sites need the complete,
unbounded set. Rather than force them through a cursor loop or add a
sentinel "no pagination" mode to the existing methods, each affected repo
gets a new sibling method used only by the HTTP paths backing these eight
endpoints:
```go
func (r *CaseRepo) ListPage(ctx context.Context, projectID, cursor string, limit int) (items []domain.TestCase, nextCursor string, err error)
```
(and equivalently for `FolderRepo`, `SuiteRepo`, `RunRepo.ListPage`,
`RunRepo.ItemsPage`, `UserRepo`, `TeamRepo`, `RoleRepo`). The existing
`List`/`Items` methods keep their current signature and behavior
unchanged — zero blast radius on `HasAnyUser`, `BootstrapAdmin`,
`ResetRolesToDefaults`, or run comparison.

### `limit`: default 50, max 200, clamped not rejected
A client requesting `limit=999999` gets 200 back rather than a 400 —
matches how `defaultMaxBodyBytes` and other existing bounds in this
codebase silently cap rather than error on an oversized request, and
avoids a client integration bug turning into a hard failure instead of a
degraded-but-working response.

### Public (unauthenticated) routes inherit pagination for free — and for real
`apps/api/internal/server/public_handlers.go` mounts the *same* handler
functions (`listCases`, `listRuns`, `listRunItems`; not yet `listFolders`/
`listSuites`, covered in their own task groups) under
`/api/v1/public/projects/{projectKey}/...` as the authenticated routes use.
This wasn't part of the original plan, but it's not optional either — the
handler is genuinely shared code, so `GET /api/v1/public/projects/{key}/
cases` started returning the new `{ items, nextCursor }` envelope the
moment `listCases` was wired, whether or not anything documented it.
`packages/shared/openapi.yaml`'s public path entries were updated to match
actual behavior (new response schema + cursor/limit params, `operationId`
summaries noting the shared handler) in the same tasks as their
authenticated counterparts, and the one existing public-route test
asserting the old bare-array shape (`TestPublicProject_
UnauthenticatedReadsSucceedWhenPublic`) was fixed alongside it.

## Risks / Trade-offs

- **[Risk]** Eight endpoints changing response shape simultaneously is a
  coordinated breaking change — every caller (web app pages, MCP tool
  handlers, docs examples) must update together or the build breaks.
  **Mitigation**: `packages/shared/openapi.yaml` + `make generate` make
  every TypeScript call site a compile error until updated; CI already
  fails on contract drift, so no caller can silently miss the change.
- **[Risk]** A client that stores a cursor and replays it much later,
  after the referenced row was deleted, gets an ordering position with a
  gap where that row was — expected and correct for cursor pagination, but
  worth noting isn't the same guarantee offset/limit gives (which would
  silently skip or duplicate a *different* row instead).
  **Mitigation**: none needed — this is standard, correct cursor-pagination
  behavior, not a defect.
- **[Trade-off]** No jump-to-page-N UX becomes possible later without a
  parallel offset/limit path. Accepted: no current page has that UX today,
  and adding it later (if ever needed) is additive, not a rework of this
  design.

## Migration Plan

No data migration — pagination is computed from existing columns. Rollout
is a single coordinated change (API, web, MCP, docs, sample data) rather
than a phased one, per the "breaking change, applied uniformly" decision
above. Rollback is a normal revert of this change's commit(s); no forward-
only state is created (no new columns, no new tables).

## Open Questions

None outstanding — all decisions above were made and approved during
brainstorming before this document was written.
