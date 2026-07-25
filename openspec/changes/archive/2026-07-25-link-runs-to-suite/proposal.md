## Why

Suite-level reporting (pass-rate trends, run comparisons) needs to answer
"which runs came from this suite?" — but that link doesn't exist today. A
suite is only ever a *source* for populating a run's items at creation
(`add-core-domain` design D6); once a run exists, nothing records which
suite (if any) it was built from. This is the blocking prerequisite named in
GitHub issue #11's own scope note and split out as issue #75 so it can land
and be tested independently before any chart work depends on it.

## What Changes

- A run now records the suite it was created from, as an optional
  (nullable) reference — a run created without a suite (ad hoc, or via
  JUnit-XML import) has none.
- The run's `suiteKey` is exposed on the Run resource in the API/UI (no new
  screen — this change is domain/schema/API groundwork only).
- Amend the existing runs table migration in place, per the pre-1.0
  migration policy — no stacked `000N_*.sql` file.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `test-execution`: "Run creation pins case versions" gains a scenario — a
  run created from a suite records that suite's key; a run created without
  one has no suite reference.

## Impact

- `apps/api/internal/domain/domain.go` — `Run` struct gains a
  `SuiteKey *string` field (nullable).
- `apps/api/internal/db/migrations/` — amend the runs table migration to add
  a nullable `suite_id` (or `suite_key`) column/FK.
- `apps/api/internal/store/runs.go` — run creation and read queries updated
  to persist/select the suite reference.
- `apps/api/internal/service/` — `CreateRun` passes the source suite through
  when one was used.
- `packages/shared/openapi.yaml` — `Run` schema gains `suiteKey` (nullable);
  regenerate shared types via `make generate`.
- No web UI changes — this change has no user-visible surface on its own
  (exempt from the Sample-Project-showcase task per CLAUDE.md's standing
  rule for purely internal/infra groundwork with no new user-visible
  behavior).
