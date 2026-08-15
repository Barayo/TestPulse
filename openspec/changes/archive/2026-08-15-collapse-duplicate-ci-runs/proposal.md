## Why

As a QA lead, when I open the dogfood project's Runs page, I want to see the
runs someone is actually working on, instead of scrolling past dozens of
near-identical automated entries. Right now the Open section is flooded
with CI-imported runs, and both the naming and the lifecycle are wrong at
the source: CI's dogfood report step posts one import per push containing
the whole merged test suite, but sends no `name`, so the import falls back
to the JUnit report's first `<testsuite>` name — alphabetically
`delete-mode.spec.ts` — regardless of what the run actually contains.
Worse, imported runs are never closed, so every one of them piles up
permanently in the Open section, the one a QA lead scans first.

## What Changes

- CI's "Report results to dogfood instance" step (`.github/workflows/ci.yml`)
  now sends an explicit per-commit `name` (`main @ <short-sha> — <commit
  subject>`) with every import, instead of leaving the report to fall back
  to an arbitrary spec-file name.
- Runs created via bulk import (`POST /imports`) are now created `closed`
  instead of inheriting the `open` default — an imported run is a finished
  snapshot by definition, every item already carries a final verdict at
  creation time. `ReopenRun` remains the existing escape hatch if one needs
  further work.
- `Run.status` documentation (OpenAPI description, `RunStatus` Go doc
  comment) is corrected to state the import-time exception precisely.
- No new schema, no new UI component: the existing Runs page's Closed
  section (from the already-shipped `group-runs-by-status` change) was
  already built to hold dozens of automated runs at this volume — this
  change routes CI noise into the section designed for it, correctly named,
  instead of leaving it stuck in Open under a repeated file name.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `execution-import`: bulk-imported runs are now created `closed`, not
  `open`; the run's default name derivation still falls back to the
  report's own `<testsuite>` name when the request supplies none, but
  callers that merge multiple suites into one report (like CI) are expected
  to supply an explicit name rather than rely on that fallback.
- `test-execution`: the "Run open/closed lifecycle" requirement's "runs are
  created open" statement is scoped to runs created via `POST /runs` —
  imported runs are the one exception, created `closed` per
  `execution-import`.

## Impact

- `.github/workflows/ci.yml` — dogfood report step gains a computed `name`.
- `apps/api/internal/store/runs.go` — `RunRepo.Import`'s insert sets
  `status = 'closed'` explicitly.
- `apps/api/internal/service/execution_import_test.go` — new assertion on
  imported run status.
- `packages/shared/openapi.yaml`, `apps/api/internal/domain/domain.go` —
  doc-comment corrections, no schema change.
- `docs/importing-results.md`, `docs/test-management.md`, `docs/api.md` —
  document the closed-by-default import behavior and name derivation.
- `apps/api/internal/sampledata/seed.go` — seed a run via the import path
  demonstrating the closed-by-default, commit-named behavior.
- No migration for the ~25 existing mislabeled/stuck-open runs already on
  `testpulse.fly.dev`; a manual one-time cleanup is called out as a
  follow-up task, not part of this change's automated scope.
- No changes to `apps/web/src/pages/RunsPage.tsx` — the existing Closed
  section design already handles this volume and shape of data.
