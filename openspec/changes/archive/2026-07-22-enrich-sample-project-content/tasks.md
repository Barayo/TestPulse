## 1. Extend the failing tests first

- [x] 1.1 In `apps/api/internal/sampledata/seed_test.go`, raise the existing minimums: at least 5 sections (folders beyond root), at least 4 suites, enough cases to cover all 4 `Priority` values
- [x] 1.2 Add a new failing test: at least one case's `GET /cases/{caseKey}/executions`-equivalent (`svc.ExecutionsByCase` or however the service exposes it — check current method name) includes both a `pass` and a `failed`/`blocked` result for the same `CaseVersion`
- [x] 1.3 Add a new failing test: the chronologically last-created run (`ListRuns` returns newest first — check ordering) has a pass rate of at least 85% (compute from its items' `currentStatus`)
- [x] 1.4 Confirm all new/extended assertions fail against the current (smaller) seed content
      (Confirmed: section/suite/case-count/multi-version assertions failed as expected; the flaky-signal assertion already passed incidentally against the old content — not forced to fail, since TDD's purpose there is satisfied by the seed change making it a deliberate guarantee rather than an accident.)

## 2. Grow the seeded content

- [x] 2.1 Add 3 more sections (e.g. Settings, Notifications, Reporting API) alongside the existing Authentication/Checkout, each with a mix of `Filler`-generated bare cases and a few hand-authored cases carrying full classification fields
- [x] 2.2 Ensure across all cases: every `Priority` value (`low`/`medium`/`high`/`critical`) appears multiple times; `platform` spans web/mobile/api/desktop; `testType` spans functional/e2e/api/regression; `automated` is mixed true/false
- [x] 2.3 Add 2 more suites (e.g. Nightly, API Contract) grouping cases across the new sections, alongside the existing Smoke/Regression
- [x] 2.4 Pick one case and deliberately make it flaky: include its pinned version in 2+ runs with different verdicts, with no edit to the case in between
- [x] 2.5 Add a second multi-version case example (edited twice, reaching version 3), alongside the existing single-edit example
- [x] 2.6 Add more runs (past sign-offs, etc.), ordering creation so the run created last has ≥85% pass rate; keep the existing closed-run and JUnit-XML-import demonstrations, expanding the import report to draw from the larger case pool while keeping at least one unmatched case
- [x] 2.7 Confirm all tests from section 1 pass
      (Also discovered `Filler`'s Spanish-only "caso" title hardcoding would have looked wrong mixed into the English Sample Project — generalized it to take a `noun` parameter and updated all `cmd/seed-demo` call sites to pass "caso", verified seed-demo's own output is unchanged.)

## 3. Verification

- [x] 3.1 `go vet`, `golangci-lint run`, `make coverage-api` (≥80%) all green
- [x] 3.2 Manual end-to-end check against the compose stack: `docker compose down -v` then fresh `up --build`; confirm the enlarged Sample Project appears with the expected section/case/suite/run counts; note startup wall-clock time and flag if it's become noticeably slow (seconds, not sub-second); open a flaky case's version detail in the UI and confirm the "Flaky" badge actually renders
      (Seeding took ~105ms end to end, no concern. Verified live in the browser: project list shows "Sample" badge + "Healthy" pill at 90% pass rate, 4 suites/29 cases; SP-8's version detail dialog shows the real "Flaky" badge with all 6 mixed pass/failed executions listed.)
- [x] 3.3 `make e2e` still green — the larger seed must not break any existing e2e scenario running against the shared compose stack

## 4. Spec sync

- [x] 4.1 Confirm `openspec validate enrich-sample-project-content --strict` passes
