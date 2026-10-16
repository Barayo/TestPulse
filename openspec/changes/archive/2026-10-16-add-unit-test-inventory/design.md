## Context

`execution-import` (`apps/api/internal/service/execution_import.go`,
`openspec/specs/execution-import/spec.md`) is match-only by design: every
reported `<testcase>` must carry an explicit `testpulse_case_key`
matching an existing `TestCase`, or it's reported as unmatched and
dropped — never auto-created. This was a deliberate v1 boundary: `TestCase`
(`apps/api/internal/domain/domain.go:674`) is a fully versioned entity
with `CaseContent` (title, steps, description, priority, tags, custom
fields, parameters, Gherkin source — `domain.go:120`), and `RunItem`
(`domain.go:937`) pins a full `CaseContent` snapshot per row. Auto-creating
these from unit-test names would be both fragile (renames/moves break
name-based identity) and heavy (full content snapshot per row, at a
volume — tens of thousands of auto-discovered tests — this schema was
never sized for).

Issue #34 (surfaced 2026-07-15 while designing `execution-import`)
deliberately deferred the real use case underneath that restriction:
"which of our unit tests pass/fail, trending over time" is observability,
not curated test management, and deserves its own lean data shape rather
than a mode of Suite/Case/Run/RunItem.

An architecture review (Jose persona, 2026-10-16) validated the shape
below and surfaced one gap the brainstorming dialogue hadn't yet closed:
idempotency on ingestion retries, given CI's at-least-once delivery norms
and this capability's bounded (lossy) retention.

## Goals / Non-Goals

**Goals:**
- Zero-setup ingestion: accept a test runner's *native* JUnit XML
  (pytest/Jest/Maven/etc. with no TestPulse plugin installed, no
  `testpulse_case_key` property) and auto-create/update per-test records.
- Keep per-row cost low enough for tens-of-thousands-of-tests, many-times-
  a-day reporting: no versioned content, no joins on the hot "current
  status of every test" read path, bounded history per test.
- Give agents read parity (MCP tool) alongside the REST read endpoints,
  per the project's standing human-or-agent-actor rule.
- Make ingestion safely retryable (CI delivery is at-least-once in
  practice).

**Non-Goals:**
- No triage/assignment/manual editing of unit tests — this is a read-
  mostly observability surface, not a managed entity.
- No continuity across renames/moves — a changed `classname`/`name` starts
  a fresh identity; the old one simply ages out under retention. This is
  an explicit, accepted trade-off distinguishing this capability from
  curated `TestCase`s.
- No new web UI page this round — API/MCP only. A UI is a natural
  follow-up once there's real usage to inform it, not blocked by anything
  built here.
- No reuse of `TestCase`/`Suite`/`Run`/`RunItem` — a deliberately separate,
  smaller entity family.
- No per-project configurability of the retention bound (no settings UI
  exists for this capability) — a single server-wide constant/env var.

## Decisions

### D1: New dedicated endpoint, not a mode flag on `.../imports`
`execution-import`'s `POST /api/v1/projects/{projectKey}/imports`
response is a union of `Run` (201) or `ImportResult{Matched,Unmatched}`
(207) — both load-bearing on "a Run was created." This capability never
creates a `Run`. The project already walked back a similar conflation
once (`import-jobs` was split off from `.../imports` for TestRail-style
imports, per that change's own D3). New route:
`POST /api/v1/projects/{projectKey}/unit-test-results/import`.
**Alternative considered**: a `mode`/`format` flag on the existing
endpoint — rejected, forces every client to branch on whether a `Run`
body exists at all.

### D2: Two new tables, with denormalized latest-status on the identity row
```sql
CREATE TABLE unit_tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  class_name       text NOT NULL,
  name             text NOT NULL,
  first_seen_at    timestamptz NOT NULL,
  last_seen_at     timestamptz NOT NULL,
  last_verdict     text NOT NULL,
  last_duration_ms integer,
  last_occurred_at timestamptz NOT NULL,
  UNIQUE (project_id, class_name, name)
);

CREATE TABLE unit_test_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_test_id uuid NOT NULL REFERENCES unit_tests(id) ON DELETE CASCADE,
  verdict      text NOT NULL,
  duration_ms  integer,
  occurred_at  timestamptz NOT NULL,
  import_ref   text
);
CREATE INDEX unit_test_results_test_time_idx
  ON unit_test_results (unit_test_id, occurred_at);
```
`unit_tests` is the identity (project + classname + name — see D5) and
carries cached `last_*` columns, written in the same transaction as each
new result, so listing every test's current status never joins or
aggregates over `unit_test_results`. This deliberately diverges from
`TestCase`'s pattern (which always computes current status by joining,
with no cached column anywhere) because `TestCase`'s cardinality is low
(curated, hundreds per project) while this table is explicitly
high-cardinality. `verdict` reuses `domain.Verdict`'s existing string
values — no new enum. `import_ref` is a plain free-text provenance
column (no FK target exists for this capability).
**Alternative considered**: one merged table (identity + latest only, no
history) — rejected, "trending over time" (a stated goal) needs per-result
history, not just latest.

### D3: Reuse existing permissions — no new flag
Ingestion reuses `PermRunCreate`; reads reuse `PermRead`. No new
`Permission` constant is minted. The closest actual precedent for a new
small entity, `StepGroup`, also reused `PermRead`/`PermManageProject`
rather than minting a dedicated flag (`handlers.go:64-65`) — the earlier
ten-flag permission redesign split apart permissions that bundled
*unrelated* actions, it was never "every new resource gets its own flag."
Minting one here would also require touching `Role`'s struct/`Has()`
switch, the Role settings UI, default-role seeding, and the OpenAPI
`Role` schema — real ripple for a capability whose own scope excludes a
UI this round — and would undercut the "zero setup" goal, since a team
already running execution-import with a `runCreate`-scoped token would
otherwise need a Role edit first. The route/handler comment documents
this reuse explicitly, same as `execution_import.go`'s own style, noting
`PermRunCreate` is Run-flavored even though no `Run` is created here.

### D4: Bounded retention, pruned inline on write (no background worker)
Each test's history is capped at the last `N` results (default `N=100`,
via `TESTPULSE_UNIT_TEST_RESULT_RETENTION` env var — a code-level default
is also acceptable; no DB-backed setting since there's no settings UI for
this capability). Unlike `RunAutoArchiveWorker`/`RunRetentionWorker`
(which solve an *instance-wide age threshold* that can go stale purely by
the clock ticking, hence need a periodic sweep), this bound is a per-key
count that can only ever be violated by the exact write that would
violate it. So pruning happens inline, in the same transaction as the
insert, once per distinct unit test touched by an ingested report:
```sql
DELETE FROM unit_test_results WHERE id IN (
  SELECT id FROM unit_test_results
  WHERE unit_test_id = $1
  ORDER BY occurred_at DESC
  OFFSET $2
);
```
No goroutine started at server boot, no new worker file — a genuine
simplification versus the Worker pattern other retention features use,
not a weaker copy of it.

### D5: Identity = project + classname + name; no rename continuity
A unit test's identity is `(project_id, class_name, name)` — the JUnit
`<testcase classname="..." name="...">` pair, read directly off the
report, no `testpulse_case_key` property required (D1's "zero setup"
goal). A rename or file move changes that pair, so the old identity's
history simply stops accumulating and ages out under D4's bound while a
new identity starts fresh. This is an explicit, accepted trade-off: the
entire reason this capability exists separately from curated `TestCase`s
is that continuity-preserving matching is exactly the complexity this
surface is choosing not to carry.

### D6: `junitxml` parser gains a `ClassName` field
`apps/api/internal/junitxml/parser.go` currently parses `<testcase
name="...">` but never its `classname` attribute (not needed for
`execution-import`'s match-only semantics). D5 requires it. This is a
shared-infrastructure change, not a new parser — gets its own regression
test asserting `execution-import`'s existing match/verdict behavior is
byte-for-byte unaffected by the addition.

### D7: Idempotency via the existing MCP idempotency-key mechanism
CI systems retry failed/flaky uploads — at-least-once delivery is the
norm. Under D4's bounded retention, an un-deduplicated retry doesn't just
inflate counts, it silently evicts real history that should have survived
(the duplicate rows push genuinely older, distinct results out of the
last-`N` window). The ingestion request accepts an optional
`idempotencyKey` string; the service layer calls the same
`Service.IdempotentResult`/`SaveIdempotentResult` pair the MCP write
tools already use (`service/mcp_idempotency.go`, keyed on `(actorID,
toolName, idempotencyKey)` — the mechanism's signature was never actually
MCP-specific, just first introduced there), with `toolName` fixed to
`"unit_test_results.import"`. A retry with the same key returns the
original response instead of re-ingesting. Omitting the key preserves
current semantics: every call ingests fresh, matching every other
optional-idempotency-key endpoint in the system.
**Alternative considered**: content-based dedup (matching
`unit_test_id`+`occurred_at`+`duration_ms`) — rejected, two genuinely
distinct fast/identical-duration runs could collide and be silently
dropped; a client-supplied key has no such false-positive risk and
matches the existing MCP pattern's precedent.

### D8: Read endpoints and MCP parity
- `GET /api/v1/projects/{projectKey}/unit-test-results` — cursor-paginated
  list of every test's cached current status, optional `?verdict=`
  filter (the natural "what's red right now" query), `PermRead`.
- `GET
  /api/v1/projects/{projectKey}/unit-test-results/{classKey}/history` —
  bounded result history for one identity, newest first, `PermRead`.
  `classKey` is the human-typable `classname::name` pair (URL-encoded) —
  no synthetic opaque id is needed since nothing links to it from a UI
  this round.
- New MCP tool `list_unit_test_results`, mirroring `list_run_items`'s
  shape (`cursor`/`limit`, optional `entityType`-style `verdict` filter).
  No MCP tool for ingestion itself — CI systems POST JUnit XML directly
  over REST, not through an agent.

## Risks / Trade-offs

- **[Risk] Renamed/moved tests lose history** → Mitigation: explicitly
  accepted (D5); documented in the capability's own docs page as the
  defining trade-off versus curated cases, not left implicit.
- **[Risk] Retention bound set too low/high before real usage data
  exists** → Mitigation: a single env-var-overridable constant (D4), one-
  line change to adjust, no migration required to retune.
- **[Risk] Batch ingestion of a large report (tens of thousands of
  `<testcase>` entries) performs one DB round trip per test** →
  Mitigation: implement as a batched multi-row upsert (identity) +
  multi-row insert (results) + per-touched-identity prune, not a loop of
  single-row queries — consistent with the project's standing
  aggregation-performance-caution principle.
- **[Risk] `PermRunCreate` reuse reads oddly since no `Run` is created**
  → Mitigation: documented explicitly in code comments (D3), accepted as
  the lesser cost versus minting a new permission flag.

## Migration Plan

- New, additive migration (`unit_tests` + `unit_test_results` tables,
  goose-applied per the project's permanent incremental-migration policy)
  — no changes to existing tables, no backfill, safe to deploy
  independently of any other change.
- No rollback complexity: the new tables start empty; a rollback is
  simply not deploying/using the new endpoints, or a follow-up migration
  dropping them if ever fully abandoned.

## Open Questions

- None outstanding — all decisions above were validated through
  brainstorming dialogue and an architecture review before being locked
  here. The default retention `N=100` is a starting point, expected to be
  revisited once real usage data exists (not a blocker to v1).
