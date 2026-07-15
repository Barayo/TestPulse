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

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `test-authoring`: the "Test case creation" requirement's schema gains
  `platform`, `testType`, and `automated`.

## Impact

- `apps/api/internal/domain/domain.go` — `CaseContent` gains `Platform`,
  `TestType string`, `Automated bool`.
- `packages/shared/openapi.yaml` — case create/update schemas gain the
  three fields.
- `apps/api/internal/db/migrations/` — amend the existing cases-related
  migration in place (pre-1.0 policy).
- No new endpoints — reuses the existing case create/update API.
