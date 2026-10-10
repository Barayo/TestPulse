## Purpose

A local/manual load test suite for the Go API's highest-aggregation-cost
read endpoints, producing a documented latency/throughput baseline — not
a CI pass/fail gate.

## Requirements

### Requirement: A local k6 load test suite targets the two highest-aggregation-cost read endpoints
The system SHALL provide a k6-scripted load test suite covering
`GET /api/v1/projects/summaries`, `GET /api/v1/runs/{runKey}/items`, and
`POST /api/v1/projects/{projectKey}/runs` (`CreateRun`), runnable via a
single documented command against a running compose stack. The suite
SHALL exercise each endpoint's actual cost-defining path — multiple
projects for summaries, the full cursor-paginated chain for run-items,
and a realistically large case-key list for `CreateRun` — rather than a
single best-case request. Every run created by the suite's `CreateRun`
scenario SHALL be deleted immediately after creation, so repeated suite
invocations do not accumulate runs.

#### Scenario: Running the suite locally
- **WHEN** a maintainer runs `make perf-api` against a running compose
  stack with `TESTPULSE_PERF_TOKEN` set to a valid scoped API token
- **THEN** the suite exercises all three target endpoints and reports
  latency/throughput results to the terminal

#### Scenario: Missing auth token fails fast with a clear message
- **WHEN** `make perf-api` is run without `TESTPULSE_PERF_TOKEN` set
- **THEN** the suite exits immediately with an error naming the missing
  environment variable, rather than running requests that all fail with
  401

#### Scenario: Run-items pagination is actually exercised
- **WHEN** the suite's run-items call targets a run with more items than
  the API's default page size
- **THEN** the suite follows the response's `nextCursor` until it is
  null, issuing multiple requests per iteration rather than fetching
  only the first page

#### Scenario: Query targets vary across iterations
- **WHEN** the suite runs multiple iterations against the run-items
  endpoint
- **THEN** different iterations target different runs, rather than
  every iteration repeating the identical query against the same row

#### Scenario: CreateRun is exercised at a realistic case-key scale
- **WHEN** the suite's `create_run_write` scenario runs an iteration
- **THEN** it creates a run from a case list large enough (the "Perf
  Write Load" fixture project's full ~500-case set) that a reintroduced
  per-case-key round trip would be visible in wall-clock terms, rather
  than a trivially small case list

#### Scenario: Created runs do not accumulate across suite invocations
- **WHEN** the `create_run_write` scenario successfully creates a run
- **THEN** the suite deletes that run before the iteration ends, so a
  repeated `make perf-api` invocation never leaves additional runs
  behind in the fixture project

### Requirement: The suite produces a documented latency/throughput baseline, not a pass/fail gate
The system SHALL record real p95/p99 latency and throughput numbers,
reported separately per target endpoint (not blended), from multiple
suite runs against a purpose-built fixture in `docs/testing.md`'s
Performance section. The suite SHALL NOT fail the command (non-zero
exit) based on a latency threshold, since no prior baseline exists to
gate against.

#### Scenario: A full suite run completes regardless of latency
- **WHEN** the suite runs and some requests exceed what a future
  threshold might consider acceptable
- **THEN** the command still exits 0 and reports the actual numbers
  observed, rather than failing the run

#### Scenario: Baseline numbers are documented as a range, not a single sample
- **WHEN** a maintainer captures a baseline by running the suite several
  times against `make seed-perf`'s fixture
- **THEN** the resulting p95/p99 numbers are recorded in
  `docs/testing.md`'s Performance section as a min-max range per
  endpoint, not a single run's output

#### Scenario: Warm-up traffic is excluded from the reported baseline
- **WHEN** the suite's setup stage issues warm-up requests before the
  measured scenario begins
- **THEN** those warm-up requests are tagged separately and excluded
  from the per-endpoint percentiles recorded as the baseline

### Requirement: `make seed-perf`'s fixture is safely re-runnable
The system SHALL allow `make seed-perf` to be run more than once against
the same database without producing a duplicated fixture — a project the
fixture already created SHALL be left as-is on a subsequent run rather
than recreated.

#### Scenario: Re-running seed-perf against an already-seeded database
- **WHEN** a maintainer runs `make seed-perf` twice in a row against the
  same database without wiping it in between
- **THEN** exactly 60 `Perf Load NN` projects exist afterward, not 120

#### Scenario: A project-count drift from the expected fixture size fails loudly
- **WHEN** `make perf-api`'s setup stage counts the `Perf Load NN`
  projects present
- **THEN** it fails with a clear message if the count is not exactly the
  expected fixture size, rather than silently proceeding with extra or
  missing projects

### Requirement: `make seed-perf`'s fixture includes a dedicated CreateRun scratch project
The system SHALL provide, as part of `make seed-perf`'s fixture, one
scratch project distinct from the numbered `Perf Load NN` projects,
containing enough cases that a load test can realistically exercise
`CreateRun`'s case-key resolution path. This project SHALL NOT be
counted by, or interfere with, any existing fixture-size check that
targets the numbered `Perf Load NN` projects.

#### Scenario: The CreateRun scratch project is seeded
- **WHEN** a maintainer runs `make seed-perf` against a running compose
  stack
- **THEN** a project named "Perf Write Load" exists afterward, containing
  500 cases and no pre-made run

#### Scenario: The scratch project does not affect the existing project-count check
- **WHEN** the k6 suite's setup stage counts the `Perf Load NN` projects
  present (per the existing "project-count drift... fails loudly"
  requirement)
- **THEN** the count is unaffected by the presence of the "Perf Write
  Load" project, since it does not match the `Perf Load NN` naming
  pattern that check filters on

#### Scenario: Re-running seed-perf does not duplicate the scratch project
- **WHEN** a maintainer runs `make seed-perf` twice in a row without
  wiping the database in between
- **THEN** exactly one "Perf Write Load" project exists afterward, not
  two

### Requirement: The suite emits a machine-readable summary
The system SHALL write a machine-readable summary file alongside the
suite's human-readable terminal output, containing per-endpoint
latency/throughput numbers, so the results are consumable by a future
script or CI step without re-running the suite.

#### Scenario: A summary file is written after a run
- **WHEN** `make perf-api` completes
- **THEN** a `summary.json` file exists under `apps/api/perf/.results/`
  containing per-endpoint p95/p99/avg latency and overall throughput/
  failure-rate figures

#### Scenario: The existing terminal summary is unchanged
- **WHEN** `make perf-api` completes
- **THEN** the same colored, per-endpoint terminal summary it already
  printed before this requirement existed still prints, alongside the
  new file
