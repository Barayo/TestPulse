## ADDED Requirements

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
