## MODIFIED Requirements

### Requirement: A local k6 load test suite targets the two highest-aggregation-cost read endpoints
The system SHALL provide a k6-scripted load test suite covering
`GET /api/v1/projects/summaries` and `GET /api/v1/runs/{runKey}/items`,
runnable via a single documented command against a running compose
stack. The suite SHALL exercise each endpoint's actual cost-defining
path — multiple projects for summaries, the full cursor-paginated chain
for run-items — rather than a single best-case request.

#### Scenario: Running the suite locally
- **WHEN** a maintainer runs `make perf-api` against a running compose
  stack with `TESTPULSE_PERF_TOKEN` set to a valid scoped API token
- **THEN** the suite exercises both target endpoints and reports
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
