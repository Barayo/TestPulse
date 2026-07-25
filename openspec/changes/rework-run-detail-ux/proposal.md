## Why

A run's own detail page (`/runs/{runKey}`) has zero UI surface for which suite (if
any) it was created from, even though that link has been in the API since
`link-runs-to-suite` (`Run.suiteKey`, already shipped). The user flagged this directly
("I can't see the run/suite link on fly.io"). Separately, the page's only tool for
triaging a run's results is scrolling a flat list — no way to jump straight to what's
still failing. A Pepe/Fable-5 design pass validated via an interactive mockup (approved
by the user) is the basis for this change.

## What Changes

- The run header shows "From suite: {name}" linking to that suite (once
  `rework-suites-landing-ux` ships its real suite route), or "Ad hoc run — not
  created from a suite" when `suiteKey` is null, so the absence reads as a
  deliberate state rather than a bug.
- The header also shows a compact "Created {date}" line alongside the suite link.
- Single-select status filter chips above the item list (mirroring the existing
  `RunStatusBreakdown` legend's vocabulary and colors) narrow the list to one
  status at a time for triage; a "Showing N of M items" line reflects the active
  filter.
- An optional "Group by status" toggle reorders the full list into status
  sections (pass, failed, blocked, skipped, retest, pending — the same
  bad-outcomes-first order already used by `RunStatusBreakdown`), composable
  with the filter.
- The existing `RunStatusBreakdown` segmented bar chart is unchanged — already
  good, already matches this design language.
- Item rows are visually unchanged otherwise (no classification badges added —
  deliberate: this page's job is execution-state triage, not case browsing;
  adding priority/platform/tag pills here would compete with the status signal
  for attention).
- No bulk actions or keyboard shortcuts — those are separately tracked (#82,
  #83) and out of scope here, to avoid duplicating that future work.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `test-execution`: "Run execution board" gains suite-linkage display and
  status filter/group-by-status scenarios.

## Impact

- `apps/web/src/pages/RunPage.tsx` — header meta row, filter chips, grouping
  toggle, filtered/grouped item-list rendering. No change to
  `RunItemDetailPage.tsx` (separately scoped, already reworked).
- No backend change — `Run.suiteKey` already exists end-to-end
  (`link-runs-to-suite`); this is a pure frontend surfacing of existing data.
- Depends on `rework-suites-landing-ux` for the suite link's real target route
  (`/projects/{projectKey}/suites/{suiteKey}`); if this change ships first, the
  link should still work by falling back to the suites index with the suite
  pre-searched/selected, not a broken link — resolve exact fallback in design.md.
- `docs/test-management.md` — update the run detail page description.
- `apps/web/e2e/ui-navigation.spec.ts` or `test-execution` e2e specs — new
  scenarios for the suite link and the status filter.
