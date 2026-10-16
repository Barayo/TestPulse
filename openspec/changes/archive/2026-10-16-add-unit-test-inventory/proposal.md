## Why

As a developer or QA engineer with thousands of unit tests in CI, when I
want to see which of them pass/fail and how that trends over time, I want
to point TestPulse at my test runner's native JUnit XML — without
hand-authoring a curated `TestCase` per unit test — so I get visibility
into unit-test health without treating auto-discovered, high-churn tests
as if they were curated QA cases.

`execution-import` (`openspec/specs/execution-import/spec.md`) is
deliberately match-only: it never auto-creates cases, because name-based
matching against a versioned, human-authored `TestCase` is fragile across
renames, and `TestCase`/`RunItem` carry a full content snapshot per row —
the wrong cost model for tens of thousands of thin, auto-discovered
entries. This gap was identified and deliberately deferred while designing
`execution-import` (issue #34, 2026-07-15): a genuinely different, lighter
surface is needed for "just show me unit test pass/fail trends," not a
mode of the existing Suite/Case/Run/RunItem model.

## What Changes

- Add a new, lean `unit-test-inventory` capability: a `POST
  /api/v1/projects/{projectKey}/unit-test-results/import` endpoint that
  accepts a project's *native* JUnit XML (no TestPulse plugin, no
  `testpulse_case_key` property required) and auto-creates/updates a
  per-test identity row (`project + classname + name`) plus a bounded
  (last-N) result history row per reported result.
- Add two read endpoints: list current status of every unit test
  (cursor-paginated, optional `verdict` filter) and fetch one test's
  bounded result history — plus a matching MCP tool
  (`list_unit_test_results`) for agent parity.
- Extend the shared `junitxml` parser to capture each `<testcase>`'s
  `classname` attribute (currently unparsed), with regression coverage
  confirming `execution-import`'s existing behavior is unaffected.
- Reuse the existing MCP idempotency-key mechanism
  (`Service.IdempotentResult`/`SaveIdempotentResult`) for the new
  ingestion endpoint, keyed by an optional client-supplied
  `idempotencyKey`, so CI retries don't silently evict real history under
  bounded retention.
- No new web UI page this round — API/MCP only, per explicit scope
  decision (observability data, not a managed entity needing triage UI).
- Sample Project showcase: seed a handful of auto-discovered unit test
  identities with multi-result history via the real ingestion path.

## Capabilities

### New Capabilities
- `unit-test-inventory`: auto-created, lean, bounded-history tracking of
  externally-run unit tests (identity by project+classname+name, current
  status + recent trend), ingested from native JUnit XML, distinct from
  the curated `TestCase`/`Suite`/`Run`/`RunItem` model and from
  `execution-import`'s match-only semantics.

### Modified Capabilities
- (none — `execution-import`'s own requirements are unchanged; the
  `junitxml` parser gains a field but no existing matching/verdict
  behavior changes)

## Impact

- **New migration**: `unit_tests` + `unit_test_results` tables
  (`apps/api/internal/db/migrations/`).
- **New domain types**: `domain.UnitTest`, `domain.UnitTestResult`.
- **New store**: `apps/api/internal/store/unit_test_results.go`
  (upsert-identity + insert-and-prune-history, batched for whole-report
  ingestion).
- **New service**: `Service.ImportUnitTestResults`,
  `Service.ListUnitTestResults`, `Service.UnitTestResultHistory`.
- **Modified**: `apps/api/internal/junitxml/parser.go` (adds `ClassName`
  field).
- **New routes + OpenAPI schemas**: `packages/shared/openapi.yaml`.
- **New MCP tool**: `list_unit_test_results`
  (`apps/api/internal/mcp/write_tools.go` or a new read-tools file,
  following the existing `list_run_items` shape).
- **Docs**: new page or section describing ingestion, the
  identity/no-rename-continuity tradeoff, retention bound, and the MCP
  tool; `docs/api.md`, `docs/mcp-server.md` entries.
- **Sample Project**: `apps/api/internal/sampledata/seed.go` +
  `seed_test.go`.
