## 1. Row visual: circular checkmark + tint (TDD)

- [x] 1.1 Test + replace the `<input type="checkbox">` row with a `role="checkbox"`/`aria-checked`/`aria-label` element — a real `<button type="button">`, not a bare `div` as originally planned: found live that jest-dom's `toBeDisabled()` only recognizes native form-tag elements or custom elements (a `div` with `aria-disabled` doesn't qualify, unlike the more lenient `dom-accessibility-api` helper used elsewhere), so a button was needed to keep `toBeDisabled()` working across all 4 test files without modification
- [x] 1.2 Test + render a circular indicator (`lucide-react`'s `CheckIcon`, empty outline unchecked / filled checked) instead of the native checkbox glyph
- [x] 1.3 Test + apply `bg-primary/10` row tint when checked (D2 — not `bg-primary/5`, which collides with `hover:bg-accent`)
- [x] 1.4 Test + native `disabled` attribute when `readOnly` (via the button element, not `aria-disabled`), confirming `toBeDisabled()` still passes
- [x] 1.5 Ran the full existing `CasePicker.test.tsx` suite — all 32 passed unmodified (queries were already role/name-based, not native-input-specific)

## 2. `onToggleRange` API addition (TDD)

- [x] 2.1 Test + add `onToggleRange: (caseIds: string[], checked: boolean) => void` as a new required prop on `CasePicker`; update `CasePicker.test.tsx`'s `renderPicker` helper to supply a mock
- [x] 2.2 Test + bidirectional Shift+Click: first Shift+Click (no anchor) toggles one row and sets the anchor via the existing `onToggle`; a later Shift+Click computes the range from `visible` order and calls `onToggleRange` with the clicked row's resulting state
- [x] 2.3 Test: a bidirectional range-toggle can uncheck an already-checked range (not just check an unchecked one) — the scenario the Library's additive-only model explicitly cannot do
- [x] 2.4 Wired `SuiteCaseGrid.tsx` to pass `onToggleRange` through unchanged (no logic of its own), with its own pass-through test
- [x] 2.5 Test + implemented `SuiteDetailPage.tsx`'s `toggleRange` handler (a "set many ids to a state" reducer alongside its existing single-id `toggle`)
- [x] 2.6 Test + implemented `NewRunPage.tsx`'s `toggleCaseRange` handler (same shape, alongside its existing `toggleCase`)

## 3. Keyboard navigation with real scroll math (TDD)

- [x] 3.1 Test + add `focusedIndex` state and a global keydown listener (guarded by `isEditableElementFocused()`): arrow keys/j-k move focus through `visible`, clamped. Implemented as **roving tabindex** (only the row at `focusedIndex` has `tabIndex={0}`, others `-1`) with real `.focus()` transfer on navigation, not a purely-visual focus ring — this unifies native Tab accessibility and the custom arrow-key system into one focus model instead of two competing ones.
- [x] 3.2 Test + on focus change, compute the target row's pixel offset and set `viewportRef.current.scrollTop` directly (D5) — no `scrollIntoView`, since only the current windowed slice is mounted
- [x] 3.3 Test + Space toggles the focused row (first-toggle semantics, same as 2.2's first-click case)
- [x] 3.4 Test + Shift+Space extends the bidirectional range from the anchor to the focused row — **simpler than design.md originally described**: since roving tabindex means real DOM focus always tracks `focusedIndex`, Shift+Space is handled entirely by the *same per-row* `onKeyDown`/`handleRowClick` that already handles click/Shift+Click (`e.shiftKey` is `true` for a native Shift+Space keydown too) — no separate global Shift+Space branch was needed after all.
- [x] 3.5 Test + Enter is not bound to anything (D6). Found and fixed two real bugs while making this correct:
      (a) the focus-transfer effect ran on every `focusedIndex`/filter change including mount and search typing, stealing real focus away from the search box mid-keystroke — fixed by gating the transfer on an explicit `hasKeyboardNavigated` state that only becomes true once the user actually presses an arrow key, and by re-checking `isEditableElementFocused()` at transfer time;
      (b) a native `<button>` activates on Enter by default, which fired `onClick`/`handleRowClick` even though no code explicitly bound Enter — fixed with an explicit `e.preventDefault()` on Enter in the row's own `onKeyDown`

## 4. Discoverability

- [x] 4.1 Wired `RunShortcutsHint`/`RunShortcutsOverlay` into `CasePicker.tsx` with its own `ShortcutEntry[]` (arrows/j-k, Space, Shift+Space) — both consumers (`SuiteCaseGrid`, `NewRunPage`) get it for free

## 5. Cleanup

- [x] 5.1 Grepped the codebase for any usage of `apps/web/src/components/ui/checkbox.tsx`; confirmed none, deleted it (D7); confirmed `radix-ui` package is still used elsewhere (`switch.tsx`), so no dependency removal needed

## 6. Wiring and regression safety

- [x] 6.1 Full web suite green (1390/1390), typecheck clean (`npm run typecheck`), lint clean (only pre-existing warnings, no new ones), coverage gate 92.21%/84.59%/90.15%/94.55%
- [x] 6.2 Confirmed every existing `SuiteCaseGrid.test.tsx`/`NewRunPage.test.tsx`/`SuiteDetailPage.test.tsx` checkbox-role assertion still passes unmodified (regression guard for D1/D4's accessibility-preservation promise)
- [x] 6.3 Confirmed `RunPage.tsx` has zero diff (fully untouched) and `FolderExplorerPage.tsx`'s diff is unchanged from where `add-library-bulk-select` left it (this change never opened that file) — a separate, independent implementation, no premature shared abstraction across two already-different range semantics

## 7. Docs

- [x] 7.1 Updated `docs/test-management.md`'s Suites section (case-membership picker) and Runs section ("New run" form) to describe the circular-indicator selection and bidirectional Shift+Click/keyboard range-toggle. `docs/design-system.md` had no checkbox-pattern mentions to update.

## 8. Validation

- [x] 8.1 `make lint` clean, web coverage gate 92.21%/84.59%/90.15%/94.55% — all ≥80%
- [x] 8.2 `act pull_request -j web`: contract-types-current, lint, and typecheck steps green on every attempt; the coverage/unit-test step showed inconsistent, escalating, non-overlapping failures across totally unrelated files (CaseDrawer, ChangePasswordForm, Lightbox, LoginForm, ProjectReportsPage, etc. — 2 failures on the first attempt, 27 on a retry) with zero correlation to this change's files, the exact signature of local Docker resource contention already documented earlier this session, not a real regression — confirmed by running the full suite directly 3 times (`npx vitest run`, 1390/1390 every time) and the one incidentally-flagged `SuiteCaseGrid.test.tsx` in isolation 3 times (10/10 every time)
- [x] 8.3 Local docker-compose deploy + manual browser validation against the Sample Project's real 34-case data: circular checkmark indicator (filled teal circle vs. empty outline, row tint) confirmed in both the Suite Detail edit-mode picker and the New Run form's picker; bidirectional Shift+Click confirmed both directions live (a 5-row range checked via Shift+Click, then the same range unchecked via a second Shift+Click — "9 selected" → "4 selected"); keyboard nav confirmed live (j moved the visible focus ring, Space toggled the focused row, selection count updated correctly); shortcuts hint bar visible at the bottom of both pickers
