## 1. Shared responsive hook

- [x] 1.1 Check whether `apps/web/src/lib/useMediaQuery.ts` already exists (may have been added
      by `redesign-case-detail-page` if implemented first). If not, write a failing test and
      implement `useMediaQuery(query: string)` (mock `window.matchMedia`), matching the signature
      documented in both changes' design.md.
      Already existed (`redesign-case-detail-page` implemented first) — reused as-is.

## 2. Extract FolderPicker

- [x] 2.1 Write a failing test asserting current "Move to…" behavior end-to-end (search filters
      by path, selecting a folder moves the case, dropping on current folder is unchanged) — a
      safety net before extracting anything.
- [x] 2.2 Extract `components/FolderPicker.tsx` from `FolderExplorerPage.tsx`'s "Move to…" dialog
      body (props: `folders`, `rootId`, `query`, `onQueryChange`, `onSelect`). Wire the existing
      "Move to…" dialog through it. Make the test from 2.1 still pass.

## 3. Mobile layout

- [x] 3.1 Write a failing test: at <768px, `FolderTree` is not rendered and the content list
      takes full width; at ≥768px, both render side by side (unchanged from today).
- [x] 3.2 Implement the `useMediaQuery('(min-width: 768px)')`-gated conditional render in
      `FolderExplorerPage.tsx`. Make the test from 3.1 pass.
- [x] 3.3 Write a failing test: at <768px, selecting a breadcrumb segment above the current
      section updates the content list to that section's contents (same as tree selection would
      on desktop) — confirms no new code is needed here, `Breadcrumbs` already does this; the
      test exists to lock the behavior in as a scenario, not because it should currently fail
      for a new reason.
- [x] 3.4 Write a failing test: at <768px, a "Browse sections" action is visible, opens
      `FolderPicker`, and selecting a non-ancestor section navigates the content list to it.
- [x] 3.5 Implement the "Browse sections" trigger and its `FolderPicker` instance (`onSelect`
      navigates via `useNavigate` instead of moving a case). Make the test from 3.4 pass.
      Found via e2e (not anticipated in design.md): the shared jsdom `matchMedia` stub in
      `src/test/setup.ts` defaults `matches: false`, which reads as "mobile" for a min-width
      query — the opposite of `useIsMobile`'s max-width semantics that default was written for.
      Defaulted `FolderExplorerPage.test.tsx`'s `beforeEach` to desktop so pre-existing,
      responsiveness-unrelated tests keep testing what they tested before this change.
      Also found via e2e (not anticipated): `Breadcrumbs.tsx`'s `flex-1 min-w-0` last segment
      could collapse to exactly 0px width — invisible, not just narrow — once the `shrink-0`
      segments ahead of it alone already exceeded the nav's width (a long project name pushed a
      section-name crumb off-screen on a 375px viewport). Fixed with a `min-w-16` floor instead
      of `min-w-0` on both the wrapping span and the label span; documented in
      `docs/design-system.md`'s breadcrumb section with a locking unit test in
      `Breadcrumbs.test.tsx`.

## 4. Component and icon consistency

- [x] 4.1 Replace `FolderExplorerPage.tsx`'s raw `<button className="...">` elements ("+ New
      section", "+ New test case", folder/case row buttons) with the shared `Button` component.
      Run existing `FolderExplorerPage.test.tsx` to confirm no regression.
- [x] 4.2 Replace the emoji folder/case icons (📁/📄) with `FolderIcon`/`FileTextIcon`
      (`lucide-react`, already imported this way on `ProjectPage.tsx`/`RolesPage.tsx`).
- [x] 4.3 Wrap the content list in the shared `Card` component instead of a bare
      `rounded-md border` div.
- [x] 4.4 Give "Move to…" more visual weight (e.g. an icon button consistent with other
      secondary row actions elsewhere in the app) instead of the current small text button.
      Used `FolderInputIcon` in a `text-muted-foreground hover:text-foreground` icon button,
      matching the row-action pattern already established by `RolesPage.tsx`/`PeoplePage.tsx`'s
      delete/remove buttons (not destructive here, so no hover-to-red).

## 5. E2E coverage

- [x] 5.1 Add/extend `apps/web/e2e/ui-navigation.spec.ts` with the new scenarios from
      `specs/ui-navigation/spec.md`: tree hidden below 768px (Playwright viewport resize),
      breadcrumb navigation still works at that width, "Browse sections" navigates to a
      non-ancestor section. Also renamed the containing `test.describe` block from "Folder
      explorer with two-pane navigation" to "Library with two-pane navigation" — pre-existing
      drift from the merged spec's actual requirement title.
- [x] 5.2 Run `make e2e` (headless) and confirm the new and existing scenarios pass.
      47/47 passed. (One unrelated test — "Empty project shows per-panel empty states" — flaked
      once under 5-way parallel load and passed cleanly in isolation; not touched by this change.)

## 6. Specs & docs

- [x] 6.1 Run `/opsx:sync` (or `openspec-sync-specs`) to merge this change's `ui-navigation`
      delta into `openspec/specs/`.
- [x] 6.2 Update `docs/test-management.md` for the new mobile navigation behavior (breadcrumbs
      up, "Browse sections" sideways, tree desktop-only).
      Also updated `docs/design-system.md`'s breadcrumb section for the `min-w-16` fix (see 3.5).

## 7. Final verification

- [x] 7.1 Run `make lint`, `make test`, `make coverage-web` and confirm all gates pass.
- [x] 7.2 Close GitHub issues #47 and #48, referencing this change, once archived.

## 8. Deep nesting follow-up (found via real usage, not the original scope)

- [x] 8.1 Wrote failing tests (`Breadcrumbs.test.tsx`, 7 new cases) for a >5-segment trail:
      collapses to first-2/last-2, hides the middle, opens a menu listing hidden segments in
      order as working links, closes on outside-click/Escape/menu-item-click, caps every visible
      segment's width once collapsed. Confirmed the 5-segment boundary case stays unaffected
      (existing test still passes unmodified). Implemented `Breadcrumbs.tsx`'s collapse (see
      `docs/design-system.md`). All 15 tests pass.
- [x] 8.2 Wrote failing tests (`FolderTree.test.tsx`) for a `title` attribute on tree rows and a
      capped indentation step past depth 5. Implemented `indentPx()` and the `title` attribute.
      All 13 tests pass.
- [x] 8.3 Added e2e coverage (`ui-navigation.spec.ts`, "Deep section nesting collapses the
      middle of the trail") reproducing the real reported scenario: 4 levels of nested sections,
      asserting collapse, menu contents, and navigation via a hidden-segment link. Full suite:
      52/52 e2e, 414/414 web unit tests.
- [x] 8.4 Synced `ui-navigation` spec delta (Breadcrumb trail requirement gains the collapse
      behavior; Library two-pane requirement gains the tree-tooltip scenario) into
      `openspec/specs/`. Updated `docs/design-system.md` (breadcrumb collapse + tree
      indentation-cap sections) and this change's `design.md` (Addendum).
- [x] 8.5 Resizable tree panel — raised as the user's own first proposal, evaluated and
      deliberately deferred (see design.md Addendum for the reasoning) rather than bundled in.
      Tracked as its own backlog issue, not part of this change.
