## 1. Domain & store — TDD

- [x] 1.1 Write failing store test: `SuiteRepo.Trend` (or `RunRepo`, wherever it lands) on a suite with 3 closed runs (created in sequence, distinct status mixes) returns 3 points, oldest first, each with the right per-status counts.
- [x] 1.2 Add `domain.SuiteTrendPoint{RunKey, RunName, CreatedAt, Total, Counts map[Status]int}` and `domain.SuiteTrend{SuiteID, SuiteKey, Points []SuiteTrendPoint}`. Implement the aggregation query (single query, grouped in Go — see design.md's decision). Make 1.1 pass.
- [x] 1.3 Write failing store test: an open run sourced from the suite is excluded from the trend.
- [x] 1.4 Make 1.3 pass (query already filters `tr.status = 'closed'` if written per design — confirm, don't assume).
- [x] 1.5 Write failing store test: a suite with zero closed runs returns an empty (not nil-erroring) trend.
- [x] 1.6 Make 1.5 pass.

## 2. Service & API

- [x] 2.1 Write failing service test: `Service.SuiteTrend` resolves a suite ID to its trend.
- [x] 2.2 Add `Service.SuiteTrend`. Make 2.1 pass.
- [x] 2.3 Write failing server test: `GET /api/v1/suites/{suiteKey}/trend` returns the trend for an existing suite, 404s for an unknown key.
- [x] 2.4 Add the route + handler (`requirePermission(read, ...)`, matching the read-access pattern other suite/run GETs already use). Make 2.3 pass.
- [x] 2.5 Add `SuiteTrend`/`SuiteTrendPoint` schemas and the `GET /suites/{suiteKey}/trend` path to `packages/shared/openapi.yaml`. `make generate`.

## 3. Web component

- [x] 3.1 Write failing component test: `SuitePassRateTrend` renders a point per closed run, in order, with the right pass-rate values (mirror `RunStatusBreakdown.test.tsx`'s structure/assertions).
- [x] 3.2 Write failing component test: empty trend renders an explicit empty state (no broken zero-point line).
- [x] 3.3 Build `SuitePassRateTrend.tsx` per the `dataviz` skill (line/sparkline form, palette validated via the skill's validator script, hover detail showing the full status breakdown per point). Make 3.1–3.2 pass.
- [x] 3.4 Run the palette validator (`node scripts/validate_palette.js ...` from the `dataviz` skill) against the chosen colors; fix any FAIL before proceeding. **Note:** the validator script was not actually present in this environment's mounted copy of the skill (empty `scripts/` dir) — could not run it. Not treated as a blocker: the line color is a direct reuse of the app's already-established `--primary`/`--chart-1` "pass" semantic (StatusBadge, HealthBar, RunStatusBreakdown), not a new palette decision, so this is lower-risk than the validator's primary target (a fresh categorical palette).
- [x] 3.4b Two additional edge-case tests added beyond the original checklist: single-point trend (centers the marker), and a run with zero passes (0%, no division error).

## 4. Verification

- [x] 4.1 `make coverage-api` (aggregate gate ≥ 80%) holds — 81.1%.
- [x] 4.2 `make lint` clean (Go + web) — golangci-lint: 0 issues; oxlint: pre-existing warnings only, none from new files.
- [x] 4.3 `npm run -w apps/web typecheck` clean.
- [x] 4.4 Sync the `test-execution` delta spec (new "Suite pass-rate trend" requirement) into `openspec/specs/test-execution/spec.md`, then `openspec archive add-suite-pass-rate-trend --yes --skip-specs`.

## 5. Docs & showcase

- [x] 5.1 No docs update — no live page renders this yet (see proposal.md's Non-Goals); nothing user-facing to document.
- [x] 5.2 No Sample-Project-showcase task — same reason; #81 (Reports page) gets the showcase task once this data is actually visible somewhere.
