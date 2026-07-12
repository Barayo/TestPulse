# Establish Architecture

## Why

TestPulse aims to be the first AI-native, MCP-first, open-source test management platform — territory no existing OSS tool (Kiwi TCMS, TestLink, Squash TM) or closed SaaS (TestRail, Qase) occupies. Before any feature work, the project needs its founding architecture decided and materialized: stack, repository layout, deployment story, and license. This change locks those decisions in and delivers a deployable walking skeleton that every subsequent change builds on.

## What Changes

- Record the founding architecture decisions (modular monolith, Go backend, React/TypeScript frontend, PostgreSQL, AGPLv3) as the project's baseline design.
- Scaffold the monorepo: `apps/api` (Go), `apps/web` (React + TypeScript + Vite), `packages/shared`, `deploy/compose`, `deploy/helm`.
- Implement a walking skeleton: Go API binary with health/readiness endpoints, configuration via environment variables, PostgreSQL connectivity with a migration harness, and a minimal web UI shell served alongside it.
- Provide the deployment baseline: working `docker-compose.yml` (API + web + PostgreSQL) and a Helm chart deploying the same stack to Kubernetes, with multi-arch (amd64 + arm64) container images.
- Establish the OpenAPI contract workflow: the API publishes an OpenAPI spec; the frontend consumes a generated client.
- Add project governance files: AGPLv3 `LICENSE`, DCO contribution policy, `README` with the product vision.
- Establish the documentation baseline: a `docs/` set (architecture, getting started, development, deployment, API) plus `CLAUDE.md` codifying the convention that every subsequent change updates the affected docs.
- Set up CI basics: build, lint, and test for both apps; container image builds.

Feature capabilities (test management, test execution, auth/SSO, RBAC, agent actors, MCP server, reporting) are intentionally **not** implemented here — each arrives in its own follow-up change on top of this foundation. Their architectural direction is fixed in `design.md` so those changes don't re-litigate it.

## Capabilities

### New Capabilities

- `platform-deployment`: How TestPulse is configured, deployed, and observed as a runnable system — docker-compose single-command startup, Helm-based Kubernetes deployment, multi-arch images, environment-variable configuration, health/readiness endpoints, and database migrations.

### Modified Capabilities

<!-- None — this is the founding change; no existing specs. -->

## Impact

- **Code**: New monorepo structure created from an empty repository; existing `package.json`/`package-lock.json` placeholders replaced by the real workspace layout.
- **Dependencies**: Go 1.22+, chi (HTTP router), pgx (PostgreSQL driver), a migration tool (goose or golang-migrate), React + TypeScript + Vite, OpenAPI codegen tooling.
- **Systems**: Requires PostgreSQL 16+ at runtime (provided by compose/Helm); container registry for published images (e.g., GHCR).
- **License**: AGPLv3 applies to the whole repository from this change onward; contributions accepted under DCO sign-off.
- **Follow-up changes unblocked**: the v0.1 MVP trio `add-core-domain`, `add-identity-basics`, `add-mcp-server`, then later rungs per `ROADMAP.md` (`add-sso-oidc`, `add-project-rbac`, `add-reporting`, `add-jira-connector`).
