## Why

As a maintainer, when I regress a write-path endpoint like `CreateRun`, I want
the existing k6 perf suite to have a chance of catching it — today
`apps/api/perf/summaries-and-run-items.js` only covers two read-only
endpoints, so the one write path already proven to regress (#180, N+1 query
amplification in `CreateRun`'s case-key resolution, fixed) has no load-test
coverage at all. Split out of #217 (output/reporting polish for the existing
suites) because this is a new test target with its own fixture/cleanup
design, not polish.

## What Changes

- Extend `make seed-perf` with one new scratch project, "Perf Write Load"
  (500 bare cases, no pre-made run), purpose-built to make a reintroduced
  per-case-key round trip visible in wall-clock terms.
- Add a third k6 scenario to the existing `apps/api/perf/` suite that
  repeatedly creates a run from that project's full case list and deletes it
  immediately after, so no runs accumulate across a suite run.
- Report the new scenario's latency separately (own tag, own baseline row),
  not blended into the two existing read-endpoint numbers.
- Document the new baseline row in `docs/testing.md` and the new fixture in
  `apps/api/perf/README.md`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `api-performance-testing`: adds a third load-test target (the `CreateRun`
  write path) and its fixture/cleanup requirements to the existing
  capability — the suite still produces a documented baseline, not a
  pass/fail gate, per that capability's existing requirements.

## Impact

- `apps/api/cmd/seed-perf/main.go` (+ `main_test.go`): new fixture-creation
  step, idempotent, new test coverage.
- `apps/api/perf/summaries-and-run-items.js`: new scenario, setup-stage case
  list fetch, new tagged thresholds.
- `apps/api/perf/README.md`, `docs/testing.md`: doc updates.
- No production code changes — `CreateRun`/`DeleteRun` are untouched; this
  change is test-suite/fixture only.
