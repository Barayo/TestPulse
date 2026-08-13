## Context

Every deployment target (docker-compose, Helm/Kubernetes, `testpulse.fly.dev` via `fly.toml`) applies schema changes exclusively through the app binary's own startup path (`cmd/testpulse-api/main.go` calls `db.MigrateWithOptions` before serving) — there is no separate migration step, init container, or release-command hook anywhere in the repo. Whatever replaces goose must keep living in that same startup path; introducing a separate step is out of scope here.

`goose` is a direct dependency used in exactly two files (`internal/db/db.go`, `db_test.go`); `TESTPULSE_ALLOW_MISSING_MIGRATIONS` exists solely to recover from a goose-specific failure mode (a version-history gap) that has no equivalent under a single-file schema. Down migrations have never been exercised anywhere (no code, no CI, no documented procedure calls them) — not a capability this change needs to preserve.

## Goals / Non-Goals

**Goals:**
- One `schema.sql`, freely edited in place pre-1.0 — no per-change file, no immutability rule, no CI gate for it.
- Startup stays idempotent and safe for rolling restarts (an unchanged requirement from `platform-deployment`'s existing spec).
- A schema/database mismatch is **loud** (logged, fails readiness), not silent — the property that would have caught the original 2026-07-25 outage, which this change must not regress.
- `schema.sql` is `pg_dump`-derived from applying all 15 existing migrations, not manually reconstructed — byte-accurate to what's actually deployed today.

**Non-Goals:**
- No incremental/diffing schema migration between two non-empty states — this model only ever applies `schema.sql` to an *empty* database. An existing populated database with an outdated schema is never auto-upgraded; it's a manual reset (see Risks).
- No down/rollback capability — matches current real usage (never exercised).
- This is not a permanent replacement for real migrations — see proposal.md's "explicitly pre-1.0 only."

## Decisions

- **Apply-once-to-empty, checksum-verify-on-restart**, not "diff and reconcile." A new singleton table `schema_info` (`id boolean PRIMARY KEY CHECK (id)`, matching `instance_settings`' existing pattern) stores a `checksum text` (SHA-256 of the embedded `schema.sql`) and `applied_at timestamptz`. Startup logic:
  1. Query `schema_info`. If the query fails because the table doesn't exist → empty database: run `schema.sql` in one transaction (creates every table including `schema_info` itself), insert the checksum row, done.
  2. If `schema_info` exists: compare its stored checksum to the current binary's `schema.sql` checksum. Match → proceed normally (this is the common "rolling restart" case, and is what keeps startup idempotent). Mismatch → log a loud warning naming both checksums and that a manual reset is required; `SchemaCurrent(ctx, pool)` (backing `/readyz`, mirrors today's `MigrationsCurrent`) returns `false` so the instance never silently serves traffic against a schema the binary doesn't actually match.
- **`pg_dump --schema-only` is the source of `schema.sql`**, not hand-merging 15 files. Procedure: migrate a throwaway database through all 15 existing goose files one last time, `pg_dump -s` it, strip pg_dump's boilerplate (`SET` session settings, `COMMENT ON EXTENSION`, ownership/privilege statements — none of which this project's deployments need), keep table/index/constraint/sequence DDL. This is mechanically verifiable (the resulting fresh-apply schema can be diffed against the goose-migrated one) rather than trusted by inspection.
- **Remove `TESTPULSE_ALLOW_MISSING_MIGRATIONS` outright**, not repurpose it. Its entire reason to exist — a goose version-history gap — cannot occur when there is no history, only "empty" and "has `schema_info`."
- **Existing non-empty databases (local dev volumes, CI's ephemeral test DB, E2E's compose volume, `testpulse.fly.dev`) all need a one-time manual wipe.** No migration path from "15 goose migrations applied" to "schema_info checksum row present" is built — that bridge is exactly the incremental-migration machinery this change is removing. `testpulse.fly.dev` specifically: wipe-and-redeploy is a distinct, explicitly-confirmed action (per the user's direct instruction), not silently bundled into a routine push to `main`.
- **CI's `migrations` immutability job is deleted, not repurposed.** There's no equivalent invariant to enforce — `schema.sql` is an ordinary file now. (A future 1.0-readiness change reintroducing real migrations would need to reintroduce an equivalent gate too — noted in CLAUDE.md so it isn't forgotten.)

## Risks / Trade-offs

[A database with the old goose-tracked schema but no `schema_info` row would be misread as "empty" by the new logic, and `schema.sql`'s `CREATE TABLE` statements would fail outright on already-existing tables] → This is intentional fail-fast, not a bug to paper over: it forces the required manual wipe rather than silently limping along on a half-applied state. Documented explicitly in the upgrade note in `docs/development.md` and this proposal.
[No auto-upgrade path means every future pre-1.0 schema.sql edit requires every developer/CI run/E2E run to wipe their database] → Accepted, matches this project's own documented pre-migration-policy workflow (`docs/development.md`'s already-stale "reset your local volume" text, which becomes accurate again) — cheap while the database holds nothing anyone needs to keep.
[This reverses a policy that was adopted specifically because of a real outage] → Addressed structurally, not just by good intentions: the failure mode that caused the outage (editing an *already-applied, version-tracked* file that gets silently skipped) cannot occur here because there is no version-tracked application history to silently skip — the checksum check either matches or loudly fails readiness. The proposal's "Why" section states this explicitly so a future reader doesn't mistake this for "we forgot why the policy existed."
[If this policy silently outlives its "pre-1.0 only" intent] → CLAUDE.md's rewritten policy paragraph states the reversal condition explicitly (real incremental migrations return before 1.0.0 ships with real customer deployments) — a future proposal, not a silent drift, is required to extend it past that point.
