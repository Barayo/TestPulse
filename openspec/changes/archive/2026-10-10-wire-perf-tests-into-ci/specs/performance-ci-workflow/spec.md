## ADDED Requirements

### Requirement: Both performance suites run on a schedule and on demand, never gating a PR
The system SHALL provide a GitHub Actions workflow, separate from the
PR-blocking CI workflow, that runs the existing API (k6) and web
(Lighthouse) performance suites on a daily schedule and on manual
dispatch. This workflow SHALL NOT trigger on `pull_request` or `push`,
and SHALL NOT be added to the existing CI workflow file.

#### Scenario: The workflow runs on its own schedule
- **WHEN** the scheduled trigger fires (daily)
- **THEN** the workflow brings up a compose stack, seeds the k6 fixture,
  creates a scoped API token, and runs both `make perf-api` and `make
  perf-web` against it

#### Scenario: The workflow can be run on demand
- **WHEN** a maintainer manually triggers the workflow via
  `workflow_dispatch`
- **THEN** it runs the same steps as the scheduled trigger

#### Scenario: A pull request is never affected
- **WHEN** a pull request is opened or updated
- **THEN** this workflow does not run and has no bearing on the PR's
  required status checks

### Requirement: The workflow surfaces infrastructure failures, not latency or score numbers
The system SHALL fail this workflow's job only when a genuine
infrastructure problem prevents a suite from running (the compose stack
never becoming ready, the fixture-seeding step erroring, a scoped-token
creation failing, or a suite script itself crashing) — never based on a
reported latency or Lighthouse score, preserving each suite's own
existing non-gating design.

#### Scenario: A suite reports a low score without failing the workflow
- **WHEN** a suite run completes and reports latency/score numbers a
  future budget might consider too high
- **THEN** the workflow step still exits 0, consistent with each
  suite's own already-existing non-gating exit behavior

#### Scenario: A genuine infrastructure failure fails the workflow
- **WHEN** the compose stack never becomes ready, or `make seed-perf`
  errors, or the scoped-token creation request fails
- **THEN** the workflow job fails, distinct from a merely-low-scoring
  but otherwise successful suite run

### Requirement: Both suites' results are uploaded as reviewable artifacts on every run
The system SHALL upload each suite's results directory as a workflow
artifact after every run of this workflow, whether the run succeeded or
failed, so results are reviewable without re-running either suite
locally.

#### Scenario: Artifacts are uploaded after a successful run
- **WHEN** the workflow's suite steps complete successfully
- **THEN** `apps/api/perf/.results/` and `apps/web/perf/.results/` are
  each uploaded as a separate workflow artifact

#### Scenario: Artifacts are uploaded after a failed run
- **WHEN** a suite step fails partway through
- **THEN** whatever partial results directory content exists is still
  uploaded, aiding diagnosis of the failure
