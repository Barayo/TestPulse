## Why

The case detail page's "Version history" (`redesign-case-detail-page`) is currently just a
list of version numbers and dates — useful for confirming a version exists, useless for
understanding *what changed* or *whether a change caused problems*. Two gaps raised during
that page's design review (issues #54, #55) turn out to be cheap: `GET
/api/v1/cases/{id}/versions` already returns each version's full content, and `RunItem`
already pins the version it ran against (`CaseVersion int`, `apps/api/internal/domain/domain.go`)
— neither needs new data collected, only a surface that shows what's already captured.

## What Changes

- Clicking a version in the Version history list opens a dedicated dialog showing a
  **field-by-field diff against the previous version**: title, description, expected result,
  classification fields (priority/tags/platform/testType/automated), and steps (added/removed/
  changed by index). Unchanged fields are omitted from the diff, not shown as noise. The
  oldest version has nothing to diff against and says so.
- The same dialog lists every **execution that pinned this version** — run name, date, verdict
  — pulled from a new backend query (`GET /api/v1/cases/{caseId}/executions`, grouped by
  version) that joins `test_run_items` across every run for the case, not just one run at a
  time (no such cross-run query exists today). A version is flagged **Flaky** when its
  executions include both at least one `pass` and at least one `failed`/`blocked` result —
  the minimum signal that answers "did this edit introduce flakiness," without inventing a
  statistical model this change doesn't need.
- New DB index on `test_run_items(case_id, case_version)` (amended into the existing
  `00002_core_domain.sql` migration, per the pre-1.0 amend-in-place policy) — the query this
  change adds would otherwise be an unindexed scan.
- Deliberately reuses the existing `CaseResultsPanel` verdict color/label conventions
  (`--chart-1/2/3`, pass/failed/skipped) rather than inventing new status styling.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: "Viewing an existing test case" gains a per-version detail dialog (diff +
  executions + flakiness flag), reached from the existing Version history list.
- `test-execution`: new requirement — querying a case's executions grouped by pinned version,
  across every run (not scoped to a single run the way `GET /api/v1/runs/{runId}/items` is).

## Impact

- **Backend**: `apps/api/internal/store/runs.go` (new query method), `service/service.go` (new
  service method), `packages/shared/openapi.yaml` (new `GET /api/v1/cases/{caseId}/executions`
  endpoint + `CaseExecution` schema), a new HTTP handler, and an index added to
  `apps/api/internal/db/migrations/00002_core_domain.sql`.
- **Frontend**: `apps/web/src/pages/CaseDetailPage.tsx` (clickable version rows), a new
  `components/VersionDetailDialog.tsx` (diff rendering + executions list + flaky flag).
- Explicitly **not** `add-case-result-history` (the deferred change that fills in
  `CaseResultsPanel`'s overall, not-per-version, results chart) — this change is scoped to
  the per-version view only; the two should stay reconcilable but are separate surfaces.
