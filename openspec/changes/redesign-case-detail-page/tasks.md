## 1. Extract shared editing pieces

- [x] 1.1 Move `ClassificationEditor` and `StepEditor` out of `CaseDrawer.tsx` into their own
      files (`components/ClassificationEditor.tsx`, `components/StepEditor.tsx`), unchanged in
      behavior. Run existing `CaseDrawer.test.tsx` to confirm no regression before adding
      anything new.

## 2. Property row component

- [x] 2.1 Write a failing test for a new `components/PropertyRow.tsx`: renders a label and
      value as `Label: value`; label uses the `.tp-label` styling; renders nothing awkward when
      value is empty/dash-placeholder.
- [x] 2.2 Implement `PropertyRow` to make the test pass.

## 3. Responsive sidebar/accordion section

- [x] 3.1 Write a failing test for a new `useMediaQuery` hook (mock `window.matchMedia`):
      returns `true`/`false` based on the query, updates on a simulated change event.
- [x] 3.2 Implement `useMediaQuery`.
- [x] 3.3 Write a failing test for a new `components/CaseSidebarSection.tsx`: at ≥768px renders
      children directly and always visible; at <768px renders the same children inside a
      `<details>` that starts closed and can be expanded.
- [x] 3.4 Implement `CaseSidebarSection` using `useMediaQuery('(min-width: 768px)')` per
      design.md.

## 4. Results empty state

- [x] 4.1 Write a failing test for a new `components/CaseResultsPanel.tsx`: with no data,
      renders the "Results" label, placeholder chart chrome, and a one-line explanation that
      no result history exists yet.
- [x] 4.2 Implement `CaseResultsPanel`'s empty state to make the test pass. No data-fetching or
      populated-state rendering — out of scope per design.md Non-Goals.

## 5. Case detail page

- [x] 5.1 Write failing tests for a new `pages/CaseDetailPage.tsx` covering each scenario in
      `specs/ui-navigation/spec.md`'s "Viewing an existing test case": steps and suite
      membership shown read-only; version history listed with current version marked;
      properties render as `Label: value` pairs except priority (badge); sidebar sections
      collapse to stacked, independently-expandable sections in the same order below 768px;
      Results section renders its empty state.
- [x] 5.2 Implement `CaseDetailPage`, composing `PropertyRow`, `CaseSidebarSection`, and
      `CaseResultsPanel`, reusing `ClassificationEditor`/`StepEditor` for its edit mode. Make
      the tests from 5.1 pass.
- [x] 5.3 Write a failing test asserting the "Edit" affordance on the page still creates a new
      version on save, matching the existing "Editing a test case creates a new version"
      requirement (unchanged behavior, new host component). Make it pass.

## 6. Routing

- [x] 6.1 Add the `/projects/:projectId/cases/:caseId` route to `App.tsx`, rendering
      `CaseDetailPage`.
- [x] 6.2 Write a failing test asserting that selecting a case in `FolderExplorerPage.tsx`
      navigates to the case's route instead of opening drawer state. Update
      `FolderExplorerPage.tsx` to navigate (`useNavigate`) and make the test pass.
- [x] 6.3 Remove `mode="view"` from `CaseDrawer.tsx` and its props/branches — it now only
      handles `mode="create"`. Update `CaseDrawer.test.tsx` accordingly (view-mode tests move to
      `CaseDetailPage.test.tsx` from step 5.1).

## 7. Update existing tests referencing the old drawer view

- [x] 7.1 Update `apps/web/e2e/ui-navigation.spec.ts` and `apps/web/e2e/test-authoring.spec.ts`
      wherever they select a case and assert on `role="dialog"` drawer content — assert on the
      new route/page instead.
- [x] 7.2 Run `make test-web` and `make coverage-web`; fix any other test left assuming the old
      drawer-based view.

## 8. E2E coverage for the new scenarios

- [x] 8.1 Add/extend `ui-navigation.spec.ts` scenarios: opening a case updates the URL and back
      navigates to the library; properties render as labeled pairs; Results section shows its
      empty state.
- [x] 8.2 Add a viewport-resize scenario (Playwright `page.setViewportSize`) asserting the
      sidebar collapses into stacked, expandable sections below 768px, in the same order as
      desktop.
- [x] 8.3 Run `make e2e` (headless) and confirm the new and updated scenarios pass. (Found and
      fixed a real bug along the way: `CaseDetailPage`'s edit-save didn't refresh the version
      history list — added a unit test that reproduces it and fixed `saveEdit` to reload.)

## 9. Specs & docs

- [x] 9.1 Run `/opsx:sync` (or `openspec-sync-specs`) to merge this change's `ui-navigation`
      delta into `openspec/specs/`.
- [x] 9.2 Write `docs/design-system.md`: the property-row pattern, badge-usage rule (priority
      only), chart-color-token reuse rule (`--chart-1`..`--chart-5`, never invent new hues), and
      the empty-state/responsive rules from design.md.
- [x] 9.3 Update `docs/test-management.md` for the new case detail route and navigation
      behavior.
- [x] 9.4 Add a line to `ROADMAP.md` recording that test case detail is pulled forward from the
      v0.1 "thin" UI-thickness tier into a more polished treatment, per design.md's Context.

## 10. Final verification

- [x] 10.1 Run `make lint`, `make test`, `make coverage-web` and confirm all gates pass before
      archiving this change.

## 11. Visual review fix

- [x] 11.1 Live visual check (a real screenshot from the running app) found the empty-Steps
      state reading as broken — a single gray sentence next to a fully-populated sidebar left a
      large, unexplained void. Wrote a failing test, then replaced it with the app's existing
      dashed-border empty-state card (`ProjectsPage.tsx`'s pattern): icon, heading, explanation,
      and a "+ Add steps" button that opens edit mode directly. Documented as the primary-content
      empty-state pattern in `docs/design-system.md`, distinct from the one-line pattern used for
      secondary sidebar sections.
- [x] 11.2 A follow-up visual check (a case with one populated step) found the same imbalance
      persists once there's a little content, not just none — bare step text has no boundary of
      its own next to a tall sidebar. Wrote a failing test, then wrapped the populated steps list
      in the shared `Card` component (same boundary principle as 11.1, generalized). Documented
      in `docs/design-system.md`.
- [x] 11.3 A second follow-up visual check found the card alone insufficient — a small bounded
      card at the top of an otherwise-empty stretched grid cell still reads as unbalanced. Wrote
      a failing test, then added a persistent vertical divider between the content and sidebar
      columns (`md:border-l md:pl-7` on the sidebar wrapper), sized to the sidebar's own content
      height — the standard two-pane-layout signal that the columns are independent and don't
      need to match heights. Documented in `docs/design-system.md` as the actual fix for
      page-level height imbalance; the card-boundary rule from 11.2 still applies for the
      content itself, but doesn't resolve this on its own.
- [x] 11.4 A third round confirmed the divider from 11.3 was functionally invisible — this
      app's tokens are close-value near-whites, so a 1px `border-l` anti-aliases away on a real
      display (confirmed via a live screenshot) and, separately, computed as a sub-pixel
      `0.56px` width under headless Chrome's `1.8` device-pixel ratio when inspected directly.
      Wrote a failing test, then replaced the hairline with a filled panel background
      (`md:rounded-2xl md:bg-muted/60 md:p-5` on the sidebar wrapper) — a tinted area is
      perceptible at any contrast level and can't disappear to sub-pixel rendering the way a
      border can. Verified directly via a zoomed screenshot before handing back. Documented in
      `docs/design-system.md`: prefer filled panels over hairline dividers for structural
      boundaries in this palette; reserve borders for separators inside an already-bounded
      container.
- [x] 11.5 A live check with a 6-step case found the step text too small to read comfortably
      (`text-sm` action, `text-xs` expected result) and steps hard to scan as a group. Wrote
      failing tests, then: moved the step list to a semantic `<ol>`/`<li>` (native step-count
      announcements for assistive tech); action text to `text-base font-medium`; expected result
      to `text-sm` with an explicit "Expected:" label instead of a bare `→` glyph; a numbered
      circular badge per step; and a divider between steps. Documented in `docs/design-system.md`.
- [x] 11.6 A follow-up review called the result legible but generic — the badges were flat gray
      and "Expected:" was a plain bold word, neither tied to the app's own visual language. Wrote
      failing tests, then: badges to `bg-primary/10 text-primary` (the brand teal, matching the
      priority badge and "current" version pill); "Expected:" to the app's own `.tp-label`
      treatment (mono, uppercase, tracked) instead of a one-off bold word. Documented in
      `docs/design-system.md` as the rule for numbered sequences and inline micro-labels
      generally, not just this page.
- [x] 11.7 Reviewed the page across the full step-count spectrum (0/1/3/10 steps, real cases
      from the dogfooding project, real screenshots) at the user's request. 0/1/3 steps confirmed
      good. At 10 steps, a new problem: the content column outgrows the viewport, and the
      (now comparatively short) sidebar scrolls out of view while reading later steps, leaving
      Properties/Results unreachable. Wrote a failing test, then made the sidebar
      `md:sticky md:top-6 md:self-start` — pins it in the viewport while scrolling long content,
      the standard pattern for content+sidebar layouts where content can outgrow the sidebar.
      Verified by scrolling a live 10-step case before and after. Documented in
      `docs/design-system.md`.
- [x] 11.8 A real mobile screenshot surfaced a breakage: `Breadcrumbs.tsx`'s plain flex row had
      no shrink/wrap handling, so a long last segment (e.g. a case title) shrank below its
      min-content width and wrapped word-by-word into a vertical column clipped at the screen
      edge, on the shared `Breadcrumbs` component (used app-wide, not just case detail). Wrote
      failing tests, then gave non-last segments `shrink-0 whitespace-nowrap` and the last
      segment `min-w-0 flex-1 truncate` (ellipsis), with `overflow-x-auto` on the nav as a
      safety net. Verified on a real 390px-wide viewport before and after. Documented in
      `docs/design-system.md` as the pattern for any variable-length trail.
- [x] 11.9 Live review of edit mode found the Action/Expected result fields (`StepEditor.tsx`,
      shared between case creation and case-detail editing) were single-line `Input`s that
      silently clipped any real sentence-length content, making longer steps hard to edit. Wrote
      failing tests (including a stateful-wrapper test, since a plain controlled-component test
      doesn't exercise re-render-driven typing realistically), then switched both fields to the
      shared `Textarea` component (auto-grows via `field-sizing: content`). Verified in a live
      edit form before and after. Documented in `docs/design-system.md`: prefer `Textarea` over
      `Input` for any field whose realistic content can exceed a short phrase.
- [x] 11.10 Requested improvement: expected-result text was smaller (`text-sm`) and
      lower-contrast (`text-muted-foreground`) than the action above it, even though "what
      should happen" isn't actually less important than "what to do" — the size/contrast pairing
      was working against readability, not just visual hierarchy. Wrote failing tests, then:
      expected-result text to the same `text-base`/full-contrast treatment as the action, with
      the distinction moved entirely to a `border-l-2 border-primary/30` accent bar and a teal
      `.tp-label`. Deliberately kept the accent in the neutral teal, not the destructive/chart
      verdict colors, since expected-result is descriptive, not itself a pass/fail signal.
      Verified live, zoomed in to confirm legibility. Documented in `docs/design-system.md`: use
      a color/border accent to mark "a different kind of information," not reduced size or
      contrast — those two problems (readability vs. distinction) want different tools.
- [x] 11.11 Tried the real brand gradient (`#14B8A6`→`#0D6E6A`, from the logo SVG) on the step
      badges and a top accent bar on the Steps card, requested as "a touch of colour." User
      feedback: too strong against the app's otherwise soft palette. Reverted both to the
      previous flat `bg-primary/10 text-primary` tint; wrote a test locking that back in.
      Documented the reversal in `docs/design-system.md` so it isn't re-tried without a fresh
      design conversation.
- [x] 11.12 Requested a further pass on distinguishing expected-result via font or color. Rather
      than guess again after the gradient miss, built three restrained options live on a real
      case (steps 1–4: current baseline, `font-mono` value, a soft `bg-primary/5` callout,
      italic styling) as temporary comparison code, screenshotted for review. User picked the
      soft callout. Wrote a failing test, then applied it to every step:
      `rounded-lg border-primary/20 bg-primary/5 p-2.5` wrapping the whole expected-result line
      — reuses the exact tint/border combination `ProjectsPage.tsx`'s favorite-card already
      uses, not a new one. Removed the temporary comparison branches. Documented the settled
      choice (and why the other two options and the earlier gradient weren't it) in
      `docs/design-system.md`.
- [x] 11.13 Requested seeing the Results chart populated. Built `CaseResultsPanel`'s
      populated-state renderer for real (TDD: failing tests first) rather than faking it in
      place — optional `data` prop, uniform-height status bars (verdict is discrete, not a
      magnitude), reuses `--chart-1/2/3`, legend + tooltip + text breakdown so identity is never
      color-alone. Temporarily wired sample data (matching real verdicts already recorded
      against this case via the actual run API — not arbitrary numbers) into `CaseDetailPage`,
      scoped to one case ID, to review live; reverted that wiring afterward so the page ships
      exactly as scoped (`CaseResultsPanel` renders no data anywhere). Updated design.md's
      Non-Goals and Decisions to accurately describe what shipped vs. what's still
      `add-case-result-history`'s job.
- [x] 11.14 Final re-verification after reverting the preview wiring: `make lint`, full unit
      suite, typecheck all green; rebuilt and confirmed live that the Results section renders
      its empty state again for this and other cases. User confirmed the page overall — signed
      off as done.
