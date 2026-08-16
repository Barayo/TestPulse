## Context

`apps/api/internal/db/` currently applies a single `schema.sql` once to an
empty database (`ApplySchema`), recording a SHA-256 checksum in a
`schema_info` table; `/readyz` fails loudly if a later binary's `schema.sql`
checksum doesn't match what's recorded. This is the `replace-migrations-with-
schema-sql` change (2026-08-13), a deliberate, explicitly-temporary reversal
of the incremental-migration discipline the project ran before that (goose,
`apps/api/internal/db/migrations/*.sql`, one file per change, CI-enforced
immutability) — that discipline existed because of a real production
outage (2026-07-25: goose tracks applied migrations by version number, not
content, so an edited-in-place `00002_core_domain.sql` was silently skipped
on `testpulse.fly.dev`, which had already applied that version, and broke
run creation/listing site-wide).

`schema.sql`'s cost turned out to be different from what it removed: instead
of a silent-skip risk, every edit to `schema.sql` is a breaking change for
any environment with existing data, because `ApplySchema` only knows "empty
database" and "already applied, checksum must match" — there is no third
state for "applied, but an older version." `add-data-retention` (2026-08-16)
needed two separate `testpulse.fly.dev` wipe-and-redeploy cycles in one
session on top of an earlier 2026-08-13 incident, on top of the standing
requirement to wipe local dev volumes, CI's ephemeral test DB, and the E2E
compose volume on every schema edit. The user judged this "too much rework"
and asked to reverse the policy now rather than wait for its original
"before 1.0.0 ships with real customer deployments" trigger.

## Goals / Non-Goals

**Goals:**
- Restore incremental, additive schema changes: a new migration file per
  change, applied on top of whatever a given environment already has,
  with no wipe required for *future* changes.
- Re-close the 2026-07-25 failure mode (silent skip of an edited migration)
  with the same CI-enforced immutability gate that closed it before.
- Keep the "readiness fails loudly rather than silently serving a mismatched
  schema" property `schema.sql` was built around — goose's own version
  comparison gives this for free.
- Absorb the migration-to-goose transition itself as a single, acknowledged,
  one-time wipe per environment (local, CI, E2E, Fly) rather than pretending
  it can be avoided.

**Non-Goals:**
- Resurrecting the original 14-file migration history (`00001_baseline.sql`
  through `00014_cascade_user_deletion.sql`, last present in git history at
  `6bb287f^`). It's gone from disk; reconstructing it, or hand-writing
  synthetic migrations for every `schema.sql` edit since (D1–D9 retention,
  password-change fields, etc.), buys historical fidelity nobody needs and
  still ends in the same one-time wipe, since no live database has goose's
  bookkeeping table right now regardless of how the history is reconstructed.
- Zero-downtime migration tooling (expand/contract patterns, online schema
  change). Out of scope — the project has no real customer deployments yet;
  a brief startup-time migration window is acceptable. This may need
  revisiting whenever that stops being true, but that's a separate change.
- Changing anything about `TESTPULSE_*` config conventions beyond adding back
  the one migration-related variable.

## Decisions

**Migration tool: goose, restored to its pre-removal shape.**
`apps/api/internal/db/db.go`'s `Migrate` / `MigrateWithOptions` /
`MigrationsCurrent` functions are restored from git history at `6bb287f^`
(the commit immediately before their removal) essentially unchanged —
`goose.SetBaseFS` over an embedded `migrations/*.sql`, `goose.UpContext` to
apply, `goose.GetDBVersionContext` + `goose.CollectMigrations` to compare
applied-vs-latest for `/readyz`. This was a known-good implementation
already proven in production before its removal; there's no reason to
redesign it. Alternatives (`golang-migrate`, `atlas`) were not seriously
considered — goose already has a real incident history in this project on
both sides of the ledger (the outage it enabled, and the fix that closed it),
so switching tools now would mean re-learning that history with a new tool
instead of reapplying the lesson already learned.

**Baseline: one fresh `00001_baseline.sql`, not reconstructed history.**
The new baseline migration is today's full schema (structurally what
`schema.sql` contains now) as a single goose "up" file. This was chosen
over resurrecting the original history because every live environment is
already past all 14 original migrations plus everything `schema.sql` added
since — there is no environment that would ever replay `00001`...`00014`
from scratch. A single baseline is simpler, and the git history remains
available (at `6bb287f^` and via `schema.sql`'s own commits) for anyone who
needs the archaeology later.

**`schema.sql` is deleted, not kept as a generated reference doc.**
Keeping both a generated `schema.sql` and the authoritative
`migrations/*.sql` was considered and rejected: it reintroduces exactly the
dual-source-of-truth risk this whole reversal exists to get rid of, for a
readability benefit `psql \d` or a fresh `goose up` against a scratch
database already provides.

**Escape hatch (`TESTPULSE_ALLOW_MISSING_MIGRATIONS`) restored verbatim.**
This existed for a real, separate incident (2026-08-03: a stale build
silently omitted one migration file from its embed, leaving a permanent
version gap goose refused to fill by default) and is off by default —
goose's strict refusal is correct in the overwhelming majority of cases.
Restoring it costs nothing and keeps the one documented recovery path for
that specific failure mode available.

**CI immutability gate restored as-is.**
The `migrations` job diffs `apps/api/internal/db/migrations/` against the PR
or push base ref and fails on any file with git status `M`. This is the
control that actually enforces "never edit an already-applied migration" —
without it, the policy is prose in `CLAUDE.md` that nothing stops someone
from violating under time pressure, which is exactly how the 2026-07-25
outage happened.

## Risks / Trade-offs

- **[Risk] Rollout crash-loops `testpulse.fly.dev`.** Fly auto-deploys `main`
  independent of CI/review; the moment this merges, the live binary expects
  a `goose_db_version` table that doesn't exist yet, and `/readyz` (which
  gates traffic) fails. → **Mitigation**: this is an *expected*, planned step
  of this change (see tasks.md), using the same documented wipe-and-redeploy
  procedure already used twice this session — not a bug to react to after
  the fact.
- **[Risk] Local/CI/E2E environments break silently after pulling this
  change.** A developer or CI run with an existing volume from the
  `schema.sql` era has a `schema_info` table but no `goose_db_version` table
  — `MigrationsCurrent` will error, not silently pass. → **Mitigation**: this
  surfaces as a clear, actionable startup error (missing bookkeeping table),
  and `docs/development.md` documents the one-time
  `docker compose down -v` (or equivalent) wipe as part of this change's
  rollout, matching the existing precedent for schema.sql edits.
- **[Trade-off] Reintroduces goose as a dependency and ~230 lines of
  migration-application code that `schema.sql`'s apply-once model didn't
  need.** Accepted deliberately — the operational cost `schema.sql` imposed
  (wipe on every future schema change, forever) is strictly worse than the
  one-time cost of restoring a previously-working tool.

## Migration Plan

1. Implement the goose-based `db` package, the baseline migration, config,
   and CI gate on a branch; all tests green locally against a fresh
   (wiped) local Postgres volume.
2. Merge to `main`. This will crash-loop `testpulse.fly.dev`'s automatic
   Fly deploy — expected, not a rollback trigger.
3. Run the documented recovery procedure against `testpulse.fly.dev`: a
   temporary env-var-gated wipe step in `main.go`, deployed directly via
   `flyctl deploy --strategy immediate` (bypassing git/CI, never committed),
   verified via `flyctl logs` / `curl /readyz`, then reverted and redeployed
   clean (confirmed via an empty `git diff`).
4. No rollback path is provided for step 2–3 beyond re-running the same wipe
   procedure — there is no customer data on `testpulse.fly.dev` to preserve
   (per `CLAUDE.md`: it's evaluation data), so "wipe and reapply" is an
   acceptable, deliberately simple recovery for this one transition.

## Open Questions

None — every decision above was reviewed and approved before writing this
document.
