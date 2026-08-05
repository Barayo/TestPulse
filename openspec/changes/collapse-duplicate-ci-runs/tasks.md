## 1. Imported runs are created closed

- [x] 1.1 Write a failing test in `apps/api/internal/store/runs_test.go` (or
      the existing DB-integration suite for `RunRepo.Import`) asserting
      that a run created via `RunRepo.Import` has `status = 'closed'`.
      Confirm it fails against current behavior (default `open`).
- [x] 1.2 Write a failing test in
      `apps/api/internal/service/execution_import_test.go` asserting that
      `Service.Import`'s returned run has `Status ==
      domain.RunStatusClosed`. Confirm it fails.
- [x] 1.3 Change `RunRepo.Import`'s insert (`apps/api/internal/store/runs.go`)
      to explicitly set `status = 'closed'` instead of relying on the
      table default. Make both tests pass.
- [x] 1.4 Verify `ReopenRun` still works unmodified against an
      import-created run (existing reopen tests should already cover this
      via `manageProject`; add one if the existing suite only exercises
      `CreateRun`-created runs).

## 2. CI supplies a real per-commit run name

- [x] 2.1 Update `.github/workflows/ci.yml`'s "Report results to dogfood
      instance" step: add an `env:` block (`COMMIT_SHA: ${{ github.sha
      }}`, `COMMIT_MSG: ${{ github.event.head_commit.message }}`), build
      `name="main @ ${COMMIT_SHA:0:7} — $(printf '%s' "$COMMIT_MSG" | head
      -1)"` as a shell variable, and add it to the existing `jq -n` call
      (`--arg name "$name"`, `name: $name`) alongside `format`/`report`.
      Use env-var indirection, not direct `${{ }}` interpolation into the
      shell script, to avoid a commit-message injection vector.
- [ ] 2.2 Manual verification task (not automatable): after this merges to
      `main`, observe the next CI run's "Report results to dogfood
      instance" step and confirm the resulting run on
      `testpulse.fly.dev/projects/TD/runs` is named `main @ <sha> —
      <subject>` and lands in Closed, not Open.

## 3. Documentation corrections

- [x] 3.1 Update `packages/shared/openapi.yaml`'s `Run.status` description
      (and regenerate via `make generate` if the description is
      duplicated in generated TS) to state the import-time exception:
      created `open` via `POST /runs`, created `closed` via import.
- [x] 3.2 Update `apps/api/internal/domain/domain.go`'s `RunStatus` doc
      comment to match.
- [x] 3.3 Update `docs/importing-results.md` to document that imported
      runs are created closed, and that a request merging multiple test
      suites into one report should supply an explicit `name`.
- [x] 3.4 Update `docs/test-management.md`'s Runs section to note that CI
      imports land directly in Closed.
- [x] 3.5 Update `docs/api.md` if it separately documents `Run.status` or
      the import endpoint's behavior.

## 4. Sample Project showcase

- [x] 4.1 In `apps/api/internal/sampledata/seed.go`, seed at least one run
      via the import path (`Service.Import`, not `CreateRun`) with a
      commit-style name, so the Sample Project demonstrates the
      closed-by-default, correctly-named import behavior rather than the
      old bug.
- [x] 4.2 Update `apps/api/internal/sampledata/seed_test.go` to assert the
      seeded imported run is closed and carries the expected name.

## 5. Follow-up (not part of this change's automated scope)

- [ ] 5.1 After this change ships, manually close the known pre-fix
      stuck-open runs on `testpulse.fly.dev` (the ~25 runs named after
      `delete-mode.spec.ts` or similar) via the existing Close action, or
      a narrowly-scoped one-off ops script matching their known pre-fix
      names — run once, not committed as a migration.
