## Context

`RunPage.tsx` today is a two-column grid: item list (left) + a permanently
mounted detail pane (right) showing whichever item is selected, with
verdict-recording controls always present regardless of run status
(disabled implicitly by the 409 the API returns on a closed run, not by
hiding the controls). This is this app's only split-pane page —
`CaseDetailPage` and `FolderExplorerPage` both use single-window, routed
patterns instead. Reviewing the first dogfooding run also showed the page
has no visual summary beyond a plain-text status count string, and
discards `testName`/`platform`/`tags`/timing that JUnit imports already
attach to every item.

## Goals / Non-Goals

**Goals:**
- One consistent page pattern across the app: routed single-window pages
  with a content+sidebar layout, not a mix of split-panes and routed pages.
- A status breakdown visualization on `RunPage` covering all six
  statuses, using resolved (not ad hoc) chart-color assignments.
- Surface `testName`/`platform`/`tags`/timing that's already captured but
  currently invisible.

**Non-Goals:**
- No click-to-filter interaction on the status breakdown — noted as a
  natural fast-follow once this ships, not bundled in.
- No "created by" / audit-log surfacing on the run or its items.
- No semi-donut/gauge chart — the segmented bar is faster to build (no
  SVG), lower-risk, and still a real upgrade from plain text; revisit
  later if wanted.
- No backend/schema changes of any kind — **amended mid-implementation**:
  `RunItem` never exposed the pinned case's own key, only its internal
  `caseId`, so the planned `/runs/:runKey/items/:caseKey` route couldn't
  resolve an item without one. Added `caseKey` to `RunItem` (additive,
  `store.RunRepo.Items` already joins `test_cases` for `content`) rather
  than route by raw UUID, which would've been the only inconsistent URL
  shape in the app. See `tasks.md` §0.5.

## Decisions

- **Item identity in the new route is the case's own key**
  (`/runs/:runKey/items/:caseKey`), not a new run-item key. A case can
  only be added to a run once, so `caseKey` is already unique within a
  run and already exists — avoids any backend change to give run items
  their own key scheme.
- **The new page reuses `CaseDetailPage`'s exact visual pattern**: content
  area (steps, expected result, verdict controls when the run is open,
  read-only result history when closed) + sticky sidebar (status,
  testName, platform, tags, pinned version + "newer version" hint),
  breadcrumb ending at the run rather than repeating the item's own
  heading — directly applying `fix-case-detail-breadcrumb-duplication`'s
  same principle, not a new one.
- **Segmented bar, not a gauge**: extends `HealthBar.tsx`'s existing
  fill-a-rounded-track idiom (already proven, already themed) rather than
  introducing SVG arc rendering. Revisitable later without touching data
  plumbing — the visualization is a pure function of the same summary
  counts either way.
- **Color assignments for the 3 uncovered statuses**: `--chart-4`
  (currently unused, near-black) → `blocked`, `--chart-5` (currently
  unused, muted-gray) → `pending`, and `retest` gets a repeating diagonal
  gradient texture over its existing muted color rather than a new hue —
  per `docs/design-system.md`'s explicit rule against inventing chart
  hues one-off. This fixes the current bug where `blocked` is visually
  identical to `failed` (both reuse `--destructive`).
- **`RunPage` implemented on top of `fix-run-close-reopen-feedback`**,
  not in parallel — that change's `bumpDataRevision()`/immediate-status
  fix lives in the same file this change guts; sequencing avoids
  reconciling two in-flight edits to the same functions.

## Risks / Trade-offs

- [Risk] Splitting the board into two pages (list, then item) adds a
  navigation round-trip per item compared to the current in-place pane,
  which could slow down rapid sequential execution (recording verdicts on
  many items in a row) → Mitigation: this is exactly the trade-off
  `CaseDetailPage`'s own precedent already made (drawer → routed page) and
  accepted; a "next item" affordance on the item page is a reasonable
  fast-follow if this proves painful in practice, not a blocker to
  shipping.
