## Context

`RunPage.tsx` is a single `Card`: header (name, open/closed badge, close/reopen
button, `RunStatusBreakdown`) plus a flat `<ul>` of every item, each row title + small
metadata line + `StatusBadge`. `Run.suiteKey` (nullable) has been available from
`GET /runs/{runKey}` since `link-runs-to-suite` shipped, but nothing in the UI reads
it. Research into GitHub Actions, CircleCI, TestRail, and Xray (this session) confirms
a persistent failed-item filter above the list is close to universal on this class of
page, and that source/trigger metadata is always shown inline in the header, never
omitted. A Pepe/Fable-5 mockup (`mockup.html`, this directory), user-approved, is the
visual/interaction source of truth.

## Goals / Non-Goals

**Goals:**
- Surface `run.suiteKey` as a real, clickable link (or an explicit ad-hoc state)
  in the header.
- A status filter that actually serves the page's primary task — triage.
- An optional grouping view for a full worst-first pass over a long run.

**Non-Goals:**
- No bulk actions (multi-select verdict recording) or keyboard shortcuts —
  already separately tracked as #82/#83; adding either here would duplicate
  that scoped future work.
- No classification badges (priority/platform/tag pills) on item rows — this
  page's job is scanning execution state, not browsing case metadata; that
  richness belongs on Library/Suites pages, not repeated here.
- No change to `RunItemDetailPage.tsx` (`/runs/:runKey/items/:caseKey`) —
  already reworked by `redesign-run-execution-view`, out of scope.
- No change to close/reopen lifecycle mechanics.

## Decisions

- **Suite link target depends on `rework-suites-landing-ux`'s new route.** If
  this change ships before that one, the link SHALL still work: point it at the
  suites index with the suite name as searchable/visible context (e.g.
  `/projects/{projectKey}/suites`) rather than a route that doesn't exist yet,
  and update it to the real `/projects/{projectKey}/suites/{suiteKey}` route
  once that change ships (tracked as a follow-up task in both changes). This
  avoids a hard sequencing dependency while still avoiding a broken link.
- **No classification badges on item rows** — deliberate, per Pepe's mockup
  rationale: `SuiteCaseGrid`'s pill vocabulary is for authoring/browsing
  contexts (Library, Suites), where the reader's job is "which case is this."
  Here the reader's job is "what's still broken" — `StatusBadge` should be the
  only thing competing for attention on a row.
- **Filter and grouping are both kept, not one-or-the-other.** The filter
  narrows to act on one status and clear it (zoom-in triage); grouping
  reorders the full list without hiding anything (a full worst-first read).
  They compose: with a filter active, grouping just collapses to a single
  section, so there's no conflict to resolve.
- **No "created by" field** — the `Run` schema has no `createdBy`; showing one
  would fabricate data that doesn't exist. Only `createdAt` (already present)
  is shown.

## Risks / Trade-offs

- [Suite-link route depends on a sibling change (`rework-suites-landing-ux`)
  that may ship in a different order] → Mitigated by the index-fallback
  decision above; neither change blocks the other.
- [Status filter chips + grouping toggle add UI surface to a page that's meant
  to stay simple] → Both reuse `RunStatusBreakdown`'s existing color/label/order
  vocabulary, so they read as an extension of what's already there rather than
  a new sub-language.

## Migration Plan

Pure frontend change, no schema/API impact. Ships as a regular deploy.
