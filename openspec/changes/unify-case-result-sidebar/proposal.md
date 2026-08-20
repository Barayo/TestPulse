## Why

As a tester, when I'm recording a result on a run item, I want to see the test
case's cross-run track record and jump straight to its canonical spec, so I
don't have to leave the run, find the case in the Library, and lose my place.
Today `RunItemDetailPage` has no link back to the case it's executing, and its
sidebar's "History" section only ever shows this one item's own verdict
log — which reads as "last status" rather than history when an item has been
executed once, and never surfaces the case's broader pass-rate trend the way
`CaseDetailPage`'s "Results" section already does.

## What Changes

- Add a "Test case" property row to `RunItemDetailPage`'s Properties section,
  linking to `/projects/{projectKey}/cases/{caseKey}` (same
  `ExternalLinkIcon` idiom `RunPage.tsx` already uses for "Go to case in
  Library").
- Promote `item.content`'s already-fetched classification data (priority,
  test type, automated, tags) into `RunItemDetailPage`'s Properties section,
  using the same pills/chips `CaseDetailPage` already renders — the data is
  already on the wire, just not shown.
- Extract `CaseDetailPage`'s private `toResultsData()` helper into a shared
  module so both pages can build `CaseResultsPanel` data the same way.
- Add a new "Results" sidebar section to `RunItemDetailPage`, reusing
  `CaseResultsPanel` against the same cross-run recent-executions endpoint
  `CaseDetailPage` already calls (`GET /api/v1/cases/{caseKey}/executions
  ?order=recent&limit=7`), keyed off `item.caseKey`.
- Rename `RunItemDetailPage`'s existing "History" section to "This run" —
  content is unchanged (the per-item verdict log), only the label changes to
  stop overclaiming scope.
- Reorder both pages' sidebars to the same shape: Properties → Results →
  \[Version history | This run\].
- Drop the redundant standalone "Status" property row on
  `RunItemDetailPage` (already shown via the header `StatusBadge`).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: viewing a run item now surfaces a link to its test case
  and a cross-run "Results" section, and the sidebar section order/naming is
  unified between the case detail and run item detail pages.

## Impact

- `apps/web/src/pages/RunItemDetailPage.tsx` — sidebar restructuring, new
  property row, new Results section, "This run" rename.
- `apps/web/src/pages/CaseDetailPage.tsx` — `toResultsData()` extraction,
  sidebar reorder for consistency (Properties → Results → Version history;
  already in this order, confirmed not changed).
- New shared module for `toResultsData()` (exact location decided in
  design.md).
- No API or schema changes — reuses the existing
  `/api/v1/cases/{caseKey}/executions` endpoint and `item.content`/
  `item.caseKey` fields already returned by the run item response.
- `docs/test-management.md` — update Results-section description for the run
  item page.
- `apps/api/internal/sampledata/seed.go` — no seed change expected (existing
  seed data already gives the flagship case multiple cross-run executions,
  which is what makes the new Results section demonstrably non-trivial on a
  run item too); confirmed/adjusted during implementation if needed.
