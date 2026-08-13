## MODIFIED Requirements

### Requirement: Automatic database migrations
The API SHALL apply its schema automatically at startup, and startup MUST be idempotent so repeated startups and rolling restarts are safe. On an empty database, the full schema SHALL be applied in one transaction. On a database that already has the schema applied, the API SHALL verify the applied schema matches what the running binary expects and MUST NOT silently proceed on a mismatch.

#### Scenario: First startup on empty database
- **WHEN** the API starts against an empty database
- **THEN** the full schema applies and the API reports ready

#### Scenario: Restart with schema current
- **WHEN** the API restarts against a database whose applied schema matches the running binary
- **THEN** nothing is re-applied and startup completes normally

#### Scenario: Schema mismatch fails readiness, not silently
- **WHEN** the API starts against a database whose previously-applied schema does not match what the running binary expects
- **THEN** the mismatch is logged and the readiness endpoint reports not-ready, rather than the API silently serving traffic against a schema it does not actually match
