## Context

`RunInput.SuiteID` (`service.go`) is already threaded through `CreateRun` to
populate a new run's items from a suite's cases, but the suite reference is
discarded after that — `RunRepo.Create` never persists it, and `domain.Run`
has no field for it. Nothing today can answer "which runs came from suite
X?", which #77 (suite-level pass-rate trend) needs.

## Goals / Non-Goals

**Goals:**
- Persist the suite a run was created from, nullable.
- Expose it on the `Run` resource (`suiteKey`) for API/UI consumers.

**Non-Goals:**
- No suite-level reporting UI — that's #77, built on top of this.
- No backfill for existing runs — pre-1.0, no production data to preserve
  (CLAUDE.md migration policy). Existing rows simply get `suite_id = NULL`.
- No way to change a run's suite after creation — the reference is set once,
  at `Create`/`Import` time, matching the existing "cases pinned at creation"
  philosophy for runs.

## Decisions

**Column: `suite_id uuid NULL REFERENCES test_suites(id)` on `test_runs`,
not a `suite_key` text column.** Every other cross-entity reference in this
schema (`test_run_items.case_id`, `suite_cases.case_id`) stores the internal
UUID and resolves the human-readable key via a join at read time — same
pattern as `Run.ProjectKey`, which is resolved via `JOIN projects p ON
p.id = tr.project_id` in `Get`/`List` rather than stored redundantly.
Consistency with that existing convention over a denormalized key column.

**`ON DELETE SET NULL`, not `ON DELETE CASCADE` or `RESTRICT`.** A suite can
be deleted (add-delete-mode) independently of any runs it was once used to
create — a run's pinned items and results must survive the suite's deletion
untouched (same reproducibility guarantee that already protects a run from
a case being edited or deleted). Losing the "which suite" provenance link
when the suite itself is gone is an acceptable, minor loss; losing the run's
results would not be.

**`domain.Run.SuiteKey *string`, not a plain `string`.** A run with no
source suite must serialize as `"suiteKey": null` in the API/OpenAPI schema,
not `""` — the zero value for a Go pointer maps directly to JSON `null`,
while a plain string can't distinguish "no suite" from "empty string" (not
that an empty suite key is possible, but the pointer is the honest type for
an optional foreign key).

**`Import` (JUnit-XML import path) does not gain a suite parameter.** An
imported run has no suite by construction — it's built from parsed test
results, not a suite's case list. Its `suite_id` stays `NULL`, no signature
change needed there.

## Risks / Trade-offs

[Risk] Every existing `RunRepo.Get`/`List`/`Create`/`Import` query and their
callers' `Scan()` argument lists need updating in lockstep, and a missed one
fails loudly at compile/test time (Go's `Scan` is positional) rather than
silently — low risk in practice, mitigated by the store package's existing
integration test coverage.

## Migration Plan

Amend `00002_core_domain.sql`'s `test_runs` table definition in place (add
the `suite_id` column to the existing `CREATE TABLE`), per CLAUDE.md's
pre-1.0 policy — no new `000N_*.sql` file. goose's existing up/down still
applies idempotently on a fresh `docker compose up`.
