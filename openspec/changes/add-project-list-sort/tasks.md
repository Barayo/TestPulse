## 1. Sort logic (pure functions, TDD)

- [x] 1.1 Write failing tests for `sortProjects()` in `apps/web/src/lib/sortProjects.ts`: each key (name/suites/cases/created) × both directions, plus a stable-sort/no-mutation check
- [x] 1.2 Implement `sortProjects()` to pass
- [x] 1.3 Write failing tests for `useSortOverride.ts` (mirrors `useViewModeOverride.test.ts`): reads/writes `testpulse.projectListSort`, invalid/missing localStorage falls back to the default
- [x] 1.4 Implement `useSortOverride.ts` to pass

## 2. Toolbar UI (TDD)

- [x] 2.1 Write failing `ProjectsPage.test.tsx` tests: default sort is Name ascending; selecting "Suites"/"Cases" defaults to descending; selecting "Created" defaults to descending; toggling direction re-orders; sort applies within Favorites and the main list identically; sort control is present and usable on mobile viewport
- [x] 2.2 Add the `Sort by` `<select>` + direction toggle button to `ProjectsPage.tsx`'s toolbar, wired to `useSortOverride`
- [x] 2.3 Restructure the toolbar to two rows: search alone (row 1), status filters + Sort/View sharing row 2 via `justify-content: space-between` (design.md decision)
- [x] 2.4 Apply `sortProjects()` to the `visible` array before the Favorites/rest split
- [x] 2.5 Run `apps/web` test suite and confirm all pass

## 3. Mobile fixes surfaced during design validation

- [x] 3.1 Write a failing test asserting the shared `Pill` component's className includes `whitespace-nowrap`
- [x] 3.2 Add `whitespace-nowrap` to `Pill` (`ProjectsPage.tsx`) so multi-word labels never wrap internally
- [x] 3.3 Manually verify (compose stack, mobile viewport) that status filter pills scroll horizontally rather than wrapping to extra rows, and that Sort/View stays visible — verified on desktop against 192 real seeded projects; mobile-width verification relies on the same Tailwind technique already validated interactively in the mockup, since the browser-automation harness available here can't resize this app's actual viewport

## 4. Docs and spec sync

- [x] 4.1 Update `docs/test-management.md` (or wherever the project list's toolbar behavior is documented) to mention sorting
- [x] 4.2 Confirm `openspec validate add-project-list-sort` passes

## 5. View-mode toggle as icons (added mid-implementation, senior-UX call)

- [x] 5.1 Replace the Expanded/Compact text `Pill`s with icon-only buttons, keeping `aria-label`/`aria-pressed` so existing tests and accessibility are unaffected
- [x] 5.2 Confirm `ProjectsPage.test.tsx` still passes unchanged (accessible names/behavior identical, only visible content changed)
- [x] 5.3 Correct initial icon choice: `LayoutGrid`/`List` implied a grid-vs-row-list layout change that doesn't happen (Compact is still a grid, just denser) — swapped to `Grid2x2`/`Grid3x3` (fewer/larger cells vs more/smaller cells) to correctly signal a density change
