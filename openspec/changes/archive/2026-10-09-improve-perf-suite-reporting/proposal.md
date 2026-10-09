## Why

As a maintainer reviewing a performance suite's output, when a number
moves between runs, I want to know roughly why without re-running the
suite myself — today both `apps/api/perf/` (k6) and `apps/web/perf/`
(Lighthouse) only print terminal text and discard the diagnostic detail
already sitting in their own raw results. Found via post-ship review of
`add-web-performance-lighthouse` (#23); filed as #217 alongside two more
urgent methodology bugs (already fixed in `fix-web-perf-lighthouse-
methodology`). This change addresses #217's three remaining, lower-
urgency findings.

## What Changes

- Both suites write a machine-readable `summary.json` next to their
  existing per-run artifacts (`apps/api/perf/.results/`,
  `apps/web/perf/.results/`) — the k6 suite via `handleSummary()`, the
  web suite as a small addition to data it already computes.
- `apps/web/perf/run.mjs` prints the 2-3 Lighthouse performance audits
  with the greatest actual impact on each page's score (weight ×
  `(1 - score)`, the same ranking Lighthouse's own report uses), with
  1-2 extracted detail lines each, after the existing score/vitals
  block — not instead of it.
- `apps/web/perf/discover-urls.mjs` gets a one-line comment citing the
  API's `ORDER BY created_at DESC` guarantee backing its `items[0]`
  run-selection — confirmed as a real, already-enforced guarantee, not
  an assumption, so no code change needed here.
- Out of scope: #217's fourth original finding (CreateRun write-path
  coverage) was split out to its own issue, #218 — a new test target
  with its own fixture/cleanup design questions, not reporting polish.

## Capabilities

### Modified Capabilities
- `api-performance-testing`: gains a machine-readable summary output
  requirement.
- `web-performance-testing`: gains a machine-readable summary output
  requirement and a root-cause-surfacing requirement.

## Impact

- `apps/api/perf/summaries-and-run-items.js` (+ `.results/` dir, new,
  git-ignored).
- `apps/web/perf/run.mjs` (new pure helper functions `rankAudits()`/
  `describeAuditItem()`, unit-tested), `apps/web/perf/discover-urls.mjs`
  (comment only).
- `.gitignore`: new entry for `apps/api/perf/.results/`.
- No API, schema, or production code changes — dev/test tooling only,
  same category as every change in this perf-suite lineage.
