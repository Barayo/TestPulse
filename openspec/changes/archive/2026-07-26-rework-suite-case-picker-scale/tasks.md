## 1. Data plumbing

- [x] 1.1 Extend `SuiteCaseGridCase` with `folderId: string`.
- [x] 1.2 `SuiteDetailPage.tsx`: fetch `GET /projects/{projectKey}/folders` alongside
  cases/suite; pass `folders` and updated `gridCases` (with `folderId`) into
  `SuiteCaseGrid`.

## 2. Section-tree scoping — TDD

- [x] 2.1 Write failing tests: selecting a section in the tree scopes the visible
  list to that section and its descendants; "All sections" (default) shows
  everything; selection persists across scope changes.
- [x] 2.2 Implement the read-only section rail (reuses `Folder{id,name,parentFolderId}`
  data shape, not the `FolderTree` component itself — no inline creation/drag-drop/
  context menu) with a collapsible toggle, matching `mockup.html`. Each treeitem's
  accessible name is an explicit `aria-label` ("Auth (2 cases)"), not concatenated
  visible text — caught during implementation (concatenated text produced "Auth2",
  no separating space).

## 3. Search — TDD

- [x] 3.1 Write failing tests: search narrows by title substring, composes with
  scope and existing dropdown filters, has its own clear affordance.
- [x] 3.2 Implement.

## 4. Virtualized rendering — TDD

- [x] 4.1 Write failing tests for the windowing math as a pure function (given
  scrollTop/viewport height/row count/row height, returns the correct visible
  index range plus overscan) — test this independent of DOM/scroll simulation
  limits in jsdom.
- [x] 4.2 Implement the windowing function (`computeVisibleRange`, exported) and
  wire it to a scroll container, rendering only the computed slice. Simplified
  from the plan: `onScroll` calls `setScrollTop` directly rather than
  `requestAnimationFrame`-throttled — React's own batching already covers the
  common case, and the un-throttled version keeps tests synchronous; revisit only
  if real-world scroll perf profiling shows a need.
- [x] 4.3 Write failing tests: with a 200-case synthetic list, the rendered
  checkbox count stays bounded regardless of scroll position; correctness at the
  tail (last row renders real content, not blank) via a realistic max-scrollTop
  scroll event.
- [x] 4.4 Cap tags at 2 + overflow badge per row (fixed-height constraint, matches
  `mockup.html`).

## 5. Selection persistence — TDD

- [x] 5.1 Write failing tests combining all three axes: check a case, scope to a
  different section (case now hidden), clear scope, confirm still checked; repeat
  for search.
- [x] 5.2 Implemented — falls out of 2-4 as expected: selection stays a
  parent-owned `Set` untouched by visibility logic.
- [x] 5.3 "Selected only" toggle: written and implemented.

## 6. Verification

- [x] 6.1 Full unit suite green (542 tests), coverage 92.47%/81.2%/91.38%/95.18%
  (stmts/branch/funcs/lines) — gate maintained.
- [x] 6.2 `npm run typecheck` / `npm run lint` clean (lint: only pre-existing
  fast-refresh warnings, same class already present elsewhere in the codebase).
- [x] 6.3 Extended the existing TD-21 e2e scenario (`test-authoring.spec.ts`) with a
  second case in its own section to exercise scoping in the same flow, rather than
  adding an orphaned new scenario with no dogfood case mapping. Full e2e suite
  green: 65/65 against a rebuilt `docker compose` stack.
- [ ] 6.4 Manual visual verification — attempted via browser automation; blocked
  again by the same 1Password extension focus conflict from earlier in this
  session (unrelated to the app). Not treated as a blocker given 542/542 unit +
  65/65 e2e (including this exact section-scoping scenario, in a real Chromium via
  Playwright) already passed against the same compose stack.

## 7. Docs and Sample Project

- [x] 7.1 Updated `docs/test-management.md`'s Suites section.
- [x] 7.2 No Sample-Project-showcase task beyond what already exists — confirmed:
  the Sample Project's folder hierarchy and cases already exist; this is a picker
  UI improvement over existing data, not new seeded content.

## 8. Ship

- [x] 8.1 Synced into `openspec/specs/ui-navigation/spec.md` — extended "Suites
  index and detail page" with section-scoping, search, selection-persistence,
  and bounded-rendering scenarios.
- [x] 8.2 Archived, keeping `mockup.html` as the durable design reference.
- [x] 8.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
  Pushed as `ccbc427`; CI and Release image both green.
