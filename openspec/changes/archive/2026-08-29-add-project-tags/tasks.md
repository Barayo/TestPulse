## 1. Domain & migration

- [x] 1.1 Add migration `00008_project_tags.sql`: `tags (id, name UNIQUE NOT NULL, created_at)`, `project_tags (project_id, tag_id, created_at)` PK `(project_id, tag_id)`, FKs to `projects`/`tags` with `ON DELETE CASCADE` from the project side.
- [x] 1.2 Add `Tag` to `domain.go` (`ID`, `Name`) and `Tags []string` to `ProjectSummary`.

## 2. Store layer (TDD)

- [x] 2.1 Write failing store tests for `TagRepo`/`ProjectRepo` tag methods: `AssignTag` (creates the tag row if absent, case-insensitive reuse), `RemoveTag` (no-op if not assigned, leaves the vocabulary row in place), `ListTagNames` (full vocabulary, for the filter/picker). Watch them fail.
- [x] 2.2 Implement the store methods in `apps/api/internal/store/projects.go` (or a new `tags.go`) to pass. Confirm green.
- [x] 2.3 Write a failing test asserting `ListSummaries` includes each project's tag names via a fifth grouped query (no N+1), mirroring the existing favorites-ID-set assembly.
- [x] 2.4 Wire tags into `ListSummaries`'s assembly to pass. Confirm green.

## 3. Service layer (TDD)

- [x] 3.1 ~~Write failing service tests for permission enforcement~~ — discovered mid-implementation that `StarProject`/`UnstarProject` have no service-level tests either: permission enforcement is router-middleware-only (`requirePermission(PermRead, ...)`), verified at the HTTP layer. Following that precedent, permission coverage moves to task 4.2 instead of duplicating it here.
- [x] 3.2 Implement `AssignProjectTag`, `RemoveProjectTag`, `ListTagNames` in `service.go` to pass. Confirm green.

## 4. API layer (TDD) + contract

- [x] 4.1 Add `PUT /api/v1/projects/{key}/tags/{tagName}`, `DELETE /api/v1/projects/{key}/tags/{tagName}`, `GET /api/v1/tags` to `packages/shared/openapi.yaml`; add `tags: string[]` to the `ProjectSummary` schema. Run `make generate`.
- [x] 4.2 Write failing HTTP-level tests for the three new routes (assign, remove, list vocabulary, 403 for no-permission, tags present in `GET /projects/summaries`).
- [x] 4.3 Implement the handlers in `handlers.go` to pass. Confirm green.

## 5. Design mock (Pepe, before web code)

- [x] 5.1 Dispatched Pepe (Fable 5); mock at https://claude.ai/code/artifact/749893a6-97b5-43ee-8401-bb403d0c8a99. Pepe surfaced a real conflict (tag-edit permission bar is `read`, but the "edit form" it assumed lives at `ProjectSettingsPage`, which is `manageProject`-gated) and a sample-data scope gap (filter can't be showcased with one project) — both resolved via user sign-off before any web code: inline-on-card editing, tags-only showcase.

## 6. Web implementation (TDD)

- [x] 6.1 Write failing `ProjectsPage` tests for tag chips rendering in expanded view and no chips when untagged.
- [x] 6.2 Implement tag chips per the approved Pepe mock. Confirm green. (Also fixed `useProjectSummaries.ts`, which Pepe found was missing the `tags` mapping entirely.)
- [x] 6.3 Write failing tests for the compact-view filter-by-tag control, including composition with the existing status filter.
- [x] 6.4 Implement the filter control. Renders in both view modes (the filter row isn't view-mode-gated, matching status filters) per Pepe's mock, only when at least one project has a tag. Confirm green.
- [x] 6.5 Write failing tests for the tag picker (create form staging + inline card editing — per user decision after Pepe's mock, editing lives inline on the card, reachable at the `read` permission bar, not gated behind manageProject-only `ProjectSettingsPage`).
- [x] 6.6 Implement `TagChipsEditor` (`apps/web/src/components/TagChipsEditor.tsx`, reusable chip row + typeahead), `useTagVocabulary` hook, `CardTagEditor` (icon-button popover on both card views), and create-form staging. Confirm green.

## 7. Sample Project showcase

- [x] 7.1 Write failing `seed_test.go` assertion that the Sample Project carries at least one tag.
- [x] 7.2 Update `apps/api/internal/sampledata/seed.go` to assign a tag to the Sample Project. Confirm green.

## 8. Docs

- [x] 8.1 Document project tags (assignment, permission bar, filtering) in the relevant `docs/` project-management page. Done in `docs/api.md` (new routes + summaries field) and `docs/database.md` (`tags`/`project_tags` tables).
- [x] 8.2 ~~Update `ROADMAP.md`'s backlog entry for #28~~ — ROADMAP.md's own Backlog section explicitly doesn't enumerate individual backlog items ("Tracked as GitHub issues labeled backlog ... rather than here"); shipped status is reflected by closing GH issue #28 and moving its board card, not a ROADMAP.md edit.

## 9. Validate

- [x] 9.1 Run `make lint test coverage-api coverage-web` and fix any failures. Go: 80.9% (min 80%). Web: 92.24%/84.65%/90.25%/94.65% (min 80% all). `go vet`/`golangci-lint`/`oxlint`: 0 new issues. `tsc -b` (build-mode, catches more than `--noEmit` alone): clean.
- [x] 9.1b Local deploy + manual click-through (`docker compose build/up`, real browser) surfaced two real bugs `tsc --noEmit` and the test suite missed: (1) `useProjectSummaries.ts` never mapped the new `tags` field at all — traced back to task 6.2, fixed then; (2) both new popovers (`TagFilterControl`, `CardTagEditor`) were `position: absolute` inside overflow-clipped ancestors (the filter row's `overflow-x-auto`, the card's `overflow-hidden`) and rendered invisible/clipped in the real browser despite passing in jsdom. Fixed by portaling both to `document.body` via a new `useFloatingPosition` hook (TDD, own test file), positioned with viewport-relative `fixed` coordinates. Verified in-browser: tag chips, tag filter (with counts, clear, composes with status filter), inline card tag add/remove, and create-form tag staging all work end-to-end.
- [x] 9.2 Added 2 new e2e scenarios to `apps/web/e2e/ui-navigation.spec.ts`'s "Project list with permission-ready create action" describe block (tag chips, tag filter) and ran the full file directly against the running compose stack (`npx playwright test e2e/ui-navigation.spec.ts`, 70/70 passed, twice in a row for stability). Caught and fixed a real test-isolation bug: the tag-chip assertion searched the whole page for exact text "mobile," which broke once a second run left a second "mobile"-tagged project in the persistent dev DB — fixed by scoping to the specific project's own card. **Not done**: the corresponding TD-102/TD-103 dogfood case records (per the standing "sync e2e specs to the TD project" rule) — flagged to the user, not fabricated without real access to that project.
- [x] 9.3 `openspec validate --all --strict` — 29 passed, 0 failed.
