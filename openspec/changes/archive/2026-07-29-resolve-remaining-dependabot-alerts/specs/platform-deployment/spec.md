## MODIFIED Requirements

### Requirement: No known open dependency vulnerabilities
The project's dependency tree SHALL carry no open Dependabot (or equivalent)
security alerts on `main`, except where a fix is genuinely unavailable — in
which case the risk MUST be explicitly documented (rationale, actual exposure,
re-check trigger) rather than silently left open. A previously-documented
"no fix available" alert MUST be re-checked and resolved once its stated
re-check trigger occurs (e.g. an upstream package ships a patch bringing a
fixed transitive dependency within an already-allowed semver range).

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

#### Scenario: A documented risk's re-check trigger fires
- **WHEN** an upstream package a previously-accepted-risk alert depended on
  (transitively) ships a new release, and re-running the fix now resolves
  the alert without the breaking change that was originally rejected
- **THEN** the dependency is updated and the alert closes, the same as any
  other fixable alert
