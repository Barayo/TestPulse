## Why

As a project member, when I glance at the dashboard's Reports panel, I want to see whether the pass rate is climbing or sinking, not just where it sits right now — a single static number can't answer that, and today the only way to tell is opening the full Reports page and mentally comparing.

## What Changes

- Reports panel on the project landing page renders a compact 10-bar sparkline next to the existing "{passRate}% · pass · N items" line, one bar per recent run, height proportional to that run's pass rate.
- A small dedicated hook fetches the last 10 runs via the existing paginated runs list endpoint, requesting `limit=10` directly — **cheaper than originally scoped**: the `Run` schema's `passRate` field is already computed server-side alongside the list query (`packages/shared/openapi.yaml`'s own doc comment: "cheap, not a per-run round trip"), and `ListPage` already orders newest-first. This is one HTTP request, not up to 10 — no per-run summary fetches needed at all.
- Explicitly a client-side v1: flagged in design.md that once projects accumulate hundreds of runs, this belongs server-side (a project-wide trend endpoint mirroring the existing `GET /api/v1/suites/{suiteKey}/trend`'s shape), not solved here.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `project-reports`: the "Project Reports page" requirement's landing-panel description gains a pass-rate sparkline alongside the pass-rate number and flaky-cases rows already there.

## Impact

- **Frontend only**: a new hook (`apps/web/src/lib/useRunPassRateHistory.ts` or similar — finalized in design.md) and `apps/web/src/components/ProjectLandingPanels.tsx` (`ReportsPanel`), plus their test files.
- No backend, API contract, or migration changes — reuses the existing `GET /api/v1/runs/{runKey}/summary` / `GET /api/v1/public/runs/{runKey}/summary` endpoints `useProjectLanding` already calls.
- Sample Project's existing seed data verified live (queried the running dev instance directly) to already produce real variation across its last 10 runs — 75%/88%/75%/75%/75%/88%/75%/83%/100%/0%/90% — no seed changes needed.
- `docs/test-management.md` updated to extend the Reports panel description (already documents the flaky-cases rows from the sibling `dashboard-flaky-cases-list` change).
