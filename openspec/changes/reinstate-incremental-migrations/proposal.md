## Why

As the operator of `testpulse.fly.dev` and every local/CI environment, when I ship a schema change, I want it to apply without a manual wipe-and-redeploy — the current pre-1.0 policy (`replace-migrations-with-schema-sql`: one `schema.sql`, edited in place, applied once to an empty database) crash-loops any environment with existing data on every schema edit, requiring the documented recovery dance every time. The `add-data-retention` change alone needed two separate Fly wipe-and-redeploy cycles in one session, on top of an earlier 2026-08-13 incident — too much rework to keep paying on every future schema change, so this reversal moves up from its originally planned "before 1.0.0 ships with real customer deployments" trigger to now.

## What Changes

- Restore `pressly/goose/v3`-based incremental migrations: `apps/api/internal/db/migrations/*.sql`, embedded via `go:embed`, applied with `goose.UpContext` — idempotent, additive, no more environment wipes after the one-time transition below.
- **BREAKING** (operational, not API): delete `apps/api/internal/db/schema.sql`; the migrations directory becomes the sole source of truth. One new `00001_baseline.sql` captures today's full schema as goose's starting point — the original pre-removal 14-file history is not resurrected.
- One-time transition: every environment tracking schema via the `schema_info` checksum table (local dev volumes, CI's ephemeral test DB, the E2E compose volume, `testpulse.fly.dev`) needs one more wipe to adopt goose's `goose_db_version` bookkeeping table.
- Restore `TESTPULSE_ALLOW_MISSING_MIGRATIONS`, the escape hatch added after the 2026-08-03 migration-history-gap incident.
- Restore the CI `migrations` job in `.github/workflows/ci.yml` that fails the build if an already-merged migration file is edited in place (the check that closes the 2026-07-25 production-outage failure mode).
- `CLAUDE.md`'s "Architecture constraints" section drops the `replace-migrations-with-schema-sql` paragraph and reinstates incremental migrations as **permanent** policy, not "pre-1.0.0 only."
- `docs/architecture.md` updated to describe the goose-based model in place of the apply-once/checksum model.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `platform-deployment`: the "Automatic database migrations" requirement changes from apply-once-to-empty-database-with-checksum-verification to incremental goose-based apply-only-pending-migrations, while keeping what's still true (idempotent startup, readiness fails rather than silently serving a schema mismatch).

## Impact

- **Code**: `apps/api/internal/db/` (db.go, schema.sql removed, migrations/ restored), `apps/api/internal/config/config.go` (new env var), `apps/api/cmd/testpulse-api/main.go`, `apps/api/cmd/seed-demo/main.go`, `.github/workflows/ci.yml`.
- **Dependencies**: re-adds `github.com/pressly/goose/v3` and `github.com/jackc/pgx/v5/stdlib` to `apps/api/go.mod`.
- **Operational**: local dev volumes, CI's ephemeral test DB, the E2E compose volume, and `testpulse.fly.dev` all require a one-time wipe on rollout (documented recovery procedure, expected step of this change).
- **Docs**: `CLAUDE.md`, `docs/architecture.md`, `docs/development.md` (if it documents the wipe-on-schema-change caveat).
