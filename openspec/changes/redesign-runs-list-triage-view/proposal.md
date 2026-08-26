## Why

As a tester scanning a project's Runs list, when several runs share the
same name (a common pattern for ad hoc or CI-imported runs — four
different runs might all be literally named "Smoke run"), I want them
visually distinguishable and want whichever run most needs attention to
stand out, so I don't have to open every row or read a barely-visible 4px
health sliver just to know where to look first (issue #139).

## What Changes

- **Open runs** render as cards ordered by urgency (ascending pass rate,
  not creation order) instead of a flat list ordered by recency. The
  run needing the most attention gets a large `HealthRing` and an explicit
  `StatusPill` ("At risk"/"Healthy"/"In progress"); the remaining open runs
  taper down in ring size as health improves, down to `HealthRing`'s
  existing default size for the healthiest run.
- **Closed runs** are grouped into suite clusters (e.g. "Smoke · 4 runs ·
  avg 62% pass rate") inside the existing dense, recessed ledger, instead
  of one flat list — this is what actually resolves the identical-name
  problem, by clustering same-origin runs with an aggregate rather than
  relying on a timestamp to tell them apart. Runs with no suite land in an
  "Ad hoc" cluster.
- `RunsPage.tsx` additionally fetches the project's suites
  (`GET /projects/{projectKey}/suites`, already exists) to join
  `run.suiteKey` client-side — no backend/API changes.
- A run whose `suiteKey` no longer resolves to a live suite (the suite was
  since deleted) falls back to plain, icon-less cluster text, mirroring the
  existing fallback `RunPage.tsx` already uses for the same case.
- An open run with `passRate === null` ("not run yet") sorts to the front
  of the ascending-urgency order (undiagnosed is at least as urgent as a
  low score) and renders a dashed/empty ring, matching `HealthRing`'s
  existing `rate === null` treatment.
- The existing `SECTION_CAP`/"Show N more" expand behavior for a long
  Closed list is preserved, restyled to fit the new clustered ledger.

Design validated via three rounds of Pepe/Fable-5 mockups; final approved
direction: https://claude.ai/code/artifact/69f396fc-c67f-4f0a-951e-d1df1ee8e6e6

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `test-execution`: adds a new "Project runs list" requirement (this page
  currently has no dedicated spec requirement at all — only the
  single-run "Run summary" and "Run execution board" exist today).

## Impact

- **Frontend only**: `apps/web/src/pages/RunsPage.tsx` (fetch suites,
  build clusters), `apps/web/src/components/RunList.tsx` (replace the flat
  row-list rendering with the hero/tapering card layout for Open and the
  clustered ledger for Closed), `apps/web/src/components/HealthBar.tsx`
  (parameterize `HealthRing`'s size for the hero vs. tapering-card sizes).
- No database, API, or OpenAPI changes.
- **Docs**: `docs/test-management.md`'s Runs list description needs
  updating to match the new layout.
- **Sample Project**: existing seed data (Sample Project's Smoke/Release
  suites, multiple ad hoc "Smoke run" runs) already exercises every branch
  of this redesign (duplicate names, mixed suite/ad hoc origin, a range of
  pass rates) — no `seed.go` changes needed, this is a pure display change
  over already-representative data.
