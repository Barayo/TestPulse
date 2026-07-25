## 0. Design validation (blocks everything else)

- [ ] 0.1 User reviews the Fable-5-drafted interactive HTML mockup (create + edit screens) before any real component work starts. Revise the mockup, not real code, if changes are requested.

## 1. Shared component — TDD

- [ ] 1.1 Write failing component tests for `SuiteCaseGrid`: renders one row per case with a checkbox; toggling a checkbox calls `onToggle` with the right case ID; a case whose ID is in `selected` renders checked.
- [ ] 1.2 Build `SuiteCaseGrid` to make 1.1 pass — controlled `selected: Set<string>` / `onToggle: (id: string) => void` props, internal filter state (tag/priority/platform/testType/text search) per design.md.
- [ ] 1.3 Write failing test: applying a filter hides non-matching rows but does not change `selected` (toggle a case, filter it out of view, assert `selected` still contains its ID).
- [ ] 1.4 Make 1.3 pass.
- [ ] 1.5 Write failing test: Platform and Test Type filter dropdowns list exactly the distinct non-empty values present in the `cases` prop (not a fixed enum) plus an "All" option.
- [ ] 1.6 Make 1.5 pass.
- [ ] 1.7 Write failing test: a filter combination matching zero cases renders an explicit empty state (not just an empty list).
- [ ] 1.8 Make 1.7 pass.
- [ ] 1.9 Write failing test: a persistent selection-count element reflects `selected.size` and updates as toggles happen, independent of the current filter's visible row count.
- [ ] 1.10 Make 1.9 pass.

## 2. Suite creation — TDD

- [ ] 2.1 Write failing test: `SuitesPage`'s creation form renders the name field and `SuiteCaseGrid` together (mode: create); submit is disabled until the name is non-empty.
- [ ] 2.2 Wire the creation form: on submit, `POST /projects/{projectKey}/suites` then `PUT /suites/{suiteKey}/cases/{caseKey}` for each selected case (parallel, per design.md). Make 2.1 pass.
- [ ] 2.3 Write failing test: after a successful creation with N cases checked, the new suite's `caseIds` (from the reloaded suites list) has length N.
- [ ] 2.4 Make 2.3 pass; reset the creation form (name + selection) after success.

## 3. Suite membership editing — TDD

- [ ] 3.1 Write failing test: opening an existing suite (replacing `SuiteDrawer`'s open trigger, including the `#suite-{key}` URL-hash deep link — carry that over, don't regress it) renders `SuiteCaseGrid` (mode: edit) pre-checked with the suite's current `caseIds`.
- [ ] 3.2 Build the edit view. Make 3.1 pass.
- [ ] 3.3 Write failing test: "Save changes" is disabled when the checked set equals the original membership, enabled once it differs.
- [ ] 3.4 Make 3.3 pass.
- [ ] 3.5 Write failing test: saving with 1 unchecked + 2 newly checked cases issues exactly 1 `DELETE` and 2 `PUT` calls (mock the API layer), and no calls for unchanged members.
- [ ] 3.6 Make 3.5 pass — the added/removed diff logic from design.md.

## 4. Retire the old components

- [ ] 4.1 Delete `apps/web/src/components/CasePicker.tsx` and `CasePicker.test.tsx`.
- [ ] 4.2 Delete `apps/web/src/components/SuiteDrawer.tsx` and `SuiteDrawer.test.tsx`.
- [ ] 4.3 Update `apps/web/src/pages/SuitesPage.test.tsx` for the new creation/edit flows (remove assertions tied to the old modal/drawer).
- [ ] 4.4 Update the stale comment in `apps/web/src/components/UserPicker.tsx` referencing `CasePicker.tsx`'s now-removed pattern.

## 5. Verification

- [ ] 5.1 `npm -w apps/web run test:coverage` green, thresholds hold.
- [ ] 5.2 `npm -w apps/web run typecheck` and `npm -w apps/web run lint` clean.
- [ ] 5.3 Manual verification against the live compose stack: exercise creation and editing against the Sample Project and the dogfood (TD) project's existing suites (both have real, varied membership already) — confirm no regressions in either.
- [ ] 5.4 Update any e2e specs referencing the old "+ Add case…" modal or suite-creation flow (`apps/web/e2e/*.spec.ts`) to the new interactions.
- [ ] 5.5 Sync the `test-authoring` delta spec into `openspec/specs/test-authoring/spec.md`, then `openspec archive rework-suite-membership-ux --yes --skip-specs`.

## 6. Docs & showcase

- [ ] 6.1 Update `docs/test-management.md`'s suite-creation/membership description to match the new flow.
- [ ] 6.2 No Sample-Project seed change needed — existing suites already demonstrate varied membership; just confirm during 5.3 that they still read well.
