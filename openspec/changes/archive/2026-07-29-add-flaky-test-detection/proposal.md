## Why

As a tester or QA lead, when I'm deciding which cases to trust or investigate, I want to
see which cases are currently flaky — not just discover it by accident when I happen to
open one specific version's execution history dialog — so that flaky cases surface
somewhere I'd actually look, both for a human browsing the Library and for an agent
querying the project via the API. TestPulse already computes this signal today
(`VersionDetailDialog`'s "Flaky" badge, whenever a version's executions include both a
pass and a fail/blocked result) but it's incidental: invisible until you open that exact
dialog for that exact case version. ROADMAP.md's v0.3 "Insight" rung names flaky-test
detection as its own deliverable, and every analytics-forward competitor surveyed this
session treats it as a first-class, always-visible metric.

## What Changes

- Promote the existing per-version "has this ever flip-flopped" check into a first-class,
  queryable-per-case signal: a flakiness rate (fraction of a case's *current version's*
  pass/failed/blocked executions that disagree with the majority verdict) and a boolean
  "currently flaky" state, computed server-side by one aggregation query — not a
  per-dialog client-side filter.
- Add a project-scoped query for every currently-flaky case in a project, so "which cases
  are flaky right now" is answerable without opening cases one at a time.
- Surface flakiness in the Library: a "Flaky" filter chip alongside the existing
  tag/priority/platform/test-type filters, and a small flaky indicator on a case row when
  its current version is flaky — reusing the Library's existing filter/search
  infrastructure rather than building a new standalone page (issue #81's dedicated
  Reports page doesn't exist yet, and this doesn't need to wait for it).
- Keep the existing per-version badge in `VersionDetailDialog` as-is; it already answers
  "was this specific version ever flaky," a different (still useful) question than
  "is the case's current version flaky right now."
- **Deferred, not built in this change**: exposing flakiness as an MCP tool. There is no
  MCP server in this codebase yet (`add-mcp-server` is still an unopened ROADMAP.md v0.1
  item) — nothing to attach a tool to. The query API is designed so wrapping it in an MCP
  tool later is mechanical once that server exists.

## Capabilities

### New Capabilities
- `flaky-detection`: server-side computation of per-case flakiness (rate + currently-flaky
  boolean) and a project-scoped query for all currently-flaky cases.

### Modified Capabilities
- `ui-navigation`: the Library's "two-pane navigation" case list gains a Flaky filter and
  a per-row flaky indicator, composable with the existing filters and search.

## Impact

- `apps/api/internal/domain/domain.go`, `apps/api/internal/store/runs.go` (or a new
  repo file) — flakiness aggregation query, following the `add-suite-pass-rate-trend`
  precedent (one server-side query, no per-case fetch loop).
- `apps/api/internal/server/handlers.go`, `packages/shared/openapi.yaml` — new
  project-scoped flaky-cases endpoint; `make generate` after the contract changes.
- `apps/web/src/pages/FolderExplorerPage.tsx` (Library) — Flaky filter chip, flaky
  indicator on case rows.
- `docs/test-management.md`, `apps/api/internal/sampledata/seed.go` — document the new
  filter and seed at least one currently-flaky case so the Sample Project demonstrates it.
