## Context

`VersionDetailDialog.tsx` already computes flakiness client-side, per version, from
`GET /cases/{caseKey}/executions` (`apps/api/internal/store/runs.go`'s `ExecutionsByCase`):
a version is "Flaky" if its executions include at least one `pass` and at least one
`failed`/`blocked`. That query returns every execution across every version a case has
ever pinned — exactly the raw data this change needs, just not yet aggregated into a
rate or exposed at project scope.

The most recent precedent for a per-entity aggregation query is
`add-suite-pass-rate-trend` (archived): `SuiteRepo.Trend` (one SQL query, no per-suite
fetch loop), `Service.SuiteTrend`, `GET /suites/{suiteKey}/trend` gated on
`domain.PermRead` via `projectIDFromSuite`. This change follows that shape directly.

Issue #78 originally suggested surfacing flakiness on issue #81's dedicated Reports
page — that page doesn't exist (no code, no OpenSpec change, ROADMAP.md's umbrella
`add-reporting` item is still unopened). Waiting for it isn't necessary: the Library
already has a filter/search bar (tag/priority/platform/test-type, composable, per
`ui-navigation`'s "Library with two-pane navigation" requirement) that a "Flaky" filter
slots into directly.

## Goals / Non-Goals

**Goals:**
- A case's *current version* flakiness (rate + boolean) is computed by one server-side
  query per project, not a client-side loop over `VersionDetailDialog`-style per-case
  fetches.
- "Which cases are flaky right now" is answerable at project scope via a query API,
  usable equally by the web UI and (once it exists) an MCP tool.
- Flaky cases are discoverable from the Library without opening any dialog.

**Non-Goals:**
- No MCP tool in this change — there is no MCP server in the codebase yet
  (`add-mcp-server` unshipped). The query API's shape doesn't depend on MCP existing;
  wrapping it in a tool later is mechanical, not designed here.
- No new Reports page (#81) — out of scope, tracked separately in ROADMAP.md.
- No change to the existing per-version badge in `VersionDetailDialog` — it answers a
  different question ("was this exact version ever flaky") and stays as-is.
- No historical flakiness trend (flaky rate over time) — only the current version's
  rate, matching "currently flaky" in issue #78's own wording. A trend is a natural
  future extension, not required now.

## Decisions

- **Flakiness rate is scoped to a case's current version only**, not all versions ever
  pinned. Rationale: a case that was flaky two versions ago and has since been fixed
  isn't usefully "flaky" today — mixing historical and current versions into one rate
  would understate a genuinely-fixed case's reliability and overstate a
  never-flaky-since-editing case's risk. `ExecutionsByCase` already returns each
  execution's pinned version, so filtering to `caseVersion = currentVersion` is a
  `WHERE` clause, not a new query shape.
- **Rate formula**: `min(passCount, failedOrBlockedCount) / (passCount + failedOrBlockedCount)`
  among the current version's executions, excluding `pending`/`skipped`/`retest` (they're
  not a verdict on the case, just incomplete/inapplicable runs). `isFlaky` is
  `rate > 0` (equivalent to today's per-version badge condition: at least one of each).
  Considered a simpler `failedOrBlockedCount / totalCount` — rejected because a case
  that's failed 9 times and passed once reads as "90% flaky" under that formula, which
  conflates "mostly broken" with "flaky": it's indistinguishable from a case that
  genuinely coin-flips 90% of the time. `min/total` gives that same case a 10% rate —
  correctly low, since one fluke pass among nine consistent failures isn't flakiness,
  it's a mostly-broken case with a shrug in it. `min/total` is exactly "how much of a
  coin flip is this," which is what "flaky" actually means.
- **New capability `flaky-detection`**, not folded into `test-execution`. Rationale:
  `test-execution` already owns 13 requirements spanning run lifecycle, items, and
  results — flakiness is a read-only analytical view *over* execution data, not part of
  executing a run, matching how `project-stats` is already its own capability separate
  from the domain data it aggregates.
- **Endpoint shape**: `GET /projects/{projectKey}/flaky-cases`, gated on `domain.PermRead`
  via the existing `projectIDParam` resolver — mirrors `suiteTrend`'s
  `{resource}/{key}/{aggregation-name}` convention, scoped one level up (project, not
  suite) since flakiness is a project-wide triage view. Returns each flaky case's key,
  title, folder path (for context without a second lookup), rate, and current version.
  No new `Permission` constant — flakiness is read-only aggregate data over cases the
  actor can already read individually, matching `PermRead`'s existing scope.
- **Library filter, not a new page**: `FolderExplorerPage.tsx`'s existing filter row
  gains a "Flaky" toggle chip, composable with tag/priority/platform/test-type exactly
  like the others. The per-case flaky indicator is a small icon/badge on the case row,
  reusing `Pills.tsx`'s existing visual language rather than inventing a new one.

## Risks / Trade-offs

- **[Risk]** A project with many cases and long execution history could make the
  aggregation query expensive if written naively (e.g., a subquery per case). →
  **Mitigation**: follow `SuiteRepo.Trend`'s precedent — one query with a `GROUP BY`
  over `case_id`, computed set-based, not looped in application code; add an explicit
  empty/no-flaky-cases test the same way `add-suite-pass-rate-trend` tested its
  no-closed-runs case.
- **[Trade-off]** Scoping to the current version only means a case's flakiness resets
  to "clean" the moment it's edited, even if the edit didn't touch the flaky step. This
  matches how the rest of the app already treats versions (pinned executions, diffs) as
  the unit of "what changed," so it's consistent rather than a new inconsistency.
- **[Risk]** Deferring MCP exposure could look like scope-cutting the issue's explicit
  "consumed equally by UI and MCP agents" requirement. → **Mitigation**: this is a
  sequencing constraint, not a scope cut — there is no MCP server to attach a tool to
  yet; the query API is the reusable part, and flagged explicitly as an Open Question
  below so it isn't silently dropped.

## Migration Plan

Read-only feature, no schema change (executions/case-version data already exists). New
endpoint and Library filter ship together behind the normal TDD/e2e flow; no feature
flag needed. Rollback is a normal revert.

## Open Questions

- When `add-mcp-server` eventually ships, should it get a dedicated `list_flaky_cases`
  tool, or fold flakiness into a more general `get_case_details`-style tool's response?
  Left for that change's own design, once there's a server to design it against.
