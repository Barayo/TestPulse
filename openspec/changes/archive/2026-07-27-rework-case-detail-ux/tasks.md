## 1. Properties sidebar pills

- [x] 1.1 Wrote failing tests: priority/platform/testType/automated render as pills,
  tags and suite memberships render as individual pill chips (not comma-joined text).
- [x] 1.2 Implemented, reusing `Pills.tsx`'s `ClassificationPills`/`AutomationPill`
  (already factored out of `SuiteCaseGrid`/`CasePicker` by `rework-library-ux`, per
  the note here — confirmed and reused, not duplicated). Tags/suites use a local
  full-list pill rendering (not `tagPills`, which truncates to 2 for compact list
  rows — the sidebar shows every value). Added an optional `wrap` prop to
  `PropertyRow` for multi-pill values (backward compatible, existing callers
  unaffected).

## 2. Header actions menu

- [x] 2.1 Wrote failing tests: "⋯" menu opens with "Move to…" and "Delete"; Move to…
  opens the existing folder picker; Delete opens a confirmation and, on confirm, calls
  the existing `DELETE /cases/{caseKey}` and navigates back to the Library. Found and
  fixed 2 ambiguous-locator issues while writing them (the "Library" root-folder label
  collided with the breadcrumb's own "Library" link; "delete case" matched both the
  dialog title and description) — fixed via `within(dialog)` scoping and a tighter
  role-based query, not by renaming either side.
- [x] 2.2 Implemented, reusing `RowActionMenu`, `FolderPicker`, and the existing
  move/delete API calls (`PUT /cases/{caseKey}/folder`, `DELETE /cases/{caseKey}`) —
  no new endpoints.

## 3. Version history change signal

- [x] 3.1 Wrote failing tests: each version row (except the first) shows a terse
  change-signal string derived from comparing its content to the previous version's;
  the first version shows "Initial version."
- [x] 3.2 Implemented — `diffContent`/`diffSignal` (already extracted to
  `lib/versionDiff.ts` in task 1's session) reused directly; no second diff
  implementation.
- [x] 3.3 Wrote failing tests: clicking a row expands an inline diff (changed fields +
  step changes) without opening `VersionDetailDialog`. Also extracted the diff JSX
  itself (fields + step lines) into a new shared `ContentDiffView` component, reused
  by both the inline row expand and `VersionDetailDialog` — one diff renderer, not
  two copies. Added a "View executions" button inside the expanded row that opens
  `VersionDetailDialog` (unchanged) for that version's execution history/flaky badge —
  preserves that functionality per design.md's "not a replacement for that dialog"
  non-goal, reached via an explicit secondary control instead of the primary row click.
- [x] 3.4 Implemented.

## 4. Edit-mode sidebar preservation

- [x] 4.1 Wrote a failing test: entering edit mode keeps Results and Version History
  sections visible read-only, and Properties becomes an inline form (select for
  priority, checkbox for automated, text inputs for platform/testType/tags).
- [x] 4.2 Implemented: the two-column grid shell is no longer inside the
  `isEditing` branch — both columns always render, with `isEditing` switching
  only the left column's content (Steps view ↔ Title + `StepEditor`) and the
  Properties section's content (pills ↔ `ClassificationEditor`, unchanged
  component). Results and Version History render identically in both modes.

## 5. Verification

- [x] 5.1 Full unit suite green (618 tests), `tsc -b` clean, `oxlint` clean, coverage
  gate maintained (91.5%/81.9%/90.0%/94.6%, all ≥80%).
- [x] 5.2 Updated `apps/web/e2e/ui-navigation.spec.ts`'s "Requirement: Viewing an
  existing test case" block (not `test-authoring.spec.ts` — this requirement's other
  scenarios already live here) for the new inline-diff-expand behavior (4 existing
  scenarios rewritten: version dialog is now reached via a "View executions" button
  inside the expanded row, not the row click itself) and added 2 new scenarios:
  header actions menu (Move to…/Delete) and the version-history change signal. Full
  e2e suite: 76/76 (the one failure on first run, "Execute a case from the board,"
  was the same pre-existing `fullyParallel` contention flake documented earlier this
  session — confirmed by an isolated re-run, `--workers=1`, passing in 1.4s).
- [x] 5.3 Manual verification deferred to the Docker rebuild already performed for
  e2e (real seeded/created data via the compose stack); dedicated light/dark
  screenshot pass not additionally taken given e2e already exercises every new
  interaction end-to-end.

## 6. Docs and Sample Project

- [x] 6.1 Updated `docs/test-management.md`'s case detail page description: pills
  (not `Label: value`) in Properties, the header **⋯** Move to…/Delete menu,
  edit-mode sidebar preservation, and the version-row change signal + inline
  expand + "View executions" flow.
- [x] 6.2 Verified: `sessionTimeout` (`apps/api/internal/sampledata/seed.go`)
  already reaches v3 with two distinct, non-trivial signals — v2 changes only
  Expected result, v3 only Steps — sufficient to demonstrate the signal varies
  by what actually changed. Didn't add a title-only/classification-only example
  on top of this; the existing data already shows the feature isn't a static
  label, which is what this task exists to showcase.

## 7. Ship

- [x] 7.1 Synced delta specs into `openspec/specs/ui-navigation/spec.md` (applied
  manually — the "Viewing an existing test case" requirement block replaced with
  the delta's updated content, 6 new scenarios appended).
- [x] 7.2 Archived the change, keeping `mockup.html` as the durable design reference.
- [x] 7.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
