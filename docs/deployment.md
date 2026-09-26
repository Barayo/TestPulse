# Deployment

## Configuration reference

All runtime configuration is environment-variable based. The same variables
apply under compose, Helm, or a bare binary.

| Variable | Required | Default | Description |
|---|---|---|---|
| `TESTPULSE_DATABASE_URL` | **yes** | — | PostgreSQL connection string, e.g. `postgres://user:pass@host:5432/testpulse?sslmode=require` |
| `TESTPULSE_ADDR` | no | `:8080` | HTTP listen address |
| `TESTPULSE_LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, or `error` (JSON logs on stdout) |
| `TESTPULSE_ADMIN_EMAIL`, `TESTPULSE_ADMIN_PASSWORD` | no | — | Seed one Tenant Admin on first startup, only if the `users` table is empty; ignored on any later startup once users exist. If either is left unset, the first person to visit the running instance is walked through creating the admin account themselves at `/setup` instead (add-first-run-setup) — see the warning below |
| `TESTPULSE_LOGIN_RATE_LIMIT_PER_MINUTE`, `TESTPULSE_LOGIN_RATE_LIMIT_BURST` | no | `5`, `5` | Login attempts allowed per client IP (backlog #113) — sustained rate and burst size. The defaults are a real brute-force mitigation; raise them only for a same-process environment that legitimately logs in often in quick succession (e.g. an E2E suite), never to relax production |
| `TESTPULSE_SMTP_HOST`, `TESTPULSE_SMTP_PORT`, `TESTPULSE_SMTP_FROM_ADDRESS`, `TESTPULSE_PUBLIC_URL` | no | — | Enable self-service password recovery (add-forgot-password) — all four required together, plus optionally `TESTPULSE_SMTP_USERNAME`/`_PASSWORD` (may be left blank for an unauthenticated relay, e.g. Mailpit). `TESTPULSE_PUBLIC_URL` builds the absolute link in the reset email (e.g. `https://testpulse.example.com`). Reported as `passwordResetEnabled` on `GET /api/v1/meta`; the login page's "Forgot password?" link only renders when true |
| `TESTPULSE_ALLOW_MISSING_MIGRATIONS` | no | `false` | Recovery escape hatch for a migration-history gap — see [Database](database.md). Only set temporarily to unblock a startup after that specific failure; leave off otherwise |
| `TESTPULSE_ENCRYPTION_KEY` | no | — | Encrypts the OIDC/SSO client secret at rest (add-sso-oidc) — required only once a Tenant Admin actually saves one via Instance Settings' "Single sign-on" card. Treat it like any other production secret: back it up, don't rotate casually. Losing or changing it means re-entering the client secret (issuer/client ID/claim mappings are unaffected) |
| `TESTPULSE_MCP_ENABLED` | no | `true` | Mounts the MCP server at `/mcp` (add-mcp-server) — see [MCP server](mcp-server.md). Set to `false` to disable it entirely for a deployment |

The process exits immediately with an error naming the variable if a required
value is missing. Pending migrations (`apps/api/internal/db/migrations/` —
see [Database](database.md)) apply automatically at startup, in order;
already-applied migrations are skipped, so a restart or rolling deploy is
always safe.

**First-run setup and network exposure** (add-first-run-setup): if
`TESTPULSE_ADMIN_EMAIL`/`TESTPULSE_ADMIN_PASSWORD` aren't both set, the
instance boots with zero users and shows a setup screen at `/setup` to
whoever visits first — that visitor becomes the permanent Tenant Admin.
This is by design (the same tradeoff comparable tools like Grafana and
WordPress make), but it means whoever reaches the instance first, not
necessarily its intended operator, claims the admin account. **For any
instance reachable by untrusted parties before setup completes**, either
configure both admin env vars before first boot, or keep network access
restricted until setup is done.

**Single sign-on** (`add-sso-oidc`): unlike every other feature on this
page, OIDC/SSO is *not* configured via environment variables — a Tenant
Admin configures it at runtime from Instance Settings' "Single sign-on"
card (issuer URL, client ID, client secret, an optional group-claim name
and Tenant-Admin-granting values, and an SSO-only toggle), the same way
public project access, run retention, and the color theme already are.
Saving validates the issuer via live OIDC discovery
(`<issuer>/.well-known/openid-configuration`) before persisting anything,
so a typo or unreachable IdP is rejected immediately rather than silently
breaking login later. Any spec-compliant identity provider works (Okta,
Entra ID, Google Workspace, Keycloak, and similar).

The first successful login for a given email just-in-time provisions a
TestPulse account — no Tenant Admin action needed first — and a later
login with the same, IdP-verified email links to that same account rather
than creating a second one. A configured group claim can also grant Tenant
Admin (re-evaluated every login: losing the claim value demotes on the
next login) and map claim values to `Team`s the Settings card lists
underneath — matching an IdP group adds the user to that Team on login
(additive only; it never removes a Team membership when a claim value is
later lost). Beyond that, an SSO-provisioned user starts with the same,
empty set of project memberships a Tenant-Admin-created account would,
assigned the usual way (`add-project-rbac`). Agents are unaffected — they
always authenticate via scoped API tokens, never SSO.

Verify SSO login works end-to-end before enabling the SSO-only toggle:
there is no break-glass once password login is disabled short of a direct
database edit (`instance_settings.oidc_only = false`). A restart re-reads
whatever's saved and re-discovers the provider; a since-broken IdP at boot
logs a warning and starts with SSO disabled rather than failing the whole
process — SSO is a runtime admin setting, not deploy-time infra.

## Health endpoints

| Endpoint | Meaning | Use for |
|---|---|---|
| `GET /healthz` | Process is alive; never depends on the database | Kubernetes liveness probe |
| `GET /readyz` | Database reachable **and** at the latest applied migration (503 otherwise) | Kubernetes readiness probe, load balancer checks |

## Logging and request correlation

All logs are structured JSON on stdout, leveled by `TESTPULSE_LOG_LEVEL`
(see Configuration reference above). Beyond the startup logging (migrations,
SSO discovery, sample-project seeding), the following are logged at Warn or
above for incident triage (add-service-request-logging):

- **HTTP error responses** — any response with status 400 or above logs one
  line with method, path, status, request ID, and duration (Warn for 4xx,
  Error for 5xx). A 500 additionally gets a second, complementary line from
  the handler itself carrying the actual Go error.
- **Webhook delivery failures** — an unreachable, timed-out, non-2xx, or
  SSRF-rejected delivery attempt logs the destination host and event type
  (never the full URL or payload body).
- **Background worker failures** — a failed sweep/processing tick in
  `ProjectAutoArchiveWorker`, `RunRetentionWorker`, `ProjectDeletionWorker`,
  or `RunAutoArchiveWorker` is logged instead of silently discarded; the
  worker retries on its next tick regardless.
- **Audit log write failures** — a failed `audit()` append is logged
  instead of silently discarded.

Every HTTP response (successful or not) carries an `X-Request-Id` header,
generated by chi's request-ID middleware. Quote that value from a bug
report or browser network tab to find the matching server log line —
the same ID appears in every error-response log line for that request.

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

**Every response carries a `Content-Security-Policy` header** (backlog
#189, `securityHeaders` in `apps/api/internal/server/middleware.go`),
scoped to what the embedded `apps/web` bundle actually uses:
`script-src 'self'` with no `'unsafe-inline'`/`'unsafe-eval'` (the
directive that actually stops an injected-script XSS regression),
`style-src 'self' 'unsafe-inline'` (React's `style={{}}` prop compiles to
real inline `style=""` attributes throughout the UI), `img-src 'self'
data:`, `font-src 'self'`, `connect-src 'self'` (all API traffic is
same-origin), `object-src 'none'`, `base-uri 'self'`, `form-action
'self'`, and `frame-ancestors 'none'` (CSP's modern equivalent to the
existing `X-Frame-Options: DENY`, kept alongside it). **If you add a
CDN-hosted script, font, or image, or embed a third-party iframe, you
must add the matching source to this policy** — it isn't a permissive
default, it's audited against the bundle as it exists today.
