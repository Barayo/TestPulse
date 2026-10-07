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
| `make perf-api` | Run the k6 API load test suite (needs compose stack + `seed-demo` + a scoped token — see `apps/api/perf/README.md`) |

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

It creates no users of its own, only projects/cases/suites/runs via the
service layer — so under `add-project-rbac`'s project-scoped access, the
seeded projects stay fully visible to whichever Tenant Admin ran it
(implicit access to every project) with no extra setup. If a future change
adds non-Tenant-Admin seed users, remember they'll need explicit
`project_members`/`project_team_roles` rows (or they'll see an empty
project list) — see [Test management](test-management.md#project-roles-and-teams).

## Logging in locally

Every domain route requires authentication (`add-identity-basics`). A fresh
database has no users, so set `TESTPULSE_ADMIN_EMAIL` /
`TESTPULSE_ADMIN_PASSWORD` before first startup — the API seeds one Tenant
Admin from them if (and only if) the `users` table is empty, then never
touches them again on later restarts:

```bash
export TESTPULSE_ADMIN_EMAIL=admin@example.com
export TESTPULSE_ADMIN_PASSWORD=correcthorsebatterystaple
make dev-api   # or docker compose, which already sets these for the
               # evaluation stack — see deploy/compose/docker-compose.yml
```

If you skip this, `make dev-api` still starts — visit `/setup` to create
the admin account interactively instead (`add-first-run-setup`). Fine for
local dev; see [Deployment](deployment.md)'s network-exposure warning
before relying on this for anything reachable by anyone else.

Then log in at `/login` with those credentials, or via `curl`:

```bash
curl -i -c cookies.txt -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"correcthorsebatterystaple"}'
curl -b cookies.txt http://localhost:8080/api/v1/projects
```

A Tenant Admin can create further users at `/settings/users` and teams at
`/settings/teams` (both linked from the top-level Admin menu); any
authenticated user can create scoped API tokens for agents at
`/settings/tokens`, and set their own display name, avatar, timezone, and
(when a Tenant Admin has enabled per-user language customization)
language at `/settings/profile` (`add-user-profile`, `add-ui-i18n`) — both linked from the header's
account menu, which shows the user's chosen (or generated-default) avatar
in place of plain email text. A newly-created user has no project access until a
Tenant Admin assigns them a role on a project (directly, or via a team) —
see [Test management](test-management.md#project-roles-and-teams).

The schema is built from incremental migration files
(`apps/api/internal/db/migrations/`) — see CLAUDE.md's migration policy. A
new migration applies automatically on your next `make dev-api` /
`make compose-up`, on top of whatever your local database already has; no
volume reset needed for a normal schema change. The one exception was the
one-time `reinstate-incremental-migrations` transition itself (2026-08-16),
which — like any earlier `schema.sql` edit under the retired apply-once
policy — required a full local reset (`docker compose down -v` before
`make compose-up` again, or dropping and recreating your local `dev-api`
database) to pick up goose's bookkeeping table.

## Testing password recovery locally

`deploy/compose/docker-compose.yml` bundles
[Mailpit](https://mailpit.axllent.org/) (`axllent/mailpit`, MIT-licensed) as
a fake SMTP server — permanently part of the evaluation/local-dev stack,
not an E2E-only override, so `passwordResetEnabled` is `true` out of the
box for anyone running `make compose-up`. Request a reset at `/forgot-password`,
then read the actual sent email at Mailpit's own web UI,
**http://localhost:8025** — no separate configuration needed. `make e2e`'s
suite (`apps/web/e2e/forgot-password.spec.ts`) exercises the same real
`net/smtp` code path end-to-end via Mailpit's REST API rather than a stub.
The real `testpulse.fly.dev` deployment uses `fly.toml`, not this compose
file, and has no SMTP configured unless its operator sets one up.

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
