## 1. Theme resolution logic (TDD)

- [x] 1.1 Write failing tests for a pure `resolveTheme(override: 'light' | 'dark' | null, prefersDark: boolean): 'light' | 'dark'` function: override present returns it regardless of `prefersDark`; override `null` returns `'dark'`/`'light'` matching `prefersDark`
- [x] 1.2 Implement `resolveTheme`
- [x] 1.3 Write failing tests for a `useThemeOverride()` hook mirroring `useViewModeOverride.ts`'s shape: no stored key → `null`; `setOverride('dark')` writes `localStorage["testpulse.themeOverride"]` and updates state; `setOverride('light')` likewise; a way to clear back to `null` (System) removes the key
- [x] 1.4 Implement `useThemeOverride()`
- [x] 1.5 Write a failing test for a `useResolvedTheme()` hook (or equivalent) that combines `useThemeOverride` with a live `matchMedia('(prefers-color-scheme: dark)')` listener: initial resolution matches the mocked media query; a simulated `change` event on the media query updates the resolved theme when override is `null`; a `change` event is ignored when an explicit override is set
- [x] 1.6 Implement the live-resolution hook
- [x] 1.7 Confirm green

## 2. Wire the resolved theme onto the document

- [x] 2.1 Write a failing test (render-level, e.g. in `App.test.tsx` or a small provider's own test) confirming `document.documentElement` gains/loses the `dark` class as the resolved theme changes
- [x] 2.2 Apply the resolved theme by toggling `.dark` on `document.documentElement` from one place (root `App` effect or a small theme provider) — no per-page logic
- [x] 2.3 Confirm green

## 3. Shared Pill component

- [x] 3.1 Extract the private `Pill` function out of `ProjectsPage.tsx` into `apps/web/src/components/ui/Pill.tsx`, exported, with the same props/markup/classes — a pure move, no visual change
- [x] 3.2 Update `ProjectsPage.tsx` to import the shared `Pill`; confirm `ProjectsPage.test.tsx`'s existing view-mode/status-filter assertions still pass unchanged (this is the regression check for the extraction)

## 4. Theme toggle control (TDD)

- [x] 4.1 Write failing tests extending `UserMenu.test.tsx`: a System/Light/Dark segmented control renders between "API tokens" and the logout divider; clicking "Dark" calls the override setter with `'dark'` and marks that segment active; clicking "System" clears the override and marks that segment active; the segment matching the current resolved state (from `useThemeOverride`) is marked active on render
- [x] 4.2 Implement the toggle row in `UserMenu.tsx` using the shared `Pill` component and the hooks from group 1
- [x] 4.3 Confirm green

## 5. Contrast and legibility fixes

- [x] 5.1 In `apps/web/src/index.css`'s `.dark` block, change `--destructive` from `#FF6B57` to `#FF9484` and `--chart-3` to match
- [x] 5.2 In `StatusBadge.tsx`, change `dotClass.pending` to add `dark:bg-muted-foreground/60` alongside the existing `bg-muted-foreground/40`
- [x] 5.3 In `RunPage.tsx`, add a `dark:bg-card/40` resting fill to the run-item-row button
- [x] 5.4 Manually verify (dev server, OS/browser dark mode, or the `.dark` class applied via devtools) the run board's verdict/status colors and the project health pills — the two highest-risk legibility spots — read clearly in dark mode; note this is a visual check, not an automated test, per design.md's stated non-goal
- [x] 5.5 Spot-check remaining pages (Library, Suites, Case detail, Profile, Settings) under dark mode for anything else that reads as broken (invisible borders, wrong-contrast text); fix anything found or file it as a follow-up if out of scope for this change

## 6. Documentation

- [x] 6.1 Document the theme system in `docs/design-system.md` (or a new `docs/theming.md` linked from `docs/README.md`): the token activation mechanism (`.dark` class), the System/Light/Dark resolution and persistence model, and the two corrected token values with their rationale
- [x] 6.2 Sample Project: confirm this is exempt from a showcase update — the theme toggle is a personal, session-scoped display preference (like the existing view-mode toggle), not project/domain content a seeded project could demonstrate differently from any other project

## 7. End-to-end

- [x] 7.1 Add an e2e scenario (new `apps/web/e2e/ui-theming.spec.ts` or extending an existing nav spec) covering: opening the user menu shows the theme control; selecting Dark visibly changes the page (e.g. assert the `dark` class on `<html>`, or a computed background-color change); the choice survives a reload

## 8. Final verification

- [x] 8.1 `openspec validate add-dark-mode-toggle --strict` and `openspec validate --specs` both pass
- [x] 8.2 Full verification: Go build unaffected (no backend changes expected), web typecheck/vitest, full e2e suite, docker rebuild + live visual check of the toggle in both light and dark, before requesting review to commit
