## 1. Summary strip (TDD)

- [x] 1.1 Write failing `ProjectPage.test.tsx` tests: shows status pill/pass-rate bar/suite+case totals/last-run for a project with data; shows "No runs yet" instead when the project has never run; strip reflects the *active* project, not the first one in the summaries list
- [x] 1.2 Add the summary strip to `ProjectPage.tsx`, sourced from `useProjectSummaries()` filtered to `projectId` (not `useProjectLanding()` — see design.md)
- [x] 1.3 Run tests, confirm green

## 2. Color-coded Recent runs rows (TDD)

- [x] 2.1 Write failing tests: a run below 50% pass rate gets a distinct accent/class from a run at or above 80%
- [x] 2.2 Apply `statusBorderClass` (or equivalent) to each `RunsPanel` row in `ProjectLandingPanels.tsx`
- [x] 2.3 Run tests, confirm green

## 3. All-empty getting-started checklist (TDD)

- [x] 3.1 Write failing tests: a project with zero cases, zero suites, zero runs shows a single checklist instead of three panels; a project with *some* content (e.g. cases but no suites) still shows the existing per-panel empty states, not the checklist
- [x] 3.2 Implement the all-empty branch in `ProjectPage.tsx` (required exposing a new `totalCases` field from `useProjectLanding()` — folders alone can't distinguish "empty" from "has cases in the root folder")
- [x] 3.3 Run tests, confirm green

## 4. Panel visual polish

- [x] 4.1 Bring panel-shell typography/card treatment (`ProjectLandingPanels.tsx`) in line with `ProjectsPage`'s established treatment (`rounded-2xl`, consistent border/padding)
- [x] 4.2 Revisit the fixed 4-row cap in `useProjectLanding.ts` — raised to 5

## 4a. Getting-started checklist redesign (added mid-implementation, live feedback)

- [x] 4a.1 Write a failing test asserting each checklist step has an explanatory tip, not just a bare label
- [x] 4a.2 Rebuild the checklist as a full-width 3-column grid (same shape as the panels it replaces) with icon + title + tip per step, reusing the same icons as `FoldersPanel`/`SuitesPanel`/`RunsPanel` for continuity — the narrow centered card it replaced had the same "empty canvas" problem this whole change set out to fix
- [x] 4a.3 Confirm tests green

## 5. Verification

- [x] 5.1 Run full `apps/web` test suite, lint, typecheck, coverage gate — all green (248 tests, coverage 92.78/84.75/92.19/94.98)
- [x] 5.2 Rebuild the compose stack; verify live against both seeded projects (Banca Móvil dense, Desktop App sparse) on desktop, plus a freshly-created genuinely-empty project for the checklist scenario
- [x] 5.3 Get a live mobile check — `resize_window` still doesn't actually resize the viewport, but verified genuinely (real narrow-viewport media queries, not a CSS override) via an in-page iframe sized to 390×844 pointed at the running compose stack. Checked all three layout branches at that width: dense project (summary strip + 3 panels stack, color-coded run rows preserved), fully-empty project (get-started checklist renders as single-column cards), and partial-empty project (cases but no suites — per-panel empty states, not the checklist, as designed). All clean; no overflow or cramped spacing.

## 6. Docs and spec sync

- [x] 6.1 Update `docs/test-management.md`'s project-landing section to mention the summary strip and the all-empty checklist
- [x] 6.2 Confirm `openspec validate enrich-project-landing` passes
