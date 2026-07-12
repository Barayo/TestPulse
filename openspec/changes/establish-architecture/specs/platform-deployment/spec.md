# platform-deployment

## ADDED Requirements

### Requirement: Single-command evaluation via docker-compose
The system SHALL start a complete working stack (API, web UI, PostgreSQL) from the repository's compose file with a single `docker compose up` command, with no configuration steps required beyond having Docker installed.

#### Scenario: Fresh checkout starts successfully
- **WHEN** a user runs `docker compose up` in `deploy/compose/` on a fresh clone
- **THEN** the application container (serving both the API and the embedded web UI) and the PostgreSQL container start, migrations apply automatically, and the UI is reachable on a documented localhost port

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
- **WHEN** the readiness endpoint is called while the database is reachable and migrations are current
- **THEN** it returns a success status

#### Scenario: Not ready when database is down
- **WHEN** the readiness endpoint is called while the database is unreachable
- **THEN** it returns a failure status while the liveness endpoint continues to return success

### Requirement: Automatic database migrations
The API SHALL apply pending schema migrations automatically at startup, and migrations MUST be idempotent so repeated startups and rolling restarts are safe.

#### Scenario: First startup on empty database
- **WHEN** the API starts against an empty database
- **THEN** all migrations apply and the schema reaches the current version before the API reports ready

#### Scenario: Restart with schema current
- **WHEN** the API restarts against an already-migrated database
- **THEN** no migrations are re-applied and startup completes normally
