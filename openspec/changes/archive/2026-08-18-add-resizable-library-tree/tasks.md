## 1. `useResizableWidth` hook

- [x] 1.1 Write failing tests in `apps/web/src/lib/useResizableWidth.test.ts`: defaults to
      the given width when nothing stored; clamps an out-of-range stored value on read;
      `setWidth` persists to `localStorage` under `testpulse.libraryTreeWidth` and updates
      state; keyboard handler moves width by ±16px on Left/Right, clamped to min/max; Home/End
      jump directly to min/max.
- [x] 1.2 Implement `apps/web/src/lib/useResizableWidth.ts` — minimal code to pass 1.1,
      mirroring `useViewModeOverride.ts`'s localStorage-read-on-mount pattern (no try/catch,
      consistent with that existing hook's risk tolerance).
- [x] 1.3 Verify all 1.1 tests pass.

## 2. `ResizeHandle` component

- [x] 2.1 Write failing tests in `apps/web/src/components/ResizeHandle.test.tsx`: renders
      with `role="separator"` and `aria-orientation="vertical"`; calls `onResize` with pointer
      drag deltas; forwards keydown events to the `onKeyDown` prop (keyboard arithmetic itself
      lives in `useResizableWidth`, already covered by its own tests — see note below); is
      focusable (`tabIndex=0`).
- [x] 2.2 Implement `apps/web/src/components/ResizeHandle.tsx` per Pepe's design review:
      invisible at rest, solid 2px `--primary` line on hover/focus/drag with an 8px hit zone,
      `group-focus-visible:ring-3 ring-ring/50` box-shadow halo on keyboard focus,
      `pointerdown` toggles a `dragging` state that forces `cursor: col-resize;
      user-select: none` on `document.body` until `pointerup`, with `pointermove`/`pointerup`
      listeners on `window` so a fast drag past the 8px zone still tracks correctly.
      Refinement discovered while implementing: `onKeyDown` is forwarded as-is rather than
      re-implemented here, since `useResizableWidth`'s `onKeyDown` already computes and applies
      the ±16px/Home/End resize directly — keeps the arithmetic in one place instead of
      duplicating it across hook and component.
- [x] 2.3 Verify all 2.1 tests pass.

## 3. Wire into the Library page

- [x] 3.1 Write a failing test in `apps/web/src/components/FolderTree.test.tsx` asserting the
      panel's rendered width reflects a `width` prop, not a hardcoded class.
- [x] 3.2 Update `apps/web/src/components/FolderTree.tsx`: drop `w-64`, accept a `width: number`
      prop, apply via inline `style={{ width }}`, add `position: relative` to the `<nav>` so
      the handle can anchor to its edge.
- [x] 3.3 Verify 3.1 passes.
- [x] 3.4 Write a failing test in `apps/web/src/pages/FolderExplorerPage.test.tsx`: the resize
      handle renders only on desktop (`isDesktop`); dragging/keyboard-resizing it changes the
      rendered `FolderTree` width.
- [x] 3.5 Update `apps/web/src/pages/FolderExplorerPage.tsx`: call `useResizableWidth` (default
      256, min 200, max 480, key `testpulse.libraryTreeWidth`), render `<ResizeHandle>` between
      `<FolderTree>` and the content pane, pass the resolved width into `<FolderTree>`. Also
      added `window.localStorage.clear()` to this test file's existing `beforeEach` (discovered
      while testing — width persistence otherwise leaked across tests in the same file).
- [x] 3.6 Verify 3.4 passes. Full web suite (`npx vitest run`): 91 files, 1143 tests, all pass.

## 4. E2E coverage

- [x] 4.1 Added `Scenario: Resized tree width persists across reloads` to
      `apps/web/e2e/ui-navigation.spec.ts` under the existing "Requirement: Library with
      two-pane navigation" describe block — resize via keyboard (2× ArrowRight), reload,
      assert the tree panel renders at the persisted width both times. Verified passing
      against the local compose stack; also ran the full spec file — 7 unrelated pre-existing
      flakes (breadcrumb/project-switcher/run-creation, none touching Library) all passed
      cleanly on rerun in isolation, confirming they're the same parallel-scheduling flakiness
      class already diagnosed earlier this session, not a regression from this change.

      **Follow-up (user-requested flaky-test fix, out of the original task list):**
      Root-caused and fixed two real issues surfaced while validating this change:
      1. `playwright.config.ts` had no worker cap — locally defaults to CPU count (11 cores
         here), overwhelming the single compose-stack instance every test run shares. Capped
         to `workers: process.env.CI ? undefined : 4` (verified stable across repeated
         full-file runs at 4; CI's runners already have far fewer cores, left untouched).
      2. A genuine race in the pre-existing "Flaky indicator" scenario
         (`ui-navigation.spec.ts`): it clicked the verdict "Failed" button and immediately did
         a hard `page.goto()` without waiting for `recordVerdict`'s POST + refetch to finish
         (`RunItemDetailPage.tsx:288-321` keeps the button `disabled` via `isRecording` for
         exactly that duration) — under load the navigation could race, and cancel, the
         in-flight write. Fixed by waiting for the button to re-enable before navigating.
      Separately, ran the full E2E suite once and found 9 additional failures across
      unrelated spec files (teams, session-expiry, project-rbac, change-own-password,
      public-project-access, ui-theming) that also reproduce identically on pristine `main`
      with none of this change's edits applied (confirmed via `git stash`) — pre-existing,
      unrelated to this change, and out of scope here; flagged to the user rather than fixed
      as part of this change.

## 5. Sample Project showcase

- [x] 5.1 Checked `apps/api/internal/sampledata/seed.go`'s Library section names/depth
      (Authentication, Checkout, Settings, Notifications, Localization, Reporting API,
      Two-Factor nested one level under Authentication) — all short, none truncate even at
      the 200px floor, and nesting is shallow. Concluded "already sufficient, no change": the
      resize handle itself is discoverable by hover regardless of content (it doesn't depend
      on a truncated name to be findable), and forcing a longer section name purely to
      demonstrate truncation would be content churn for a marginal showcase benefit, not a
      real product need — left seed.go untouched.

## 6. Documentation

- [x] 6.1 Updated `docs/test-management.md`'s Library section (line 213) to note the section
      tree panel is resizable (drag or keyboard, 200–480px, defaults 256px) and its width
      persists per-device, alongside the existing two-pane layout description.

## 7. Final verification

- [x] 7.1 `make lint-web`: 0 errors, 24 pre-existing warnings unrelated to this change (none
      in `ResizeHandle.tsx`/`useResizableWidth.ts`). `make coverage-web`: exit 0, all four
      metrics comfortably above the 80% gate (statements 92.36%, branches 84.52%, functions
      89.48%, lines 94.84%).
- [x] 7.2 Rebuilt and redeployed the local compose stack, verified in a real browser against
      the Sample Project's Library page: the divider is invisible at rest and shows a solid
      teal (`--primary`) line on hover, matching Pepe's mock exactly (confirmed via zoomed
      screenshot). Drag/keyboard/persistence are exercised end-to-end by the passing
      Playwright suite (real `PointerEvent`s); a synthetic mouse-drag via the browser
      automation tool itself didn't register — consistent with that tool dispatching legacy
      mouse events rather than `PointerEvent`s our handler listens for, not an app bug, and
      not further pursued once hover/E2E coverage confirmed the real behavior.

## 8. Extend to `CasePicker`'s "Sections" rail (user-requested)

- [x] 8.1 Write a failing test in `apps/web/src/components/CasePicker.test.tsx`: the rail
      renders at a `width`-driven inline style (not the hardcoded `w-56`), a resize handle
      is present when the rail is expanded, and no handle renders when `railCollapsed`.
- [x] 8.2 Update `apps/web/src/components/CasePicker.tsx`: drop `w-56`, call a second
      `useResizableWidth` instance (key `testpulse.casePickerRailWidth`, default 224, min
      200, max 480), render `<ResizeHandle>` between the rail and the case list only when
      `!railCollapsed`, apply the resolved width via inline `style={{ width }}` on the rail.
- [x] 8.3 28/28 `CasePicker.test.tsx` pass; `SuiteCaseGrid.test.tsx` + `NewRunPage.test.tsx`
      (21 tests) pass unchanged; full web suite: 91 files, 1145 tests, all pass.
- [x] 8.4 Added `Scenario: Resizing the case picker's section tree` (TD-88) under
      "Requirement: Suites index and detail page" — keyboard resize, reload persists, and
      the handle disappears once the rail is hidden. Passes in isolation and as part of the
      full 52-test file across repeated runs. Dogfood case sync still blocked on
      `TESTPULSE_TOKEN` (same as TD-87) — flagged to the user.
- [x] 8.5 `make lint-web`: still 24 pre-existing warnings, none new. `make coverage-web`:
      exit 0, statements 92.37%, branches 84.55%, functions 89.48%, lines 94.84%.
- [x] 8.6 Rebuilt and redeployed the local compose stack; verified by hand on the Sample
      Project's Suites detail page (`/projects/SP/suites/SP-S2`): the same invisible-at-rest,
      solid-teal-line-on-hover treatment as the Library tree, confirmed on the real DOM
      `separator` element via `read_page` + zoomed screenshot. Drag/keyboard/persistence/
      collapse-hides-handle are covered by the passing E2E scenario (8.4); not re-verified
      separately in the New Run form since it's the identical `CasePicker` component with no
      per-caller branching.
