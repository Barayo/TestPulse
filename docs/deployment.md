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
| `TESTPULSE_LOGIN_RATE_LIMIT_PER_MINUTE`, `TESTPULSE_LOGIN_RATE_LIMIT_BURST` | no | `5`, `5` | Login attempts allowed per client IP (backlog #113) — sustained rate and burst size. The defaults are a real brute-force mitigation; raise them only for a same-process environment that legitimately logs in often in quick succession (e.g. an E2E suite), never to relax production |

The process exits immediately with an error naming the variable if a required
value is missing. The schema (`apps/api/internal/db/schema.sql`, pre-1.0.0 —
see [Database](database.md)) applies automatically to an empty database at
startup; a database that already has it applied is left alone.

## Health endpoints

| Endpoint | Meaning | Use for |
|---|---|---|
| `GET /healthz` | Process is alive; never depends on the database | Kubernetes liveness probe |
| `GET /readyz` | Database reachable **and** applied schema matches this binary's `schema.sql` (503 otherwise) | Kubernetes readiness probe, load balancer checks |

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
until explicitly assigned one. **As of `enable-public-project-access`
(unified into the authenticated pages by `unify-authenticated-and-public-views`),
a Project Admin may opt a specific project into anonymous, read-only
access** at its normal `/projects/{projectKey}` URL, with write controls
absent rather than a separate page — an explicit, additive carve-out
alongside the opt-in-by-default rule above, not a reversal of it: every
other project stays exactly as inaccessible to a non-member as before, and
a Tenant Admin can disable the whole capability instance-wide (see
[Public project access](test-management.md#public-project-access)). OIDC
SSO is v0.2.

**The app itself never terminates TLS** (tracked as backlog: "Add HTTPS/TLS
support") — it always serves plain HTTP, per "Put TLS at the
ingress/load balancer" above. The session cookie is `HttpOnly` and becomes
`Secure` whenever the request reached the app over HTTPS, detected two
ways: the app's own connection is TLS (only relevant if you terminate TLS
in the Go process directly, which this project doesn't ship a way to do),
or a reverse proxy in front sets `X-Forwarded-Proto: https` (the normal
case — this is what a TLS-terminating ingress/load balancer/CDN is
expected to set, and what `testpulse.fly.dev`'s own Fly.io deployment
relies on). **If you put a reverse proxy in front of TestPulse that
terminates TLS but does not set `X-Forwarded-Proto`, the session cookie
silently loses `Secure`** — confirm your proxy sets this header (nginx,
Caddy, Fly, and every common ingress controller do by default; a bespoke
setup might not).

**Do not expose a TestPulse instance to an untrusted network without a
TLS-terminating proxy in front of it that sets `X-Forwarded-Proto`.** For
local evaluation (docker-compose on localhost, or a Helm install behind a
private network/VPN) plain HTTP is fine; on the public internet or an
untrusted shared network, session cookies and credentials travel in clear
text and are interceptable without TLS in front, exactly like any other
auth mechanism would be on an unencrypted connection.
