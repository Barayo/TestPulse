## 1. Schema

- [x] 1.1 Amend `00002_core_domain.sql`'s `test_runs` table in place: add `suite_id uuid NULL REFERENCES test_suites (id) ON DELETE SET NULL`.

## 2. Domain & store — TDD

- [x] 2.1 Write failing store test: `RunRepo.Create` with a suite ID persists `suite_id`; `Get`/`List` return the suite's key as `SuiteKey`. Watch it fail (compile error is acceptable as the "fail" for a new field/param, per the store package's existing convention — confirm the test fails for the right reason, not a typo).
- [x] 2.2 Add `SuiteKey *string` to `domain.Run`. Update `RunRepo.Create`/`Import`/`Get`/`List` SQL (INSERT + `LEFT JOIN test_suites` for the SELECTs) and `Scan()` calls. Make 2.1 pass.
- [x] 2.3 Write failing store test: `CreateRun`'s `RunInput.SuiteID` (already threaded through in `service.go`) is passed down to `RunRepo.Create` and lands in the returned run's `SuiteKey`. Watch it fail.
- [x] 2.4 Wire `Service.CreateRun` to pass `in.SuiteID` to `store.Runs.Create`. Make 2.3 pass.
- [x] 2.5 Write failing store test: deleting a suite (direct SQL `DELETE FROM test_suites WHERE id = $1` in the test — no service-level suite-delete exists yet) leaves a run created from it intact with `SuiteKey` now `nil`. Watch it fail, then confirm the `ON DELETE SET NULL` constraint from 1.1 makes it pass with no code change needed.

## 3. API contract

- [x] 3.1 Add `suiteKey` (nullable string) to the `Run` schema in `packages/shared/openapi.yaml`, with a description matching the pattern of `RunItem.caseKey`/`CaseExecution.runKey`.
- [x] 3.2 `make generate` to regenerate shared TS types; `make lint`/CI drift check must pass clean.

## 4. Verification

- [x] 4.1 `make test-api` (or the equivalent Go test command) green, coverage gate (`internal/...` ≥ 80%) holds.
- [x] 4.2 `make lint` clean (Go vet + web typecheck/lint, since shared types changed).
- [x] 4.3 Sync the `test-execution` delta spec into `openspec/specs/test-execution/spec.md`, then `openspec archive link-runs-to-suite --yes --skip-specs`.

## 5. Docs & showcase

- [x] 5.1 No docs update needed — this change has no user-visible behavior or configuration surface (confirm `docs/test-management.md` doesn't reference a run's suite provenance anywhere that would now be stale).
- [x] 5.2 No Sample Project showcase task — purely internal domain/schema groundwork with no new user-visible functionality, per CLAUDE.md's exemption for infra-only changes. (#77, which renders this data, gets its own showcase task.)
