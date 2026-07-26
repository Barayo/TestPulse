## ADDED Requirements

### Requirement: No known open dependency vulnerabilities
The project's dependency tree SHALL carry no open Dependabot (or equivalent)
security alerts on `main`, except where a fix is genuinely unavailable — in
which case the risk MUST be explicitly documented (rationale, actual exposure,
re-check trigger) rather than silently left open.

#### Scenario: Fixable alert
- **WHEN** a Dependabot alert has a non-breaking or acceptable-breaking fix
  available
- **THEN** the dependency is updated and the alert closes

#### Scenario: No fix available
- **WHEN** a Dependabot alert has no non-breaking fix and the only proposed
  fix is a regression (e.g. downgrading past a required minimum version)
- **THEN** the risk is documented (which package, why no fix exists, actual
  exposure given how the package is used, and when to re-check) instead of
  being force-fixed into a worse state or left unmentioned
