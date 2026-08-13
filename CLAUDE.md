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

## Sample Project showcase is part of every change (standing rule)

TestPulse ships with an always-on, automatically-seeded **Sample Project**
(`apps/api/internal/sampledata/seed.go`, `sample-data` capability) — the
product's showroom for anyone evaluating it. **Any change that adds or
meaningfully alters user-facing functionality must update `seed.go` (and
its test, `internal/sampledata/seed_test.go`) so the Sample Project's
content demonstrates the new capability**, the same way it must update
docs. The Sample Project is only useful as a showroom if it never drifts
behind what's actually shipped. When writing tasks.md for a new change,
include a Sample-Project-showcase task, not a trailing catch-all — and
apply it to every currently-planned change too, not just new ones.
Purely internal work with no new user-visible surface (infra, CI,
refactors, dependency bumps) is exempt; default to including the task
when in doubt.

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

- Modular monolith: one Go binary (chi, pgx, single `schema.sql` in
  `apps/api/internal/db/`), web bundle embedded via `apps/api/internal/web`
  (placeholder `dist/index.html` stays committed).
- **Migration policy, pre-1.0.0 only: no incremental migration files —
  `apps/api/internal/db/schema.sql` is the single source of truth, edited
  directly in place (`replace-migrations-with-schema-sql`).** This is a
  deliberate *reversal* of the incremental-migration discipline the project
  ran before (goose, one file per change, never edit an already-applied
  one) — that discipline existed because of a real production outage
  (2026-07-25: an edited `00002_core_domain.sql` broke run creation/listing
  on `testpulse.fly.dev` site-wide, since goose tracked applied migrations
  by version number, not content, and silently skipped the edit). This
  reversal does not repeat that failure mode: there is no version-tracked
  history to silently skip. `ApplySchema` (`internal/db`) applies
  `schema.sql` once, to an empty database, and records its checksum; on a
  database that already has it applied, a checksum mismatch fails
  `/readyz` *loudly* rather than serving traffic against a schema the
  binary doesn't match. There are no real customer deployments yet to
  protect the cost of incremental migrations exists for — `testpulse.fly.dev`
  is evaluation data, not customer data. **Local dev volumes, CI's ephemeral
  test DB, and E2E's compose volume all need a one-time wipe to pick up a
  `schema.sql` change** (`docker compose down -v` or equivalent) — there is
  no auto-upgrade path from an old schema to a new one, by design.
  **This is explicitly temporary: before 1.0.0 ships with real customer
  deployments, the project must adopt a real incremental-migration
  discipline again** (goose or otherwise, plus an equivalent CI
  immutability gate) — don't let this policy silently outlive its reason
  for existing.
- Contract-first: edit `packages/shared/openapi.yaml` together with Go
  handlers, then `make generate`; CI fails on drift.
- Config only via `TESTPULSE_*` env vars; required values fail fast by name.
- Liveness (`/healthz`) never depends on the database; readiness (`/readyz`)
  does.
- Agents are first-class actors (scoped API tokens, never SSO); every future
  capability treats "actor" as human-or-agent.
- All stack additions must be open source; images stay distroless and
  multi-arch (amd64 + arm64).
