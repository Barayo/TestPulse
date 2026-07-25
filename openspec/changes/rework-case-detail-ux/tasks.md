## 1. Properties sidebar pills

- [ ] 1.1 Write failing tests: priority/platform/testType/automated render as pills,
  tags and suite memberships render as individual pill chips (not comma-joined text).
- [ ] 1.2 Implement, reusing `SuiteCaseGrid`'s pill classes/components (extract shared
  if `rework-library-ux` has already factored them out by the time this starts — check
  before duplicating).

## 2. Header actions menu

- [ ] 2.1 Write failing tests: "⋯" menu opens with "Move to…" and "Delete"; Move to…
  opens the existing folder picker; Delete opens a confirmation and, on confirm, calls
  the existing `DELETE /cases/{caseKey}` and navigates back to the Library.
- [ ] 2.2 Implement, reusing `RowActionMenu` and the existing move/delete handlers
  already used by `FolderExplorerPage`'s `CaseRow` — no new endpoints.

## 3. Version history change signal

- [ ] 3.1 Write failing tests: each version row (except the first) shows a terse
  change-signal string derived from comparing its content to the previous version's;
  the first version shows "Initial version."
- [ ] 3.2 Implement — extract the diff logic shared with `VersionDetailDialog.tsx`'s
  `SCALAR_FIELDS`/step comparison into a reusable helper rather than duplicating it.
- [ ] 3.3 Write failing tests: clicking a row expands an inline diff (changed fields +
  step changes) without opening `VersionDetailDialog`.
- [ ] 3.4 Implement.

## 4. Edit-mode sidebar preservation

- [ ] 4.1 Write failing tests: entering edit mode keeps Results and Version History
  sections visible read-only, and Properties becomes an inline form (select for
  priority, checkbox for automated, text inputs for platform/testType/tags).
- [ ] 4.2 Implement.

## 5. Verification

- [ ] 5.1 Full unit suite green, coverage gate maintained.
- [ ] 5.2 Update `apps/web/e2e/test-authoring.spec.ts` for the header actions menu and
  version-history change signal; full e2e suite green.
- [ ] 5.3 Manual verification against `docker compose` with real seeded data (a case
  with 3+ versions, light + dark theme), matching `mockup.html`'s interactions.

## 6. Docs and Sample Project

- [ ] 6.1 Update `docs/test-management.md`'s case detail page description.
- [ ] 6.2 Verify the Sample Project has at least one case with 3+ versions showing
  varied changes (title-only, classification-only, steps) to demonstrate the change
  signal; add if missing.

## 7. Ship

- [ ] 7.1 Sync delta specs into `openspec/specs/ui-navigation/spec.md`
  (`/opsx:sync-specs rework-case-detail-ux`).
- [ ] 7.2 Archive the change, keeping `mockup.html` as the durable design reference.
- [ ] 7.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
