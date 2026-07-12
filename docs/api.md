# API

## The contract

The REST API is defined by the OpenAPI 3 document at
[`packages/shared/openapi.yaml`](../packages/shared/openapi.yaml) — the single
source of truth consumed by:

- the web UI, via the generated TypeScript client (`openapi-typescript` +
  `openapi-fetch`),
- external tooling and future connectors,
- the MCP server (arriving in v0.1), which shares the same service layer.

All application endpoints are versioned under `/api/v1`. Health probes sit at
the root because infrastructure expects them there.

## Current endpoints (walking skeleton)

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Liveness: process health only; `200` even when the database is down |
| GET | `/readyz` | Readiness: `200` when the database is reachable and migrations are current, `503 {"status":"unavailable","reason":"..."}` otherwise |
| GET | `/api/v1/meta` | Service name and version |

Everything else under `/` serves the embedded web UI (with SPA fallback).

Example:

```bash
curl -s http://localhost:8080/api/v1/meta
# {"name":"TestPulse","version":"0.0.1"}
```

## Authentication

None yet — the walking skeleton has no protected resources. Local users,
sessions, and scoped agent API tokens arrive in v0.1
(`add-identity-basics`); OIDC SSO in v0.2. This page will grow the auth
section in those changes.

## Versioning policy

- `/api/v1` is unstable until v1.0 — breaking changes may occur between 0.x
  releases and are called out in release notes.
- The OpenAPI document version tracks the application version.
