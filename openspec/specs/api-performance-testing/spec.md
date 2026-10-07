## Purpose

A local/manual load test suite for the Go API's highest-aggregation-cost
read endpoints, producing a documented latency/throughput baseline — not
a CI pass/fail gate.

## Requirements

### Requirement: A local k6 load test suite targets the two highest-aggregation-cost read endpoints
The system SHALL provide a k6-scripted load test suite covering
`GET /api/v1/projects/summaries` and `GET /api/v1/runs/{runKey}/items`,
runnable via a single documented command against a running compose
stack.

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

### Requirement: The suite produces a documented latency/throughput baseline, not a pass/fail gate
The system SHALL record real p95/p99 latency and throughput numbers from
a suite run against realistic data density in `docs/testing.md`'s
Performance section. The suite SHALL NOT fail the command (non-zero
exit) based on a latency threshold, since no prior baseline exists to
gate against.

#### Scenario: A full suite run completes regardless of latency
- **WHEN** the suite runs and some requests exceed what a future
  threshold might consider acceptable
- **THEN** the command still exits 0 and reports the actual numbers
  observed, rather than failing the run

#### Scenario: Baseline numbers are documented, not just printed
- **WHEN** a maintainer captures a baseline run against `make
  seed-demo`'s Banca Móvil project
- **THEN** the resulting p95/p99 numbers are recorded in
  `docs/testing.md`'s Performance section, not left only in local
  terminal output
