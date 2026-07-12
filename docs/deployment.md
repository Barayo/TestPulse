# Deployment

## Configuration reference

All runtime configuration is environment-variable based. The same variables
apply under compose, Helm, or a bare binary.

| Variable | Required | Default | Description |
|---|---|---|---|
| `TESTPULSE_DATABASE_URL` | **yes** | — | PostgreSQL connection string, e.g. `postgres://user:pass@host:5432/testpulse?sslmode=require` |
| `TESTPULSE_ADDR` | no | `:8080` | HTTP listen address |
| `TESTPULSE_LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, or `error` (JSON logs on stdout) |

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
