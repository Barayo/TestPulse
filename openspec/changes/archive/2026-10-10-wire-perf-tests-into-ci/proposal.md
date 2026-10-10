## Why

As a maintainer, when the two performance suites (#22 k6 API, #23
Lighthouse web) regress over time, I want their baselines captured
automatically on a schedule rather than only when someone remembers to run
them locally — today neither suite runs anywhere but a developer's own
machine, so a real regression could go unnoticed indefinitely.

## What Changes

- Add a new, separate GitHub Actions workflow,
  `.github/workflows/performance.yml`, triggered on a daily schedule and
  manually (`workflow_dispatch`) — never on `pull_request`/`push`, so it
  never blocks a PR or adds to `ci.yml`'s runtime.
- The workflow brings up a compose stack, seeds the k6 fixture, creates a
  scoped API token, installs `k6`, runs `make perf-api` then `make
  perf-web`, and uploads both suites' `.results/` directories as workflow
  artifacts — always, not just on failure, since the report is the
  deliverable.
- Correct `docs/testing.md` and both suites' READMEs, which currently state
  neither suite is wired into CI.

## Capabilities

### New Capabilities

- `performance-ci-workflow`: a scheduled/manual GitHub Actions workflow
  that runs the existing API and web performance suites and uploads their
  results as reviewable artifacts, without gating any PR.

### Modified Capabilities

(none — the two existing suites' own behavior, scenarios, and non-gating
guarantees are unchanged; this change only adds automation around running
them.)

## Impact

- `.github/workflows/performance.yml` (new).
- `docs/testing.md`, `apps/api/perf/README.md`, `apps/web/perf/README.md`:
  doc corrections.
- No change to `.github/workflows/ci.yml`, either suite's own scripts, or
  any production code.
