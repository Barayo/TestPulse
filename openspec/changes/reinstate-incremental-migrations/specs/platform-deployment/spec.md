## MODIFIED Requirements

### Requirement: Automatic database migrations
The API SHALL apply pending schema migrations automatically at startup, in
order, and startup MUST be idempotent so repeated startups and rolling
restarts are safe. Each migration is a single, immutable, versioned file
applied at most once per database — once a migration has shipped, it is
never edited in place; a further change is a new migration file. On a
database that already has some migrations applied, the API SHALL apply only
the migrations not yet recorded as applied, and MUST NOT silently proceed if
the database's applied-migration state cannot be reconciled with what the
running binary expects.

#### Scenario: First startup on empty database
- **WHEN** the API starts against an empty database
- **THEN** every migration applies in order and the API reports ready

#### Scenario: Restart with migrations current
- **WHEN** the API restarts against a database already at the latest
  migration version
- **THEN** nothing is re-applied and startup completes normally

#### Scenario: New migration applies without a wipe
- **WHEN** the API starts against a database that has some, but not all,
  migrations applied
- **THEN** only the not-yet-applied migrations run, in order, and no
  existing data is lost or requires a manual reset

#### Scenario: Migration mismatch fails readiness, not silently
- **WHEN** the API starts against a database whose applied-migration state
  the running binary cannot reconcile (e.g. the database is ahead of what
  this binary's embedded migrations recognize)
- **THEN** the mismatch is logged and the readiness endpoint reports
  not-ready, rather than the API silently serving traffic against a schema
  it does not actually match

#### Scenario: An already-applied migration file is never edited
- **WHEN** a migration file has already been merged and is part of any
  environment's applied history
- **THEN** it is never edited in place; a subsequent schema change ships as
  a new migration file, and CI rejects a pull request that edits an
  already-merged migration file
