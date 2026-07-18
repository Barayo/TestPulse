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
│  │   MCP server         ←  (arrives with add-mcp) │  │
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
- **AI-native by design.** Agents are first-class actors (`add-identity-basics`):
  every request resolves to an `Actor` — a human via session cookie, or an
  agent via scoped API token — carried through `context.Context` (mirroring
  the JSON-request-scoped-value pattern used elsewhere) rather than threaded
  through every service method's parameters. A token acts as its own actor,
  never impersonating the human who created it, at that human's *current*
  permission level, resolved fresh on every request (`add-project-rbac`).
  One instance-wide `Tenant Admin` flag plus three project-scoped roles
  (Tester < Contributor < Project Admin), assignable directly or via a
  Team — see [Test management](test-management.md#project-roles-and-teams).
  OIDC SSO is v0.2. An append-only audit log records every write's actor.
  MCP itself (`add-mcp-server`, next v0.1 change) will authenticate agents
  via the same tokens (see [ROADMAP](../ROADMAP.md)).
- **Minimalist design system.** A small, deliberate teal palette
  (`background`/`surface`/`ink`/`primary`/`warn`/`fail`) implemented as CSS
  custom properties in `apps/web/src/index.css`; `primary` is pulled directly
  from the brand mark's gradient (`assets/brand/testpulse-icon.svg`) and
  doubles as the `pass` semantic, `fail` reserved strictly for
  `fail`/`blocked`. Personality comes from weight/tracking on the
  already-loaded Geist Sans/Mono, not a new display typeface. Navigation is
  built around one active project at a time: a compact header switcher
  (`ProjectSwitcher`, click or ⌘K) rather than an always-visible sidebar, a
  three-panel project landing (Library/Suites/Recent runs), a two-pane
  library explorer (`FolderExplorerPage` + `FolderTree` — user-facing copy
  says "Library"/"Section," the underlying `Folder` domain type/API/table
  names are unchanged) for browsing/creating sections and cases, a
  `SuiteDrawer` for per-suite case membership, and a breadcrumb trail
  (`Breadcrumbs`) throughout — see the `redesign-ui` change's `design.md`
  for the full rationale.

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

## Domain model

Project → TestCase / TestSuite (n:m) → TestRun → per-case Result.
Test cases are **immutably versioned**; a run pins each case to the version
current at run creation (or when added to an open run) — never at execution
time. Run items carry a current status
(`pending / pass / failed / skipped / blocked / retest`) plus an append-only
result log `{actor, timestamp, verdict, comment}` where the actor is still a
free-text field independent of `add-identity-basics`'s real `Actor` concept
(linking the two — pre-filling `actor` from the authenticated caller — is
unstarted follow-up work, not part of that change). Full schema and
rationale: [database.md](database.md).

Implementation layout inside `apps/api/internal/`:

```
domain/    types + invariants (Status, Verdict, CaseContent, validation) —
           no I/O, shared by store, service, and (later) MCP
store/     pgx repositories; owns transactions for multi-step invariants
           (version bump + insert, result append + status update, ...)
service/   use cases composing stores; validates input before any storage
           access; this is what REST handlers — and later MCP tools —
           call into
server/    HTTP only: routing, request decode, response encode, error
           → status code mapping
```

The REST API surface is documented in [api.md](api.md); the user-facing
workflow (versioning in practice, the run execution board) is in
[test-management.md](test-management.md).
