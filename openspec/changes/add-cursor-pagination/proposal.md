## Why

As an operator running TestPulse against a project with a long execution
history, when I list runs, run items, or any of six other project/instance
lists, I want the server to return a bounded page instead of every row ever
created, so response size and query cost stay flat as the data grows
instead of growing forever (issue #29). Run history and run items grow
with every execution over a project's lifetime; Luis's broad security/
quality audit (2026-09-07) additionally found that every other project- and
instance-scoped list endpoint (users, teams, roles, cases, folders, suites)
shares the same unbounded shape. Not an active production problem yet
(project counts stay small today), but worth fixing before it becomes one.

## What Changes

- **BREAKING**: `GET /projects/{projectKey}/runs`, `GET /runs/{runKey}/items`,
  `GET /users`, `GET /teams`, `GET /roles`,
  `GET /projects/{projectKey}/cases`, `GET /projects/{projectKey}/folders`,
  and `GET /projects/{projectKey}/suites` now always return
  `{ items, nextCursor }` instead of a bare array. No dual-shape and no
  backward-compatible fallback — the only real consumers pre-1.0 (the web
  app and MCP tools) are updated in this same change.
- Add optional `cursor` and `limit` query params to all eight endpoints.
  `limit` defaults to 50 and is clamped (not rejected) to a max of 200.
  Pages are ordered `created_at DESC` with `id` as a tiebreaker, encoded
  into an opaque, client-replayable cursor token.
- Add new, additive `ListPage`/`ItemsPage`-style store methods used only by
  these eight HTTP paths. The existing unbounded `List`/`Items` methods are
  untouched, since several internal callers genuinely need the full set:
  the setup wizard's existence checks (`HasAnyUser`, `BootstrapAdmin`),
  `ResetRolesToDefaults` (finds seeded roles by name), and run comparison
  (needs both runs' complete item sets).
- Each affected web UI list gets a real "Load more" control backed by
  server pagination, replacing `PeoplePage.tsx`'s existing client-side
  reveal-batching workaround (`MEMBER_BATCH_SIZE`/`USER_BATCH_SIZE`, which
  today fetches everything up front and only paces the *rendering*).
- `docs/` gains a pagination-convention section covering the envelope
  shape, cursor opacity, and limit defaults/max.
- The Sample Project seed grows one entity past the 50-item default page
  size so "Load more" is genuinely demonstrated, not just theoretical.

**Explicitly out of scope** (and why):
- `GET /audit` — already scoped per-entity via `entityType`/`entityId`
  query params (added alongside issue #160's fix), so a single request is
  naturally bounded by that entity's edit history, not the unbounded
  global dump the original issue assumed.
- `GET /projects` and `GET /projects/summaries` — the issue itself flags
  this as a bigger, separate change: `ProjectsPage` currently does
  client-side search/sort/filter over the full in-memory list, and
  paginating would force that server-side.
- MCP's `search`/`list_projects` pagination gap — already tracked
  separately as backlog issue #149.

## Capabilities

### New Capabilities
- `list-pagination`: the cross-cutting cursor-pagination contract (envelope
  shape, cursor semantics, limit defaults/clamping, ordering) applied
  uniformly across the eight endpoints listed above.

### Modified Capabilities
(none — the affected endpoints' existing behavioral requirements are
unchanged; only their response shape and the addition of pagination
controls are new, captured entirely by the new capability above)

## Impact

- **API**: `packages/shared/openapi.yaml` gains eight new `{ items,
  nextCursor }` response schemas and `cursor`/`limit` query params on the
  eight affected endpoints; `make generate` regenerates the TS client
  types (CI already fails on drift).
- **Backend**: `apps/api/internal/store/{cases,folders,suites,runs,users,
  teams,roles}.go` gain new paginated methods; the corresponding
  `apps/api/internal/service/*.go` methods backing these eight REST routes
  switch to them; `apps/api/internal/server/handlers.go` gains
  cursor/limit query-param parsing and clamping.
- **Frontend**: `apps/web/src/pages/{RunsPage,RunPage,PeoplePage,
  RolesPage,LibraryPage}.tsx` (or their equivalents) gain "Load more" UI,
  replacing `PeoplePage.tsx`'s client-side batching constants.
- **Docs**: a new pagination-convention section; the affected endpoints'
  existing docs pages reference it.
- **Sample data**: `apps/api/internal/sampledata/seed.go` and
  `seed_test.go` grow one entity past the default page size.
- No database schema change — pagination is computed from existing
  `created_at`/`id` columns already present on every affected table.
