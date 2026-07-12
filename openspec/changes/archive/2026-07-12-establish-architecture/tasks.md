# Tasks: Establish Architecture

## 1. Repository foundation

- [x] 1.1 Initialize git repository and create monorepo layout (`apps/api`, `apps/web`, `packages/shared`, `deploy/compose`, `deploy/helm`)
- [x] 1.2 Add `LICENSE` (AGPLv3), `CONTRIBUTING.md` with DCO sign-off policy, and `README.md` with product vision and quickstart placeholder
- [x] 1.3 Add root tooling: `.gitignore`, `.editorconfig`, and a `Makefile` (or `justfile`) with `build`, `test`, `lint`, `dev` targets for both apps

## 2. Go API walking skeleton

- [x] 2.1 Scaffold `apps/api` Go module (Go 1.22+) with chi router and a structured logger; decide chi vs echo and record it in design.md Open Questions
- [x] 2.2 Implement environment-variable configuration loading with defaults, and fail-fast error naming any missing required variable
- [x] 2.3 Add PostgreSQL connectivity with pgx and a migration harness (decide goose vs golang-migrate; record decision); run migrations automatically at startup with an initial empty baseline migration
- [x] 2.4 Implement `/healthz` (liveness) and `/readyz` (readiness: DB ping + migrations current) endpoints
- [x] 2.5 Publish an OpenAPI 3 spec from the API (health endpoints + versioned `/api/v1` prefix) into `packages/shared`
- [x] 2.6 Add unit tests for config loading and readiness logic; wire `go vet`/`golangci-lint`

## 3. Web UI shell

- [x] 3.1 Scaffold `apps/web` with Vite + React + TypeScript, and set up shadcn/ui with a minimal layout shell (app title, empty dashboard placeholder)
- [x] 3.2 Generate the TypeScript API client from the OpenAPI spec in `packages/shared` and call the health endpoint from the UI to prove the contract loop
- [x] 3.3 Add lint (oxlint via Vite template) and typecheck scripts; decided production serving: web bundle embedded in the Go binary (recorded in design.md)

## 4. Containers and compose

- [x] 4.1 Write Dockerfile: multi-stage (web build → Go build with embedded assets → distroless)
- [x] 4.2 Create `deploy/compose/docker-compose.yml` with app (API + embedded UI) and PostgreSQL 16 (named volume, healthchecks, port 8080); verified compose up reaches healthy UI, readyz OK, migrations applied
- [x] 4.3 Verified data persistence across `docker compose down`/`up` (marker row survived; goose reported "no migrations to run")

## 5. Helm chart

- [x] 5.1 Scaffold `deploy/helm/testpulse` chart: Deployment/Service for the app (embedded web), Secret-driven env vars, liveness/readiness probes wired to `/healthz` and `/readyz`
- [x] 5.2 Add bundled PostgreSQL (default, enabled flag) and external-database values path (bundled DB disabled, connection settings supplied)
- [x] 5.3 Verified `helm install` with defaults on a local kind cluster reaches Ready (fixed runAsNonRoot needing numeric uid 65532), and the external-DB values path renders correctly via `helm template`

## 6. CI and images

- [x] 6.1 Add CI workflow (GitHub Actions): build, lint, and test for `apps/api` and `apps/web` on pull requests (plus Helm lint/render job)
- [x] 6.2 Add multi-arch (linux/amd64 + linux/arm64) image build and push to GHCR with buildx; manifest verification step included in the workflow (runs on first GitHub push)
- [x] 6.3 Add DCO check to CI

## 7. Verification and docs

- [x] 7.1 Walked every scenario in `specs/platform-deployment/spec.md`: compose up ✓, restart persistence ✓, helm default install Ready on kind ✓, external-DB render ✓, multi-arch build (amd64+arm64 via buildx) ✓ (native arm64-host pull covered by the release workflow's manifest check), env override ✓, missing config fail-fast ✓, migration idempotence ✓, readyz 503 / healthz 200 with DB down ✓
- [x] 7.2 Update `README.md` with real quickstart instructions (compose and Helm) and the AGPL internal-use FAQ note from design.md

## 8. Documentation baseline

- [x] 8.1 Create `docs/` with an index and core pages: architecture, getting-started, development, deployment (config reference), api
- [x] 8.2 Create `CLAUDE.md` establishing project conventions, including the standing rule that every change updates the affected docs
- [x] 8.3 Link the docs from `README.md` and `CONTRIBUTING.md`

## 9. Test automation baseline (TDD/BDD from here on)

- [x] 9.1 Go unit tests for the `internal/web` embedded-asset handler (static file, SPA fallback) — TDD'd via `handlerFor(fs.FS)` seam
- [x] 9.2 Go integration tests for `internal/db` (migrations apply, idempotence, readiness true/false) gated on `TESTPULSE_TEST_DATABASE_URL`
- [x] 9.3 Coverage gates: `make coverage-api` (internal ≥80%, currently 91.9%) and Vitest thresholds ≥80% (currently 92.3%)
- [x] 9.4 Web component tests with Vitest + Testing Library (App health-badge states via mocked API client) — 6 tests
- [x] 9.5 Playwright E2E suite mapped 1:1 to `platform-deployment` spec scenarios (BDD naming) — 5 scenarios green against compose stack
- [x] 9.6 Wired all test layers into CI (postgres service container, coverage gate in api job, vitest coverage in web job, new e2e job with trace upload)
- [x] 9.7 Documented the test strategy (docs/testing.md), updated development.md, and codified TDD/BDD as standing practice in CLAUDE.md
