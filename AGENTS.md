# TestPulse — project instructions

Open-source, AI-native test management platform. Go API + embedded React UI +
PostgreSQL, developed **spec-first** with OpenSpec. These rules apply to any
contributor — human or AI, regardless of tool.

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
  Bug fixes start with a failing test that reproduces the bug — **every bug
  fix ships with a regression test that fails before the fix and passes
  after, no exceptions.**
- **Every spec scenario becomes an automated test**: OpenSpec `WHEN/THEN`
  scenarios are the BDD contract; E2E tests (`apps/web/e2e/`) carry
  requirement/scenario names in their titles. When writing tasks.md for a new
  change, tests are part of each task, not a trailing "add tests" task.
- **Coverage gates are enforced in CI**: Go `internal/...` ≥ 80%
  (`make coverage-api`), web ≥ 80% all metrics (`make coverage-web`). Don't
  lower thresholds to make a change pass; write the missing tests.
- **Automated tests passing is necessary but not sufficient.** Before
  calling any change with a runtime or UI surface complete, deploy it to a
  real running instance and exercise it manually through realistic,
  multi-step sequences — not just the one path a test covers.
- Test layers and commands: `docs/testing.md`. DB integration tests gate on
  `TESTPULSE_TEST_DATABASE_URL` (`make test-db-up`); E2E via `make e2e`.

## Review gating

- **Every change gets an independent review twice**: once before
  implementation, gating the proposed design/approach, and once after,
  checked against the actual diff/build (and a real running instance,
  where the change has one). Neither review substitutes for the other.
- **Always let a human review a freshly written proposal or design before
  implementation starts** — even mid-session, even during an otherwise
  autonomous run.
- **Any UI change needs a complete visual design** (mockup, real assets,
  real copy) with **explicit human validation before implementation code
  is written.** That review should weigh visual craft and polish as its
  own criterion, not only functional/usability correctness — a page with
  no functional bug can still deserve a visual-craft pass.
- When iterating against a reference design, extract its real computed
  styles rather than eyeballing it, validate the result against the live
  app with realistic data density (not a sparse demo state), and make
  concrete, opinionated design calls rather than presenting open-ended
  menus of options.

## Workflow

- Features start as OpenSpec changes (proposal → design → specs → tasks);
  implementation follows the tasks and checks them off as they complete.
- Every proposal or issue opens its problem statement with a one-line user
  story: *"As a {role}, when I {situation}, I want to {goal}."*
- Unscheduled ideas are tracked as GitHub Issues (label `backlog`) plus the
  Project board — not as prose in a planning doc.
- Before claiming in an issue, proposal, or status note that something
  doesn't exist or is unbuilt, **verify directly against the current source
  code** — prose docs and planning notes can be stale.
- **Security vulnerability alerts become a tracked, prioritized issue
  immediately upon discovery** (board status Planned), regardless of what
  else is in progress — never just mentioned in passing.
- GitHub Project board: move the corresponding card to **"In progress"** the
  moment implementation actually starts (first code/test written) — not
  retroactively, not only at the end. Once a change is committed, pushed,
  archived, and CI is green, move its card to **"To Review"** — never
  straight to "Done" and never before all four of those have happened. A
  human moves it to "Done" themselves after their own review.
- **Commit only once a logical change is complete and ready for review.**
  Squash incremental work-in-progress into one commit per logical change
  (not one per task/step), and one push per change — never bundling
  unrelated changes into the same push. Wait for explicit sign-off before
  committing or pushing, especially for a UI change that needs visual
  validation first.
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

- Modular monolith: one Go binary (chi, pgx, incremental migrations in
  `apps/api/internal/db/migrations/`), web bundle embedded via
  `apps/api/internal/web` (placeholder `dist/index.html` stays committed).
- **Migration policy, permanent: incremental migration files, applied via
  goose (`apps/api/internal/db/migrations/*.sql`, embedded via `go:embed`,
  applied with `goose.UpContext`).** One file per change; once a migration
  file has shipped, it is **never edited in place** — CI's `migrations` job
  (`.github/workflows/ci.yml`) fails the build if an already-merged
  migration file is edited, rather than relying on the policy as prose.
  This exists because of a real production outage (2026-07-25: an edited
  `00002_core_domain.sql` broke run creation/listing on
  `testpulse.fly.dev` site-wide, since goose tracks applied migrations by
  version number, not content, and silently skipped the edit) — the CI
  gate is what actually closes that failure mode, not just the stated
  policy. The project briefly reversed this (`replace-migrations-with-
  schema-sql`, 2026-08-13: a single `schema.sql` applied once to an empty
  database, checksum-verified thereafter) to avoid incremental-migration
  overhead while there were no real customer deployments to protect — but
  every schema edit under that model required a manual wipe-and-redeploy
  of any environment with existing data (local dev volumes, CI's ephemeral
  test DB, the E2E compose volume, `testpulse.fly.dev`), which turned out
  costlier than the discipline it replaced (`reinstate-incremental-
  migrations`, 2026-08-16, moved up from its originally planned "before
  1.0.0" trigger). `TESTPULSE_ALLOW_MISSING_MIGRATIONS` is a deliberate,
  off-by-default recovery escape hatch for a migration-history-gap
  incident (2026-08-03) — see `internal/db.MigrateWithOptions`.
- Contract-first: edit `packages/shared/openapi.yaml` together with Go
  handlers, then `make generate`; CI fails on drift.
- Config only via `TESTPULSE_*` env vars; required values fail fast by name.
- Liveness (`/healthz`) never depends on the database; readiness (`/readyz`)
  does.
- Agents are first-class actors (scoped API tokens, never SSO); every future
  capability treats "actor" as human-or-agent.
- All stack additions must be open source; images stay distroless and
  multi-arch (amd64 + arm64).
- **Any feature aggregating data across many entities** (counts, rollups,
  reports, coverage matrices) **must be computed server-side in a bounded
  number of queries** — never as a client-side per-entity fetch loop. Design
  for database scale from day one, not just the demo dataset's size.
