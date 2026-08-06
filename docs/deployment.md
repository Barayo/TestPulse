# Deployment

## Configuration reference

All runtime configuration is environment-variable based. The same variables
apply under compose, Helm, or a bare binary.

| Variable | Required | Default | Description |
|---|---|---|---|
| `TESTPULSE_DATABASE_URL` | **yes** | — | PostgreSQL connection string, e.g. `postgres://user:pass@host:5432/testpulse?sslmode=require` |
| `TESTPULSE_ADDR` | no | `:8080` | HTTP listen address |
| `TESTPULSE_LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, or `error` (JSON logs on stdout) |
| `TESTPULSE_ADMIN_EMAIL`, `TESTPULSE_ADMIN_PASSWORD` | no | — | Seed one Tenant Admin on first startup, only if the `users` table is empty; ignored on any later startup once users exist |

The process exits immediately with an error naming the variable if a required
value is missing. Schema migrations run automatically and idempotently at
startup.

## Health endpoints

| Endpoint | Meaning | Use for |
|---|---|---|
| `GET /healthz` | Process is alive; never depends on the database | Kubernetes liveness probe |
| `GET /readyz` | Database reachable **and** migrations current (503 otherwise) | Kubernetes readiness probe, load balancer checks |

## Container images

Published to GHCR as `ghcr.io/barayo/testpulse` for `linux/amd64` and
`linux/arm64`. The image is distroless (no shell), runs as the non-root user
(uid 65532), and contains the web UI embedded in the binary.

## Docker Compose

`deploy/compose/docker-compose.yml` defines the evaluation stack:

- **app** — built from the repo `Dockerfile`, port `8080:8080`
- **db** — `postgres:16-alpine` with named volume `testpulse-db` and a
  `pg_isready` healthcheck; the app starts only after the db is healthy

Not intended for production (single node, default credentials).

## Helm chart

Chart: `deploy/helm/testpulse`. Key values:

| Value | Default | Notes |
|---|---|---|
| `image.repository` / `image.tag` | `ghcr.io/barayo/testpulse` / chart `appVersion` | |
| `replicaCount` | `1` | App is stateless; scale freely |
| `service.type` / `service.port` | `ClusterIP` / `8080` | |
| `ingress.enabled` | `false` | Set `ingress.host`, `className`, `tls` as needed |
| `postgresql.enabled` | `true` | Bundled single-replica Postgres (evaluation) |
| `postgresql.password` / `postgresql.existingSecret` | `testpulse` / — | Existing Secret needs a `password` key |
| `postgresql.persistence.size` | `1Gi` | |
| `externalDatabase.*` | — | Used when `postgresql.enabled=false` |
| `resources` | 50m CPU / 64–256Mi | The Go binary idles well under this |

### External database

```bash
kubectl create secret generic testpulse-db --from-literal=password='...'

helm install testpulse deploy/helm/testpulse \
  --set postgresql.enabled=false \
  --set externalDatabase.host=pg.internal \
  --set externalDatabase.database=testpulse \
  --set externalDatabase.username=testpulse \
  --set externalDatabase.existingSecret=testpulse-db \
  --set externalDatabase.sslMode=require
```

### Probes

The chart wires `/healthz` to liveness and `/readyz` to readiness. A database
outage flips readiness (pod leaves the Service) without triggering a liveness
restart — this is intentional.

## Production notes

- Run PostgreSQL with real operational backing (managed service or an
  operator); the bundled StatefulSet is for evaluation.
- Put TLS at the ingress/load balancer; the app itself serves plain HTTP.
- The app is stateless — all state is in PostgreSQL, so backup/restore is
  entirely a database concern.

## Security status

**As of `add-identity-basics`, every domain endpoint requires an
authenticated actor** — a local user via session cookie, or an agent via a
scoped API token (`docs/api.md#authentication`). **As of `add-project-rbac`,
access to a project is opt-in**: one instance-wide Tenant Admin flag plus
three project-scoped roles (Tester/Contributor/Project Admin), assignable
directly or via a team — a non-Tenant-Admin has no access to any project
until explicitly assigned one. **As of `enable-public-project-access`, a
Project Admin may opt a specific project into anonymous, read-only access**
at a stable `/public/{projectKey}` URL — an explicit, additive carve-out
alongside the opt-in-by-default rule above, not a reversal of it: every
other project stays exactly as inaccessible to a non-member as before, and
a Tenant Admin can disable the whole capability instance-wide (see
[Public project access](test-management.md#public-project-access)). OIDC
SSO is v0.2.

**The connection itself is still plain HTTP — there is no TLS termination
yet** (tracked as backlog: "Add HTTPS/TLS support"). The session cookie is
`HttpOnly` and becomes `Secure` automatically once a request arrives over
TLS, but without TLS in front of it, session cookies and credentials travel
the network in clear text and are interceptable, exactly like any other
auth mechanism would be on an unencrypted connection.

**Do not expose a TestPulse instance beyond this stage to an untrusted
network.** For local evaluation (docker-compose on localhost, or a Helm
install behind a private network/VPN) this is fine; do not put it on the
public internet or an untrusted shared network until TLS termination is in
place.
