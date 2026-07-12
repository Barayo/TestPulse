# Design: Establish Architecture

## Context

TestPulse starts from an empty repository. This change is the founding architecture decision record: every choice here constrains all subsequent changes, so alternatives and rationale are captured explicitly. The product goal is a real open-source project (not a toy): an AI-native test management platform whose differentiator is that AI agents are first-class users and the platform is MCP-first, while remaining trivially self-hostable.

Constraints from the product vision:

- Everything in the stack must be open source.
- Must run on Kubernetes **and** via a simple `docker-compose up`.
- Multiplatform: images for amd64 and arm64.
- Cheap to self-host — resource footprint is a feature for OSS adoption.
- Built with AI: the repo layout and contract-first workflow should maximize AI-assisted development effectiveness.

## Goals / Non-Goals

**Goals:**

- Fix the stack, repo layout, deployment model, and license so feature changes never re-litigate them.
- Deliver a walking skeleton: a deployable, healthy, empty application proving the whole pipeline (build → image → compose/Helm → running system with DB migrations).
- Establish the OpenAPI contract-first workflow between backend and frontend.

**Non-Goals:**

- No feature capabilities: no test management, auth, RBAC, MCP server, or reporting in this change. Their *direction* is fixed below; their requirements arrive in their own changes.
- No SQLite support (deferred; see Risks).
- No connector/plugin system — connectors will be external API/MCP clients, never in-process plugins.
- No SaaS/multi-tenant concerns.

## Decisions

### D1: Modular monolith

One Go backend service + one frontend + one database. Internal module boundaries (testcases, runs, auth, reporting, mcp) kept clean so a module could be extracted later if scale ever demands it.

- *Alternative — microservices*: rejected; solves scaling problems a zero-user project doesn't have, and destroys the docker-compose simplicity story.

### D2: Monorepo

Single repository:

```
testpulse/
├── apps/api/          # Go backend (REST + MCP + auth)
├── apps/web/          # React + TypeScript + Vite UI
├── packages/shared/   # OpenAPI spec, generated clients, shared assets
├── deploy/compose/    # docker-compose.yml
├── deploy/helm/       # Helm chart
└── openspec/          # specs drive AI-assisted development
```

- *Rationale*: atomic cross-stack changes, one-clone onboarding, and full context in a single window for AI-assisted development.
- *Alternative — multi-repo*: rejected for now; reconsider only if a connector SDK grows an external contributor ecosystem.

### D3: Go backend

Go 1.22+, chi router, pgx driver, single static binary, distroless base image.

- *Rationale*: ~20 MB images idling at ~30 MB RAM is a genuine feature for self-hosters; Go is the K8s-ecosystem native tongue (Gitea is the spiritual reference: one binary, embedded UI assets); official MCP Go SDK exists, so the MCP server later lives in-process.
- *Alternatives*: TypeScript/Node (best type-sharing with UI, but ~10x runtime footprint); Java/Spring (user knows it, but heaviest footprint); Python/FastAPI (great AI libs, but AI features here are client-side agents via MCP, not server-side ML).

### D4: React + TypeScript + Vite frontend

SPA in `apps/web`, shadcn/ui component library, production assets served by the Go binary (embedded) or a static container — compose/Helm decide.

- *Alternative — server-rendered Go templates*: rejected; a modern interactive UI is table stakes against TestRail-class competition.

### D5: OpenAPI contract-first

The Go API publishes an OpenAPI 3 spec; the frontend consumes a generated TypeScript client from `packages/shared`. This replaces same-language type sharing and gives MCP and external clients a canonical contract.

### D6: PostgreSQL 16+, Postgres-only v1

JSONB for flexible test-step payloads, built-in full-text search for test case search, boring reliability. Migrations run automatically at API startup (goose or golang-migrate).

- *Alternative — also SQLite (Gitea-style zero-dep mode)*: attractive for trial UX, deferred to keep v1 persistence simple; docker-compose already makes Postgres a one-command dependency. Repository layer stays behind interfaces so this can be revisited.

### D7: Auth direction (implemented in a later change, fixed here)

TestPulse is an **OIDC client** (Authorization Code + PKCE) against any external IdP — Keycloak, Dex, Google, Entra, Okta — plus a built-in local user store (bcrypt) for the simple case. SSO includes JIT provisioning, claim→role mapping, and an SSO-only enforcement toggle. TestPulse never bundles an IdP as a required dependency. SAML, SCIM, and multiple simultaneous IdPs are deferred.

### D8: AI-native = agents as first-class actors (fixed here, implemented later)

Agents authenticate with scoped API tokens (never SSO), have their own identity in RBAC and audit logs, and interact through the same REST API and the in-process MCP server. Every capability spec written later must treat "actor" as human-or-agent.

### D9: RBAC direction (fixed here, implemented later)

Roles `admin` / `manager` / `tester` / `viewer`, assigned per project. Roles live in TestPulse, not the IdP; IdP claims can only *map into* these roles.

### D10: Domain model direction (fixed here, implemented later)

Project → TestCase and TestSuite (n:m) → TestRun → per-case Result (pass/fail/skip). Reporting is a query API consumed equally by the UI and MCP agents.

### D11: Deployment: compose + Helm, multi-arch

`docker-compose up` brings up API + web + Postgres for evaluation and development. A Helm chart deploys the same stack to Kubernetes for production. CI publishes multi-arch (amd64 + arm64) images to GHCR. Configuration is environment-variable driven (12-factor) so both deployment modes share one mechanism.

### D12: License: AGPLv3 + DCO

- *Rationale*: open-source-ness is the differentiator against closed SaaS competitors, so the license must be OSI-approved (rules out BSL/FSL/Elastic). AGPL protects a future "TestPulse Cloud" from being commoditized (the Grafana/MinIO play). As a self-contained application deployed unmodified, AGPL imposes zero obligations on internal enterprise use, blunting the usual AGPL adoption objection. DCO instead of CLA maximizes contributor trust; it forecloses dual-licensing, judged not worth the friction.
- *Alternative — Apache 2.0*: the genuine fork; maximizes adoption but leaves a hosted offering unprotected. Revisit only before the first external contribution lands (relicensing is cheap while contributor count is one).

## Risks / Trade-offs

- **Go is new to the maintainer** → Small language surface, Java-adjacent typing, and AI-assisted development flatten the curve; chi + pgx are idiomatic, well-documented choices.
- **AGPL may deter some enterprise adopters** → Positioning: unmodified internal use carries no obligations; document this in the README/FAQ. Relicensing to Apache 2.0 remains possible while the contributor base is small.
- **Postgres-only raises the "just try it" barrier vs a single binary** → docker-compose one-liner is the trial path; repository interfaces keep a future SQLite mode feasible.
- **OpenAPI codegen adds build plumbing** → Accepted cost; the contract is also the MCP/connector surface, so it pays for itself. Pin codegen tool versions in CI.
- **Walking skeleton has no user-visible value** → Deliberate; it de-risks the entire deployment story before feature investment.

## Migration Plan

Greenfield — no migration. Deployment of the skeleton itself validates: compose up on amd64/arm64, Helm install on a local K8s (kind/k3d), migrations run idempotently, health endpoints green. Rollback is deleting the stack.

## Open Questions

- ~~chi vs echo~~ **Decided: chi** — stdlib-adjacent, minimal surface.
- ~~goose vs golang-migrate~~ **Decided: goose** — clean library API with `embed.FS` support, simple SQL migration format.
- ~~Embed web assets in the Go binary vs separate static container~~ **Decided: embed** — single origin (no CORS), one app container + Postgres everywhere, matches the D3 single-binary story. Build pipeline copies `apps/web/dist` into `apps/api/internal/web/dist` before compiling; a committed placeholder keeps web-less builds working.
- GHCR vs Docker Hub as primary registry (leaning GHCR alongside GitHub hosting).
