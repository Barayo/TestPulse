## Context

`apps/web`'s `useProjectSummaries` hook (`ProjectsPage`, `ProjectSwitcher`)
and `useProjectLanding` (`ProjectPage`'s landing) each compute suite/case
counts and pass rates by calling existing per-project list endpoints
(`GET /projects/{id}/suites`, `/cases`, `/runs`, `/runs/{runId}/summary`)
directly from the browser, once per project. There is no existing
aggregation endpoint — every "how many suites/cases does this project have,
and how did its last run go" answer is computed by fetching full lists and
counting client-side.

This was fine for the toy datasets used during `redesign-ui`'s development,
but broke down once E2E test runs accumulated 183 real projects in the
shared dev database: opening the project list or switcher fired 900+
requests, saturated the browser's connection limit, and starved whatever
page the user navigated to next. A client-side mitigation already shipped
(bounded concurrency + request cancellation on unmount), but the request
count is still `O(N)` in project count with no cap — it degrades linearly
forever as an account accumulates projects, which a real team of ~20 people
running daily test cycles will do.

`Suite`, `TestCase`, `Run`, and `RunItem` (see `apps/api/internal/domain`)
already carry everything needed to compute these numbers server-side in a
handful of aggregate SQL queries, instead of N sets of list-and-count
round trips.

## Goals / Non-Goals

**Goals:**
- One request from the client returns suite count, case count, and latest-run
  pass rate for every project the caller can see.
- Server-side cost stays `O(1)` in the number of HTTP round trips regardless
  of project count — a small, fixed number of aggregate queries, not one
  query (or more) per project.
- Drop-in replacement for the web client: `useProjectSummaries` and
  `useProjectLanding`'s equivalent per-project stat computation switch to
  consuming this endpoint instead of raw list endpoints, with no behavior
  change visible to the user (same numbers, same UI).

**Non-Goals:**
- Pagination of the summaries endpoint. v0.1 has no defined upper bound on
  project count yet, and adding pagination now would be speculative; revisit
  if real deployments show this endpoint's own response size becoming a
  problem (a very different scale than the current bug).
- Real-time/streaming updates — the existing `dataRevision` client-side
  cache-bust-on-mutation pattern stays as-is; this change only replaces how
  the data is *fetched*, not when.
- Changing what a project/suite/case/run *is* or how they're created,
  listed, or organized — this is a read-only aggregation addition.
- Folder/case-count-per-folder aggregation for the landing page's Folders
  panel — that one is a recursive, folder-tree-shaped computation already
  scoped to a single already-open project (not the N-projects-at-once
  problem this change targets) and is out of scope here.

## Decisions

**Endpoint shape**: `GET /api/v1/projects/summaries` returning an array of
`{ projectId, suiteCount, caseCount, passRate }`, one entry per
non-archived project, ordered the same as `GET /api/v1/projects`.
Alternative considered: nest the summary under each project in a single
richer `GET /api/v1/projects` response instead of a separate endpoint.
Rejected — `GET /api/v1/projects` is also used where only names/ids are
needed and is cheap today; keeping the aggregate as a separate, explicitly
opt-in call avoids paying the aggregation cost on every caller of the
plain list endpoint.

**Aggregation strategy**: implement as 2-3 grouped SQL queries in the store
layer (e.g. `SELECT project_id, count(*) FROM suites GROUP BY project_id`,
same for cases, and a `DISTINCT ON (project_id) ... ORDER BY project_id,
created_at DESC` for each project's latest run joined against its
`run_items` for the pass count), merged in the service layer keyed by
project ID. Alternative considered: one giant SQL query with CTEs doing all
three joins at once. Rejected for now — three simple, independently
readable queries are easier to verify against the existing store patterns
in this codebase (see `apps/api/internal/store`) than one complex CTE, and
the win over N×4 requests is already achieved at 3 fixed queries; further
collapsing them is a micro-optimization not worth the readability cost.

**Contract-first**: new operation + response schema added to
`packages/shared/openapi.yaml` alongside the new Go handler, per CLAUDE.md's
contract-first workflow — `make generate` regenerates both the Go server
interface and the web `openapi-fetch` types from it.

## Risks / Trade-offs

- [Risk] The three grouped queries still touch every suite/case/run-item row
  for **all** projects on every summaries call, so cost still grows with
  total data volume, just no longer with request *count*. → Mitigation:
  acceptable for v0.1's stated scale; if this becomes a real bottleneck,
  the fix is indexing/materialization, not more requests — tracked as a
  future concern, not blocking this change.
- [Risk] Client migration touches two hooks (`useProjectSummaries`,
  `useProjectLanding`) that were just modified in `redesign-ui` for the
  connection-starvation mitigation. → Mitigation: keep that mitigation's
  cancellation behavior; this change only replaces *what* is fetched
  (one endpoint instead of N), not the existing abort/cleanup wiring.

## Migration Plan

Purely additive on the backend (new endpoint, no schema/migration changes —
counts and pass rates are computed from existing tables). On the client,
swap the hooks' internals in the same change; no intermediate dual-write
state needed since nothing else depends on the old per-project fetch shape.
No rollback complexity beyond reverting the change.
