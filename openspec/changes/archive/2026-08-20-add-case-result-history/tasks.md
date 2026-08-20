## 1. Backend: bounded, recency-ordered executions query

- [x] 1.1 Write a failing store test for `RunRepo.ExecutionsByCaseRecent(ctx, caseID, limit)`: given executions across multiple runs including a restored older version with a recent timestamp, asserts strict `created_at DESC` order (not version order) and that only `limit` rows are returned.
- [x] 1.2 Implement `ExecutionsByCaseRecent` in `apps/api/internal/store/runs.go` (`ORDER BY created_at DESC LIMIT $2`), verify the test passes. Leave the existing `ExecutionsByCase` query untouched.
- [x] 1.3 Write a failing service test for `Service.RecentCaseExecutions(ctx, caseID, limit)` (thin passthrough) and for limit validation (reject `limit <= 0` and `limit > 50`).
- [x] 1.4 Implement `Service.RecentCaseExecutions` in `apps/api/internal/service/service.go`, verify tests pass.

## 2. Backend: API contract

- [x] 2.1 Add `order` (enum: unset, `recent`) and `limit` (integer) query params to `GET /api/v1/cases/{caseKey}/executions` and `GET /api/v1/public/cases/{caseKey}/executions` in `packages/shared/openapi.yaml`, documenting that `limit` requires `order=recent`. Run `make generate`, confirm no unrelated client drift.
- [x] 2.2 Write a failing HTTP-level test (`apps/api/internal/server/api_more_test.go`, alongside the existing `TestScenario_CaseExecutionsGroupedByVersionOverHTTP`) covering: `order=recent&limit=N` returns recency-ordered, capped results; `limit` without `order=recent` is rejected; `limit` above the max is rejected; omitting both params preserves today's existing version-grouped behavior unchanged.
- [x] 2.3 Update `apps/api/internal/server/handlers.go`'s `listCaseExecutions` to parse the new query params and branch to `RecentCaseExecutions` when `order=recent`, otherwise keep calling `CaseExecutions` as today. Verify the test from 2.2 passes. No change needed to `public_handlers.go` — it already routes to the same handler function.

## 3. Frontend: extend Verdict vocabulary

- [x] 3.1 Write a failing `CaseResultsPanel.test.tsx` case asserting a `blocked` execution renders with `--chart-4` and a `retest` execution renders with the same diagonal-texture treatment `RunStatusBreakdown.tsx` uses, and a `pending` execution renders with `--chart-5` — none of which the current 3-value `Verdict` type can express.
- [x] 3.2 Extend `Verdict`, `VERDICT_COLOR`, and `VERDICT_LABEL` in `apps/web/src/components/CaseResultsPanel.tsx` to all 6 `Status` values, reusing `RunStatusBreakdown.tsx`'s existing retest-texture constant rather than redefining it. Verify tests pass.

## 4. Frontend: accessibility fix while in this file

- [x] 4.1 Write a failing test asserting each result bar is reachable via `Tab` and exposes an accessible name (verdict + date) via `aria-label`.
- [x] 4.2 Change each bar from `<span>` to `<button type="button">` (no `onClick`, same classes, `title` retained, `aria-label` added). Verify tests pass.

## 5. Frontend: wire CaseDetailPage to real data

- [x] 5.1 Write a failing `CaseDetailPage.test.tsx` case: given a case with recorded executions, the Results section shows a computed success rate, one bar per execution (most recent last, matching `CaseResultsPanel`'s existing `data.recent` order), and the correct "Last run" date — instead of today's always-empty state.
- [x] 5.2 In `apps/web/src/pages/CaseDetailPage.tsx`, fetch the case's last 7 executions via the new `order=recent&limit=7` query, compute `successRate` (pass count / window size) and `lastRunAt` from the response, and pass them as `CaseResultsPanel`'s `data` prop. Verify the test from 5.1 passes; verify the existing empty-state test (no executions) still passes unchanged.
- [x] 5.3 Add an E2E scenario to `apps/web/e2e/test-execution.spec.ts` (or a new spec, matching this change's `ui-navigation` delta spec scenario "Results section shows recent execution history"): record a couple of results against a case, then verify its detail page's Results section shows a non-empty success rate and bars, mapped to `Requirement: Viewing an existing test case`.

## 6. Docs and Sample Project

- [x] 6.1 Update `docs/test-management.md`'s case detail section to describe the now-populated Results panel (success rate, recent-execution bars, legend) instead of only documenting the empty state.
- [x] 6.2 Check `apps/api/internal/sampledata/seed.go`: confirm at least one seeded case (the existing flaky "login" case is the natural candidate, already has 6 mixed pass/failed executions across its nightly-suite runs) has enough execution history to showcase the populated Results panel meaningfully. If none of the seeded verdicts exercise `skipped`/`blocked`/`retest`, adjust one seeded run's verdicts so the sample project also shows the full color vocabulary, not just pass/fail. Update `internal/sampledata/seed_test.go` to match.

## 7. Verification

- [x] 7.1 Run `make coverage-api` and `make coverage-web`, confirm both remain ≥ 80%.
- [x] 7.2 Rebuild and redeploy the local compose stack; click through the case detail page for the seeded flaky case in both light and dark themes, confirming the Results section renders correctly before calling this change done.
