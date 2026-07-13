# Development

## Prerequisites

- Go 1.22+
- Node.js 20+ (repo is an npm workspace)
- Docker (compose stack, integration verification)
- `golangci-lint` (Go linting), `helm` + `kind` (chart verification)

## First-time setup

```bash
git clone git@github.com:Barayo/TestPulse.git
cd TestPulse
npm install                 # web + shared workspaces
```

## Everyday commands

Everything routes through the root `Makefile` (`make help` lists targets):

| Command | What it does |
|---|---|
| `make dev-api` | Run the Go API locally (needs Postgres — e.g. the compose db) |
| `make dev-web` | Vite dev server with proxy to the API on :8080 |
| `make build` | Build API binary + web bundle |
| `make test` | Go tests + web typecheck |
| `make coverage-api` / `coverage-web` | Coverage with enforced 80% thresholds |
| `make test-db-up` / `test-db-down` | Throwaway Postgres for db integration tests |
| `make e2e` | Playwright E2E against the compose stack |
| `make lint` | golangci-lint + oxlint |
| `make generate` | Regenerate TypeScript client from `packages/shared/openapi.yaml` |
| `make sync-web` | Copy the web bundle into the API for embedded builds |
| `make compose-up` / `compose-down` | Full stack via docker compose |
| `make seed-demo` | Populate two realistic example projects for UI/design review |

A convenient local loop: `make compose-up` for Postgres + a running stack,
then `make dev-web` for UI work with hot reload against it.

## Demo/design-review data

`make seed-demo` (`apps/api/cmd/seed-demo`) populates two example projects
through the service layer — the same path the REST API uses, no direct SQL:

- **Banca Móvil** — a mature, dense project (nested folders including one
  with 30+ cases, 7 suites, several runs with mixed pass/fail/skip results).
- **Desktop App** — a brand-new project (a few folders, no suites, no runs
  yet), exercising empty states.

It's dev tooling only: never wired into server startup, and it only ever
touches whatever `TESTPULSE_DATABASE_URL` points at — same as `make dev-api`,
never a real deployment. Used throughout the `redesign-ui` change to validate
layout decisions against realistic content density instead of toy data.

## The contract workflow

1. Change the API surface → edit `packages/shared/openapi.yaml` **and** the Go
   handlers together.
2. Run `make generate` to refresh `packages/shared/src/api.ts`.
3. Commit both. CI regenerates and fails on drift.

## Spec-first workflow

Features start as OpenSpec changes (`openspec/changes/<name>/` with proposal,
design, specs, tasks) before implementation. Requirements live in
`openspec/specs/` once changes are archived. If you use Claude Code, the
`/opsx:*` skills drive this; the artifacts are plain Markdown either way.

## Embedded web assets

Production builds embed `apps/web/dist` into the Go binary at
`apps/api/internal/web/dist` (done automatically inside the Docker build; use
`make sync-web` for a local embedded build). The committed placeholder
`index.html` keeps `go build`/`go test` working without a web build. Don't
commit a real bundle over the placeholder.

## Conventions

- **TDD/BDD**: no production code without a failing test first; spec scenarios
  map to automated tests. Full strategy: [testing.md](testing.md).
- Commits: signed-off (`git commit -s`, DCO) — CI enforces this on PRs.
- Go: `gofmt`, `golangci-lint` clean; table-driven tests where natural.
- TypeScript: `oxlint` + `tsc -b` clean.
- Every behavior/config/API/deployment change updates the affected page in
  `docs/` in the same change — see [CLAUDE.md](../CLAUDE.md).
