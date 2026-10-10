## MODIFIED Requirements

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

## ADDED Requirements

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
