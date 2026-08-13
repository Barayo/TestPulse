## Why

As the founder, pre-1.0.0, I want schema changes to be a single freely-edited `schema.sql` instead of a growing stack of incremental goose migration files, since there are no real customer deployments yet to preserve data for — the incremental-migration discipline (one file per change, never edit an already-applied one) exists specifically to protect a live deployment's data, a cost not worth paying while the schema is still settling and the only "production" instance (`testpulse.fly.dev`) is evaluation data, not customer data.

This is an explicit, deliberate **reversal** of the policy CLAUDE.md currently documents — that policy exists because of a real 2026-07-25 outage where editing an already-applied migration file broke `testpulse.fly.dev` (goose tracks applied migrations by version number, not content, so the edit was silently skipped, leaving the live schema out of sync with what the code expected). This change does not repeat that mistake by accident: it removes the versioned-history mechanism *entirely* rather than misusing it, and adds a loud startup-time checksum check so a schema/database mismatch is surfaced, not silent (see design.md).

**This policy is explicitly pre-1.0 only.** Before 1.0.0 ships with real customer deployments to protect, the project must adopt a real incremental-migration discipline again (goose or otherwise) — this proposal is not a permanent architecture decision, and CLAUDE.md must say so.

## What Changes

- **BREAKING**: Replace all 15 files under `apps/api/internal/db/migrations/` with a single `apps/api/internal/db/schema.sql`, generated from `pg_dump --schema-only` against a database that has all 15 migrations applied (byte-accurate to the current cumulative schema, not manually reconstructed).
- Remove the `github.com/pressly/goose/v3` dependency entirely.
- New startup behavior: on an empty database, apply `schema.sql` in full inside one transaction and record its SHA-256 checksum in a new singleton `schema_info` table. On a database that already has tables, do nothing except compare the stored checksum to the current binary's `schema.sql` — a mismatch is logged loudly and fails `/readyz` (not a startup crash), rather than the old silent-skip failure mode.
- Remove `TESTPULSE_ALLOW_MISSING_MIGRATIONS` — the migration-history-gap it recovered from cannot occur under this model (there is no history).
- Remove the CI `migrations` job (`.github/workflows/ci.yml`) that enforced migration-file immutability — no longer applicable; `schema.sql` is an ordinary source file.
- **Local/dev/CI/E2E databases that already have the old goose-tracked schema must be wiped** (`docker compose down -v`, or drop-and-recreate) to pick this up — same one-time cost `docs/development.md` already documented for the old pre-migration-policy workflow.
- **`testpulse.fly.dev` gets wiped and redeployed from `schema.sql`** — a distinct, explicitly-confirmed step, not bundled silently into a routine deploy.
- Update CLAUDE.md, `docs/database.md`, `docs/deployment.md`, `docs/architecture.md`, `docs/getting-started.md`, `docs/development.md` (the last one's already-stale "wipe your local DB" text becomes accurate again).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `platform-deployment`: "Automatic database migrations" requirement's mechanism changes from incremental goose migrations to a single idempotent `schema.sql` apply, including new mismatch-detection behavior.

## Impact

- `apps/api/internal/db/migrations/*.sql` (15 files) — deleted
- `apps/api/internal/db/schema.sql` (new) — the consolidated, `pg_dump`-derived schema
- `apps/api/internal/db/db.go` — replace goose-based `Migrate`/`MigrateWithOptions`/`MigrationsCurrent` with `ApplySchema`/`SchemaCurrent` (checksum-based)
- `apps/api/internal/db/db_test.go` + the three `*_schema_test.go` files — rewritten for the new mechanism
- `apps/api/internal/testutil/testutil.go` — update its `Migrate` call site
- `apps/api/cmd/testpulse-api/main.go`, `apps/api/cmd/seed-demo/main.go` — update call sites
- `apps/api/internal/config/config.go` — remove `AllowMissingMigrations`
- `apps/api/go.mod`/`go.sum` — drop goose
- `.github/workflows/ci.yml` — remove the `migrations` immutability job
- `CLAUDE.md`, `docs/database.md`, `docs/deployment.md`, `docs/architecture.md`, `docs/getting-started.md`, `docs/development.md`
- `deploy/compose/docker-compose.yml` volume users, local dev DBs, CI's ephemeral test DB, and `testpulse.fly.dev` all need a one-time wipe to adopt the new schema
