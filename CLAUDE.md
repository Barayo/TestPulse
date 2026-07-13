# TestPulse — project instructions

Open-source, AI-native test management platform. Go API + embedded React UI +
PostgreSQL, developed **spec-first** with OpenSpec.

## Documentation is part of every change (standing rule)

The project maintains comprehensive Markdown docs in `docs/` (index:
`docs/README.md`). **Any change that alters behavior, configuration, API
surface, deployment, or workflow must update the affected docs pages in the
same change** — and `README.md` / `ROADMAP.md` when scope or quickstart
instructions shift. Docs describe what exists; planned work belongs in
`ROADMAP.md` and OpenSpec changes. When writing tasks.md for a new change,
include a docs-update task.

## TDD/BDD is the standing practice

- **No production code without a failing test first** (red-green-refactor).
  Bug fixes start with a failing test reproducing the bug. Use the
  superpowers:test-driven-development skill when implementing.
- **Every spec scenario becomes an automated test**: OpenSpec `WHEN/THEN`
  scenarios are the BDD contract; E2E tests (`apps/web/e2e/`) carry
  requirement/scenario names in their titles. When writing tasks.md for a new
  change, tests are part of each task, not a trailing "add tests" task.
- **Coverage gates are enforced in CI**: Go `internal/...` ≥ 80%
  (`make coverage-api`), web ≥ 80% all metrics (`make coverage-web`). Don't
  lower thresholds to make a change pass; write the missing tests.
- Test layers and commands: `docs/testing.md`. DB integration tests gate on
  `TESTPULSE_TEST_DATABASE_URL` (`make test-db-up`); E2E via `make e2e`.

## Workflow

- Features start as OpenSpec changes (proposal → design → specs → tasks) via
  the `/opsx:*` skills; implementation follows the tasks and checks them off.
- The release ladder and per-version scope live in `ROADMAP.md`. Settled v0.1
  design decisions (versioning, run model, MCP tool surface, UI thickness) are
  recorded there — don't re-litigate them.
- Commits: DCO sign-off required (`git commit -s`); commits are SSH-signed via
  1Password (`gpg.format ssh`). Messages follow the
  [Angular/Karma commit convention](https://karma-runner.github.io/6.4/dev/git-commit-msg.html)
  (the same convention [Conventional Commits](https://www.conventionalcommits.org/)
  later formalized under that name): `type(scope): subject` header — lowercase
  subject, imperative mood, no trailing period, ~50 char target — optionally
  followed by a blank line, a wrapped body, and a footer for
  `BREAKING CHANGE: …` or issue references (`Closes #123`). Types: `feat`,
  `fix`, `docs`, `style`, `refactor`, `test`, `chore`. Chosen so automated
  semantic versioning (e.g. semantic-release/release-please) can be wired in
  later without a history rewrite. Already the de facto style in this repo's
  history; this makes it explicit and mandatory going forward.

## Commands

Route through the root `Makefile`: `make build / test / lint / dev-api /
dev-web / generate / sync-web / compose-up`. See `docs/development.md`.

## Architecture constraints (from establish-architecture)

- Modular monolith: one Go binary (chi, pgx, goose migrations in
  `apps/api/internal/db/migrations/`), web bundle embedded via
  `apps/api/internal/web` (placeholder `dist/index.html` stays committed).
- **Pre-1.0 migration policy**: no real deployment has data to preserve yet,
  so there is no upgrade path to protect. Amend the existing migration file
  for the schema in question in place — don't stack a new `000N_*.sql` file
  on every domain change. goose itself stays (its version-tracking is what
  makes "migrations apply automatically and idempotently at startup" true,
  a `platform-deployment` spec requirement) — only the "one file per change"
  habit stops. Switch to real incremental migrations once something ships
  that people actually run with real data (first public release / v1.0).
- Contract-first: edit `packages/shared/openapi.yaml` together with Go
  handlers, then `make generate`; CI fails on drift.
- Config only via `TESTPULSE_*` env vars; required values fail fast by name.
- Liveness (`/healthz`) never depends on the database; readiness (`/readyz`)
  does.
- Agents are first-class actors (scoped API tokens, never SSO); every future
  capability treats "actor" as human-or-agent.
- All stack additions must be open source; images stay distroless and
  multi-arch (amd64 + arm64).
