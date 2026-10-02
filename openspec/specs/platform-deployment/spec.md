# platform-deployment

## Purpose

How TestPulse is configured, deployed, and observed as a runnable system:
docker-compose single-command startup, Helm-based Kubernetes deployment,
multi-arch images, environment-variable configuration, health/readiness
endpoints, and applying database migrations at startup.

## Requirements

### Requirement: Single-command evaluation via docker-compose
The system SHALL start a complete working stack (API, web UI, PostgreSQL) from the repository's compose file with a single `docker compose up` command, with no configuration steps required beyond having Docker installed.

#### Scenario: Fresh checkout starts successfully
- **WHEN** a user runs `docker compose up` in `deploy/compose/` on a fresh clone
- **THEN** the application container (serving both the API and the embedded web UI) and the PostgreSQL container start, the schema applies automatically, and the UI is reachable on a documented localhost port

#### Scenario: Data survives restarts
- **WHEN** the compose stack is stopped and started again
- **THEN** PostgreSQL data persists via a named volume and the application returns to a healthy state without manual intervention

### Requirement: Kubernetes deployment via Helm
The system SHALL provide a Helm chart that deploys the API, web UI, and their configuration to a Kubernetes cluster, with PostgreSQL either deployed by the chart (default, for evaluation) or supplied externally via connection settings (for production).

#### Scenario: Default install on a local cluster
- **WHEN** a user runs `helm install` with default values against a local cluster (kind/k3d)
- **THEN** all workloads reach Ready state and the UI is reachable through the chart's configured service/ingress

#### Scenario: External database
- **WHEN** the chart is installed with an external PostgreSQL connection configured and the bundled database disabled
- **THEN** the API connects to the external database and no in-cluster PostgreSQL is deployed

### Requirement: Multi-arch container images
The project SHALL publish container images for both `linux/amd64` and `linux/arm64` from CI, so the platform runs on x86 servers and ARM machines (Apple Silicon, Graviton, Raspberry Pi) without emulation.

#### Scenario: Pull on ARM host
- **WHEN** the published image is pulled on an arm64 host
- **THEN** a native arm64 image runs without emulation warnings

### Requirement: Environment-variable configuration
The API SHALL read all runtime configuration (database connection, listen port/address, log level) from environment variables, with documented names and sane defaults, so compose and Helm share one configuration mechanism.

#### Scenario: Override database connection
- **WHEN** the API starts with a database connection environment variable set
- **THEN** it connects using that value instead of the default

#### Scenario: Missing required configuration
- **WHEN** the API starts without a required configuration value that has no default
- **THEN** it exits promptly with an error message naming the missing variable

### Requirement: Health and readiness endpoints
The API SHALL expose a liveness endpoint that reports process health and a readiness endpoint that reports dependency health (database connectivity), suitable for Kubernetes probes and compose healthchecks.

#### Scenario: Ready when database is reachable
- **WHEN** the readiness endpoint is called while the database is reachable and at the latest applied migration
- **THEN** it returns a success status

#### Scenario: Not ready when database is down
- **WHEN** the readiness endpoint is called while the database is unreachable
- **THEN** it returns a failure status while the liveness endpoint continues to return success

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

### Requirement: Optional native TLS termination
The API SHALL optionally terminate TLS directly when both `TESTPULSE_TLS_CERT_FILE` and `TESTPULSE_TLS_KEY_FILE` are configured, serving plain HTTP (the existing default behavior) when neither is set. The system SHALL fail fast at startup, naming the missing variable, if exactly one of the pair is set.

#### Scenario: Both cert and key configured
- **WHEN** the API starts with both `TESTPULSE_TLS_CERT_FILE` and `TESTPULSE_TLS_KEY_FILE` set to valid file paths
- **THEN** the server terminates TLS directly, serving HTTPS on the configured address

#### Scenario: Neither configured
- **WHEN** the API starts with neither `TESTPULSE_TLS_CERT_FILE` nor `TESTPULSE_TLS_KEY_FILE` set
- **THEN** the server serves plain HTTP, unchanged from current behavior

#### Scenario: Only one of the pair configured
- **WHEN** the API starts with only `TESTPULSE_TLS_CERT_FILE` or only `TESTPULSE_TLS_KEY_FILE` set
- **THEN** startup fails immediately with an error naming the missing variable, and the server does not start on plain HTTP as a fallback

### Requirement: Documented reverse-proxy TLS termination path
The project SHALL document at least one concrete, runnable reverse-proxy configuration (Caddy) that terminates TLS in front of the existing docker-compose stack and forwards `X-Forwarded-Proto: https`, alongside documented nginx and Traefik configuration snippets for the same purpose.

#### Scenario: Caddy-fronted compose stack
- **WHEN** an operator runs the documented Caddy-fronted compose override alongside the base compose stack
- **THEN** the application is reachable over HTTPS, and requests reaching the API carry `X-Forwarded-Proto: https`, so the session cookie is marked `Secure`
