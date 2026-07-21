## Context

Test case detail is currently `CaseDrawer` (`apps/web/src/components/CaseDrawer.tsx`), a
single component handling both case creation (`mode="create"`) and viewing/editing an existing
case (`mode="view"`), rendered as a fixed 420px slide-over from `FolderExplorerPage.tsx`. A
design exploration (three mocked layout options, compared against TestPulse's real tokens —
see the published artifact from that session) settled on "Option A": title+steps as full-width
primary content, a persistent properties/results/history sidebar on desktop that collapses to
stacked accordions on mobile. This design turns that decision into an implementation plan.

This intentionally moves test case detail from `ROADMAP.md`'s v0.1 "thin everywhere except the
run execution board" tier into a more polished treatment — recorded there as a conscious
pull-forward, not a silent scope drift.

## Goals / Non-Goals

**Goals:**
- Case detail (`mode="view"`) becomes a real page at its own route, not a modal overlay —
  full desktop width, native browser back button, shareable/bookmarkable URL.
- One layout, one component tree for desktop and mobile — the sidebar-to-accordion collapse is
  a responsive transform of the same content and order, never a second implementation.
- Every scalar case property renders through one reusable property-row component
  (`Label: value`), replacing the current badge/prose/bare-text mix. Badges are reserved for
  priority only.
- The Results section ships with its final chrome (label, placeholder chart shape, empty-state
  copy) so `add-case-result-history` only has to supply data, not restructure layout.
- Case creation (`mode="create"`) is untouched — still a drawer, still triggered from the
  library content list.

**Non-Goals:**
- Fetching or wiring real result-history data. `CaseDetailPage` still passes `CaseResultsPanel`
  no data — the Results section ships as the empty state, same as originally scoped.
  `add-case-result-history` still owns the actual fetch and wiring. (Revised from the original
  plan below: `CaseResultsPanel`'s populated-state renderer was built and tested during this
  change, at the user's explicit request, to review the chart implementation live before
  `add-case-result-history` exists — see design.md "Populated Results renderer" decision below.
  It just isn't called with real data yet.)
- Timing/duration display anywhere. No duration field exists in the domain yet (confirmed
  during exploration) — out of scope for both this change and its immediate follow-up.
- Changing the two-pane library browsing view (`FolderExplorerPage.tsx`'s tree + content list).
  Case detail is reached *from* that view via navigation, not folded into a third pane.
- A general component-library refactor. The property-row component is introduced where it's
  needed (case detail) and documented for reuse; retrofitting it onto other existing screens is
  future work, not this change.

## Decisions

**Route: `/projects/:projectId/cases/:caseId`, not nested under `/library/:folderId`.**
A case's ID alone is enough to resolve its title, content, and breadcrumb path server-side —
mirrors how `/runs/:runId` is already independent of project nesting rather than
`/projects/:projectId/runs/:runId`. Embedding the current folder path in the URL was considered
and rejected: a case can be reached from search or a suite drawer as well as the folder tree, so
"the folder path that got you here" isn't a stable part of the case's identity.

**`mode="view"` moves to a new `CaseDetailPage.tsx`; `CaseDrawer.tsx` keeps only `mode="create"`.**
The two modes currently share one component and a lot of conditional rendering
(`mode === 'view' && !isEditing`, etc.). Splitting them removes that branching entirely rather
than adding a third layout-driven branch on top of it. `ClassificationEditor` and `StepEditor`
(currently private to `CaseDrawer.tsx`) move to their own files so both the create drawer and
the new detail page's edit mode can import them unchanged — same edit UI, two different hosting
shells.

**Sidebar sections are one component, rendered once; desktop/mobile differ only in whether
they're wrapped in a native `<details>`.**
A `CaseSidebarSection` component takes a title and children. A `useMediaQuery('(min-width:
768px)')` hook (new, small, testable by mocking `matchMedia`) decides the wrapper — shared with
the sibling change `polish-library-page`, which needs the same 768px breakpoint decision for its
tree-pane/content-list split. Whichever change lands first creates `lib/useMediaQuery.ts`; the
other reuses it rather than adding a second matchMedia hook next to the existing `useIsMobile`
(640px, a different concern — phone-density for `ProjectsPage`'s card grid, not this). Desktop
renders the section as an always-visible `<div>`; mobile renders the identical children inside
a `<details>` so it's independently expandable. Considered pure-CSS approaches (e.g. hiding/
showing via media queries with two parallel markup trees) and rejected them — CSS can't drive
native `<details open>` state per breakpoint, and duplicating markup for mobile vs. desktop is
exactly the "separate mobile design" the proposal explicitly rules out.

**Property row is a new shared component (`components/PropertyRow.tsx`), not a per-page
one-off.** Two-column layout (label / value), label styled with the existing `.tp-label`
utility class already used for breadcrumbs elsewhere — this change is the first *component*
form of a pattern that previously only existed as a CSS utility. Priority stays a `Badge`;
every other scalar property passes through `PropertyRow` as plain text.

**`docs/design-system.md` documents the pattern, it doesn't enforce it.** No lint rule or type
constraint stops a future page from reaching for a bare `<Badge>` again — this change's scope
is establishing and demonstrating the pattern, not tooling to enforce it. Worth revisiting if
drift shows up in review.

**`CaseResultsPanel` grew a populated-state renderer, still unused in production.** Requested
mid-change, to review the chart implementation before `add-case-result-history` exists to feed
it real data. Took an optional `data?: CaseResultsData` prop — additive, backward-compatible,
falls back to the existing empty state when omitted (as `CaseDetailPage` still does). Verdict
renders as a uniform-height colored bar, not a variable-height one: a verdict is a discrete
status, not a magnitude, and varying bar height would imply a value difference between runs that
isn't there. Reuses the app's existing `--chart-1/2/3` status colors; identity is never
color-alone (every bar has a text tooltip, a legend and a plain-text breakdown are always
visible). This is real, tested groundwork for `add-case-result-history`, not speculative code —
that change should extend this renderer rather than replace it.

## Risks / Trade-offs

[Existing e2e/component tests assert on `CaseDrawer`'s `role="dialog"` view-mode rendering
(`apps/web/e2e/ui-navigation.spec.ts`, `apps/web/e2e/test-authoring.spec.ts`,
`CaseDrawer.test.tsx`)] → these need updating as part of this change, not left broken; task list
calls this out explicitly rather than folding it into "general test updates."

[Splitting `CaseDrawer` risks the create-mode drawer and the new detail page's edit mode
silently drifting apart over time, since they're now two host components sharing extracted
pieces instead of one component with two modes] → mitigated by `ClassificationEditor`/
`StepEditor` being the actual shared, tested units; the hosting shells are allowed to differ
(drawer vs. page chrome), the form fields themselves are not duplicated.

[The Results empty-state chrome (chart placeholder shape, sizing) gets built now against
invented example bar heights, but `add-case-result-history`'s real chart implementation might
need a different shape (e.g. a line chart instead of bars) once real data exists] → keep the
empty-state deliberately generic (label + muted static bars + one line of copy), not a fully
realized chart component pretending to be real; the follow-up change decides its own chart
shape.

## Open Questions

None outstanding — layout, route structure, and component split were resolved during the
design exploration and this design pass.
