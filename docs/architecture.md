# Architecture

TestPulse is a **modular monolith**: one Go backend, one React frontend served
from the same binary, one PostgreSQL database. This page describes the system
as it exists; the founding decisions and their rejected alternatives are
recorded in the OpenSpec change `establish-architecture` (see
`openspec/changes/`).

## System overview

```
┌──────────────────────────────────────────────────────┐
│                 testpulse (container)                │
│  ┌────────────────────────────────────────────────┐  │
│  │              Go binary (apps/api)              │  │
│  │                                                │  │
│  │   embedded React UI  ←  /            (SPA)     │  │
│  │   REST API           ←  /api/v1/*              │  │
│  │   liveness           ←  /healthz               │  │
│  │   readiness          ←  /readyz                │  │
│  │   MCP server         ←  (arrives in v0.1)      │  │
│  └───────────────────────┬────────────────────────┘  │
└──────────────────────────┼───────────────────────────┘
                           │ pgx
                     ┌─────▼─────┐
                     │ PostgreSQL│
                     │   16+     │
                     └───────────┘
```

## Key properties

- **Single binary, single origin.** The production web bundle is embedded into
  the Go binary (`apps/api/internal/web`), so there is no separate web server,
  no CORS, and the self-host story is "one app container + Postgres."
- **Contract-first.** `packages/shared/openapi.yaml` is the canonical API
  contract. The frontend consumes a TypeScript client generated from it
  (`openapi-typescript` + `openapi-fetch`); CI fails if the generated types
  drift from the spec.
- **Migrations at startup.** Schema migrations (goose, embedded SQL files in
  `apps/api/internal/db/migrations/`) apply automatically and idempotently when
  the binary starts. Readiness reports unready until the schema is current.
- **12-factor configuration.** All runtime configuration comes from
  `TESTPULSE_*` environment variables — the same mechanism under compose,
  Helm, or a bare binary. Missing required values fail fast at startup, naming
  the variable.
- **AI-native by design.** Agents will be first-class actors: scoped API
  tokens (never SSO), their own identity in RBAC and audit logs, and an MCP
  server compiled into the same binary, sharing the service layer with REST.
  This lands in v0.1 (see [ROADMAP](../ROADMAP.md)).

## Stack

| Layer | Choice | Why (short version) |
|---|---|---|
| Backend | Go 1.22+, chi, pgx | Tiny static binary (~20 MB image), K8s-ecosystem native, official MCP Go SDK |
| Frontend | React + TypeScript + Vite, shadcn/ui | Modern interactive UI; largest ecosystem |
| Database | PostgreSQL 16+ | Relational domain, JSONB for test steps, built-in FTS |
| Migrations | goose (embedded SQL) | Library API with `embed.FS` support |
| Contract | OpenAPI 3 | One canonical surface for UI, agents, and connectors |
| Images | distroless, multi-arch (amd64 + arm64) | Minimal attack surface, runs on x86 and ARM |
| License | AGPLv3 + DCO | Open source as differentiator; protects a future hosted offering |

## Repository layout

```
apps/api/          Go backend (cmd/testpulse-api + internal packages)
apps/web/          React UI (Vite)
packages/shared/   OpenAPI spec + generated TypeScript types
deploy/compose/    docker-compose evaluation stack
deploy/helm/       Helm chart (bundled or external PostgreSQL)
docs/              this documentation
openspec/          specs and change proposals (spec-first development)
```

## Domain model (direction, implemented from v0.1)

Project → TestCase / TestSuite (n:m) → TestRun → per-case Result.
Test cases are **immutably versioned**; a run pins each case to the version
current at run creation. Run items carry a current status
(`pending / pass / failed / skipped / blocked / retest`) plus an append-only
result log `{actor, timestamp, verdict, comment}` where the actor may be a
human or an agent.
