## ADDED Requirements

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
