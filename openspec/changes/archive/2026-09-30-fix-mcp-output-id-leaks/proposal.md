## Why

As an agent calling TestPulse's MCP tools, when I receive a case/suite/step-group/result/search-result/release/test-plan record back, I want it to only include identifiers I can actually use in a follow-up call, so I don't waste context guessing between `id` and `key` or hit a dead end trying to pass an internal UUID somewhere no tool accepts it. Verified directly against current code (not just the issue text): 7 of the domain structs returned through MCP tools carry at least one raw internal ID with no usable key substitute on the same struct — `TestCase.ProjectID`/`FolderID`, `Suite.ProjectID`/`CaseIDs`, `StepGroup.ProjectID`, `Result.RunItemID`, `SearchResult.ProjectID`, `Release.ProjectID`, `TestPlan.ProjectID` — while `Project`, `Run`, and `RunSummary` are already clean (either `ID`+`Key` only, or already exposing the right `*Key` siblings). `Suite.CaseIDs` is a live instance of this same problem already flagged as out-of-scope in `add-mcp-suite-membership-tool`'s design.md and tracked here.

## What Changes

- Introduce dedicated MCP output types for the 7 affected domain structs, each substituting a raw ID field for its human-facing key equivalent, or dropping the field entirely where no key concept exists in the MCP surface at all (`TestCase.FolderID` — no folder concept in any of the 12 tools; `Result.RunItemID` — no run-item-key concept anywhere, items are always addressed by `(runKey, caseKey)`).
- `Suite`'s output unifies with the shape already shipped in `add-mcp-suite-membership-tool` (`SuiteKey`+`CaseKeys`), expanded to also carry `Name`/`ProjectKey`/`PassRate`/`LastRunAt` — `upsert_test_suite` and `update_suite_membership` now return the exact same type, fixing the inconsistency where only one of the two suite-touching tools avoided the leak.
- `bulk_add_cases`'s output embeds `domain.TestCase` directly today (`BulkAddCasesOutput.Cases []domain.TestCase`) and therefore transitively leaks the same `ProjectID`/`FolderID` fields `upsert_test_case` does — updated to use the same new case output type.
- `search`'s `SearchResult.ProjectID` → `ProjectKey` requires resolving potentially many distinct project IDs per call; add a batched `ProjectKeysByIDs`-style store/service lookup (one query for all distinct IDs in a result set) rather than resolving one at a time — this codebase's established "design for DB scale, not client-side loops" convention (`add-run-notifications` and others already follow this pattern for computed fields).
- `get_details`'s dynamic dispatch (currently untyped `any`, inheriting whichever of the 6 domain structs `GetDetails` resolves to, raw IDs included) is updated to convert its result into the corresponding new output type before returning, for all 6 dispatch targets. Its declared Go output type stays `any` (the MCP SDK's per-tool generic output type can't express a discriminated union across entity types) — that's a separate, pre-existing schema-strictness gap, not part of this fix.
- `Result` (returned by `record_result`) additionally gains `RunKey`/`CaseKey` fields (values the caller already supplied as input) so the result is self-descriptive on its own, without requiring the caller to remember context to make sense of it — replacing the dropped `RunItemID`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `mcp-server`: `upsert_test_case`, `upsert_step_group`, `upsert_test_suite`, `update_suite_membership`, `bulk_add_cases`, `record_result`, `search`, `get_details` tool requirements all gain an output-shape constraint (no raw internal IDs without a usable key substitute).

## Impact

- **Affected code**: `apps/api/internal/mcp/write_tools.go` (new output types + handler changes for `upsert_test_case`, `upsert_step_group`, `upsert_test_suite`, `update_suite_membership`, `record_result`), `apps/api/internal/mcp/read_tools.go` (new output types + handler changes for `search`, `get_details`), a new batched project-key lookup in `apps/api/internal/store/projects.go`/`apps/api/internal/service/service.go`, `apps/api/internal/mcp_test/mcp_scenarios_test.go` (existing + new scenario tests).
- **No REST/openapi.yaml impact**: MCP tool schemas live directly in Go code; REST responses are untouched.
- **No migration needed**: pure output-shape change, no new columns or tables.
- **Docs**: `docs/mcp-server.md`'s tool reference gains a short note on the ID/key convention.
- **Sample Project**: exempt per CLAUDE.md's standing rule — no new user-facing product surface, only an output-shape correction to an existing agent-facing tool surface.
