## Why

Surfaced alongside the execution-import work (2026-07-15) but independent
of it: a case currently has no way to record what platform it targets,
what kind of test it is (unit/integration/e2e/…), or whether it's
automated versus manual — classification that matters for both
hand-authored and imported cases alike, and doesn't depend on the import
pipeline at all.

## What Changes

- `TestCase` gains three optional classification fields: `platform`,
  `testType`, and `automated` (boolean). All settable at creation or
  updated later, same as description/tags/priority already work.
- `platform` and `testType` are free text, not fixed enums — testing
  taxonomies vary too much across teams to lock into one list (unlike
  `priority`, which already has a deliberately small, fixed set).
- **Scope expanded post-implementation (2026-07-15):** the backend half
  landed first with UI deliberately deferred, matching how `priority`
  and `tags` already existed as API-only fields. The user flagged that
  this left all five fields (the three new ones plus the two pre-existing
  ones) unreachable by anyone using the actual product — so this change
  now also adds `platform`/`testType`/`automated`/`priority`/`tags`
  controls to the case authoring drawer (`CaseDrawer.tsx`), both for
  creating and editing a case. Fixing this surfaced a related latent bug:
  editing a case via the UI only ever sent `{title, steps}` to
  `PUT /api/v1/cases/{id}`, which replaces a case's entire content —
  silently resetting `priority` to its default and `tags`/`description`/
  `expectedResult` to empty on every edit made through the UI. The edit
  path now preserves `description` and `expectedResult` (still no UI for
  those two) instead of discarding them.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `test-authoring`: the "Test case creation" requirement's schema gains
  `platform`, `testType`, and `automated`; a new requirement covers
  editing/creating with all five classification fields via the UI, and
  editing no longer discards `description`/`expectedResult`.

## Impact

- `apps/api/internal/domain/domain.go` — `CaseContent` gains `Platform`,
  `TestType string`, `Automated bool`.
- `packages/shared/openapi.yaml` — case create/update schemas gain the
  three fields.
- `apps/api/internal/db/migrations/` — amend the existing cases-related
  migration in place (pre-1.0 policy).
- No new endpoints — reuses the existing case create/update API.
- `apps/web/src/components/CaseDrawer.tsx` — gains Priority (select),
  Tags (comma-separated text), Platform, Test type, and Automated
  (checkbox) fields, shown in both create and edit modes and displayed
  as badges/labels in read-only view mode.
- `apps/web/src/pages/FolderExplorerPage.tsx` — `createCase`/`saveCaseEdit`
  thread the five fields through to the API; `saveCaseEdit` now merges
  onto the case's existing `description`/`expectedResult` rather than
  dropping them.
