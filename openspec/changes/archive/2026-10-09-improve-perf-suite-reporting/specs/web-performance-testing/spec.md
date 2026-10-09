## ADDED Requirements

### Requirement: The suite emits a machine-readable summary
The system SHALL write a machine-readable summary file alongside the
suite's per-run Lighthouse JSON reports, containing each page's scores
and core web vitals, so the results are consumable by a future script or
CI step without re-running the suite.

#### Scenario: A summary file is written after a run
- **WHEN** `make perf-web` completes
- **THEN** a `summary.json` file exists under `apps/web/perf/.results/`
  containing each of the four pages' performance/accessibility/best-
  practices scores and LCP/TBT/CLS vitals

### Requirement: The suite surfaces why a page scored the way it did
The system SHALL report the performance audits with the greatest actual
impact on each page's score, with enough extracted detail to suggest a
likely cause, not just the score itself.

#### Scenario: The worst-impact audits are reported per page
- **WHEN** `make perf-web` reports a page's results
- **THEN** it also prints the 2-3 performance-category audits with the
  greatest weighted impact on that page's score, each with 1-2 lines of
  extracted detail where the audit's own data provides it

#### Scenario: Console errors are always checked
- **WHEN** `make perf-web` reports a page's results
- **THEN** it reports whether any console errors were observed during
  that page's load, regardless of whether console errors factor into
  the ranked weighted-impact audits
