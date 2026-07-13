## Why

`apps/web`'s project list and switcher (`ProjectsPage`, `ProjectSwitcher`) each
compute a per-project summary — suite count, case count, latest-run pass rate —
by fetching `/suites`, `/cases`, `/runs` (and one more call for the latest
run's summary) **per project**, client-side. With N projects that's 3-4×N HTTP
requests fired on every visit to `/` or every switcher open, with no server
aggregation possible in between.

This was already a live incident during the `redesign-ui` change: with 183
projects accumulated in a dev database from repeated E2E runs, this pattern
produced 900+ simultaneous requests, saturated the browser's per-origin
connection limit, and starved whatever page the user navigated to next —
manifesting as a reported bug where clicking a project from the list left its
own landing page's Suites/Runs panels empty. A client-side mitigation
(request cancellation on unmount + a capped concurrency pool) shipped as part
of `redesign-ui` and fixes that specific symptom, but the request count still
grows linearly and unbounded with project count — the underlying scaling
problem remains for any real account with dozens of projects and daily runs.

## What Changes

- Add a single batched endpoint that returns suite count, case count, and
  latest-run pass rate for every project in one request, replacing N×(3-4)
  client-side requests with 1.
- Update `apps/web`'s `useProjectSummaries` (and, if it still applies at that
  point, `useProjectLanding`'s per-run pass-rate lookups) to consume the new
  endpoint instead of fetching and computing stats client-side per project.

## Capabilities

### New Capabilities
- `project-stats`: server-side aggregation of per-project suite/case counts
  and latest-run pass rate, exposed as a single batched read endpoint.

### Modified Capabilities
(none — this adds a new read-only aggregation surface; it does not change
how projects, suites, cases, or runs are created, listed, or organized)

## Impact

- `packages/shared/openapi.yaml`: new `GET /api/v1/projects/summaries` (or
  similar) operation + response schema — contract-first, per CLAUDE.md.
- `apps/api/internal/{domain,store,service,server}`: new aggregation query
  and handler. Should be a single query (or small fixed number of queries)
  against existing tables — no new persisted data, no migration.
- `apps/web/src/lib/useProjectSummaries.ts` (and possibly
  `useProjectLanding.ts`): replace the per-project fetch-and-compute loop
  with one call to the new endpoint.
- No changes to project/suite/case/run creation, listing, or the folder
  explorer — this is additive, read-only aggregation only.
