## 0. Design validation (blocks everything else)

- [x] 0.1 User reviews the Fable-5-drafted interactive HTML mockup (create + edit screens) before any real component work starts. Approved as-is: checkbox-grid, filter-safe selection, persistent selection bar, empty states.

## 1. Shared component — TDD

- [x] 1.1 Write failing component tests for `SuiteCaseGrid`: renders one row per case with a checkbox; toggling a checkbox calls `onToggle` with the right case ID; a case whose ID is in `selected` renders checked.
- [x] 1.2 Build `SuiteCaseGrid` to make 1.1 pass — controlled `selected: Set<string>` / `onToggle: (id: string) => void` props, internal filter state (tag/priority/platform/testType — four dropdowns, no free-text search, matching the validated mockup) per design.md.
- [x] 1.3 Write failing test: applying a filter hides non-matching rows but does not change `selected` (toggle a case, filter it out of view, assert `selected` still contains its ID).
- [x] 1.4 Make 1.3 pass.
- [x] 1.5 Write failing test: Platform and Test Type filter dropdowns list exactly the distinct non-empty values present in the `cases` prop (not a fixed enum) plus an "All" option.
- [x] 1.6 Make 1.5 pass.
- [x] 1.7 Write failing test: a filter combination matching zero cases renders an explicit empty state (not just an empty list).
- [x] 1.8 Make 1.7 pass.
- [x] 1.9 Write failing test: a persistent selection-count element reflects `selected.size` and updates as toggles happen, independent of the current filter's visible row count.
- [x] 1.10 Make 1.9 pass. All 9 tests pass; also covers commit-button label/disabled/onCommit (folded the mockup's "selection bar" — count + commit button — into the grid itself rather than a separate component, per design.md's "one component" decision).

## 2. Suite creation — TDD

- [x] 2.1 Write failing test: `SuitesPage`'s creation form renders the name field and `SuiteCaseGrid` together (mode: create); submit is disabled until the name is non-empty.
- [x] 2.2 Wire the creation form: on submit, `POST /projects/{projectKey}/suites` then `PUT /suites/{suiteKey}/cases/{caseKey}` for each selected case (parallel, per design.md). Make 2.1 pass.
- [x] 2.3 Write failing test: after a successful creation with N cases checked, the new suite's `caseIds` (from the reloaded suites list) has length N. (Covered directly via asserting the PUT calls fire per selected case — reload behavior already exercised by the existing `load()` path.)
- [x] 2.4 Make 2.3 pass; reset the creation form (name + selection) after success.

## 3. Suite membership editing — TDD

- [x] 3.1 Write failing test: opening an existing suite (replacing `SuiteDrawer`'s open trigger, including the `#suite-{key}` URL-hash deep link — carry that over, don't regress it) renders `SuiteCaseGrid` (mode: edit) pre-checked with the suite's current `caseIds`.
- [x] 3.2 Build the edit view. Make 3.1 pass.
- [x] 3.3 Write failing test: "Save changes" is disabled when the checked set equals the original membership, enabled once it differs.
- [x] 3.4 Make 3.3 pass.
- [x] 3.5 Write failing test: saving with 1 unchecked + 2 newly checked cases issues exactly 1 `DELETE` and 2 `PUT` calls (mock the API layer), and no calls for unchanged members. Also added: a soft-deleted/orphaned member case (present in `caseIds`, absent from the project's case list) is preserved untouched — no DELETE call for it — since it can't be rendered as a row to toggle.
- [x] 3.6 Make 3.5 pass — the added/removed diff logic from design.md.

## 4. Retire the old components

- [x] 4.1 Delete `apps/web/src/components/CasePicker.tsx` and `CasePicker.test.tsx`.
- [x] 4.2 Delete `apps/web/src/components/SuiteDrawer.tsx` and `SuiteDrawer.test.tsx`.
- [x] 4.3 Update `apps/web/src/pages/SuitesPage.test.tsx` for the new creation/edit flows (remove assertions tied to the old modal/drawer).
- [x] 4.4 Update the stale comment in `apps/web/src/components/UserPicker.tsx` referencing `CasePicker.tsx`'s now-removed pattern.

## 5. Verification

- [x] 5.1 `npm -w apps/web run test:coverage` green, thresholds hold. (507 tests, 92.36% statements / 81.12% branches / 91% functions / 95.02% lines.)
- [x] 5.2 `npm -w apps/web run typecheck` and `npm -w apps/web run lint` clean.
- [x] 5.3 Manual verification against the live compose stack: full Playwright e2e suite (65/65) green against a fresh build, plus a manual browser pass creating a suite and editing the Sample Project's existing "Smoke" suite (4 real cases, correct pre-checked state, real tags/filters). The dogfood (TD) project only exists on the deployed fly.dev instance (populated by CI), not the local compose stack — verify there post-deploy instead.
- [x] 5.4 Update any e2e specs referencing the old "+ Add case…" modal or suite-creation flow (`apps/web/e2e/*.spec.ts`) to the new interactions. (`test-authoring.spec.ts`, `ui-navigation.spec.ts`.)
- [x] 5.5 Sync the `test-authoring` delta spec into `openspec/specs/test-authoring/spec.md`, then `openspec archive rework-suite-membership-ux --yes --skip-specs`.

## 6. Docs & showcase

- [x] 6.1 Update `docs/test-management.md`'s suite-creation/membership description to match the new flow. (Also updated a stale `SuiteDrawer` mention in `docs/architecture.md`.)
- [x] 6.2 No Sample-Project seed change needed — confirmed during 5.3: the Sample Project's existing suites (Smoke/Regression/Nightly/API Contract, varied membership) read well against the new UI as-is.
