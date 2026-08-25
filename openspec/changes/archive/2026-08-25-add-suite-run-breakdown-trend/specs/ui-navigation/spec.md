## ADDED Requirements

### Requirement: Suite Stability card shows a full status breakdown per run
The suite detail page's Stability card SHALL render a suite's run history as one stacked bar per run, each showing its full status breakdown (pass/failed/skipped/blocked/retest/pending) using the same color and texture tokens the run execution board's status breakdown uses, rather than a single collapsed pass-rate figure. This SHALL apply identically to both the "Closed runs" tab and the "Open + closed" tab, sourced from the suite pass-rate trend query (with `includeOpen` for the latter tab). A run's bar SHALL be a focusable control whose accessible name states its name, date, pass rate, and every non-zero non-pass status with its count. The most recent bar SHALL carry an always-visible pass-rate label and a visual emphasis distinguishing it as the latest point. A trailing open run (only possible on the "Open + closed" tab) SHALL render at reduced visual weight and SHALL be identifiable as still in progress, both visually and in its accessible name.

#### Scenario: Each run renders as its own full breakdown
- **WHEN** a user views a suite's Stability card
- **THEN** each run appears as its own stacked bar showing every non-zero status it recorded, not just a pass-rate number

#### Scenario: A run's bar is accessible via keyboard and screen reader
- **WHEN** a user tabs to a run's bar
- **THEN** its accessible name states the run's name, date, pass rate, and every non-zero non-pass status with its count

#### Scenario: The latest run is visually distinguished
- **WHEN** a user views a suite's Stability card with more than one run
- **THEN** the most recent bar carries an always-visible pass-rate label and a visual emphasis the other bars don't have

#### Scenario: An open run is visually distinct from closed ones
- **WHEN** the "Open + closed" tab includes a trailing open run
- **THEN** that run's bar renders at reduced visual weight and its accessible name states that it is still open

#### Scenario: Both tabs use the same chart
- **WHEN** a user switches between the "Closed runs" and "Open + closed" tabs
- **THEN** both render the same kind of stacked-bar breakdown chart, differing only in whether a trailing open run is included
