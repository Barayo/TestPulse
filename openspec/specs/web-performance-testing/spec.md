## Purpose

A local/manual Lighthouse suite for the web app's four heaviest pages,
producing a documented score/vitals baseline — not a CI pass/fail gate.

## Requirements

### Requirement: A local Lighthouse suite targets the four heaviest web pages
The system SHALL provide a Lighthouse-based suite covering `/` (project
list), a project landing page, the Library two-pane browser, and a run
execution board, runnable via a single documented command against a
running compose stack. The suite SHALL resolve real project/run keys from
the running API at suite-start rather than relying on hardcoded keys. The
suite SHALL authenticate before requesting any target page, and SHALL
score each page under a desktop usage profile.

#### Scenario: Running the suite locally
- **WHEN** a maintainer runs `make perf-web` against a running compose stack
- **THEN** the suite resolves the Sample Project's key and a real run key,
  runs Lighthouse against all four target pages, and reports
  performance/accessibility/best-practices scores and core web vitals to
  the terminal

#### Scenario: Target pages are resolved dynamically, not hardcoded
- **WHEN** the suite's discovery step runs
- **THEN** it queries the running API for the Sample Project's current key
  and a run belonging to it, rather than assuming a fixed key that may not
  match the project's key after a reseed

#### Scenario: Each target page is measured as a distinct render
- **WHEN** the suite requests the `/` (project list) page
- **THEN** it is measured as the project list page itself, not whatever
  page an anonymous single-public-project redirect would otherwise land
  on, because the suite's requests carry an authenticated session

#### Scenario: Pages are scored under a desktop usage profile
- **WHEN** Lighthouse scores any of the four target pages
- **THEN** it uses a desktop viewport, desktop CPU/network throttling, and
  a desktop user agent, not Lighthouse's default mobile profile

### Requirement: The suite produces a documented score/vitals baseline, not a pass/fail gate
The system SHALL record real Lighthouse scores and core web vitals (LCP,
TBT, CLS), reported separately per target page (not blended), from multiple
suite runs in `docs/testing.md`'s Performance section. The suite SHALL NOT
fail the command (non-zero exit) based on a score threshold, since no prior
baseline exists to gate against.

#### Scenario: A full suite run completes regardless of score
- **WHEN** the suite runs and some pages score lower than what a future
  budget might consider acceptable
- **THEN** the command still exits 0 and reports the actual scores
  observed, rather than failing the run

#### Scenario: Run-to-run variance is reduced via repeated sampling
- **WHEN** the suite runs against a target page
- **THEN** Lighthouse is invoked multiple times for that page and the
  median result is used, rather than a single, potentially noisy sample

#### Scenario: Baseline numbers are documented as a range, not a single sample
- **WHEN** a maintainer captures a baseline by running the suite several
  times against the always-on Sample Project
- **THEN** the resulting scores and vitals are recorded in
  `docs/testing.md`'s Performance section as a min-max range per page, not
  a single run's output

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
