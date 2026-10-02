## Why

As an agent calling `create_test_run` or `get_details` with `entityType: "run"`, when I receive the run record back, I want it to only include fields I can actually use in a follow-up call, so I don't waste context on a raw UUID that duplicates a `key` field already present on the same record. `fix-mcp-output-id-leaks` applied this treatment to every other create/`get_details`-reachable entity type (`TestCase`, `Suite`, `StepGroup`, `Result`, `SearchResult`, `Release`, `TestPlan`) but missed `domain.Run` — it was judged "already clean" because it carries `ProjectKey`/`SuiteKey`/`TestPlanKey` siblings, but `Run.ID` and `Run.ProjectID` are still present on the same struct and still leak in both tools' output today.

## What Changes

- Add a `RunOutput` type mirroring `domain.Run` with `ID` and `ProjectID` dropped (the already-present `ProjectKey` is sufficient) — the same treatment every other entity type already received.
- `create_test_run` returns `RunOutput` instead of `domain.Run`, including through its idempotency-cache path.
- `get_details` for `entityType: "run"` converts the result to `RunOutput` before returning, instead of falling through its `default` pass-through branch.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `mcp-server`: `create_test_run tool` and `get_details tool` requirements updated to state the run record identifies its project by key, not internal ID, matching every other entity type's already-stated contract.

## Impact

- **Backend**: `apps/api/internal/mcp/write_tools.go` (new `RunOutput` type + `toRunOutput`, `createTestRun`'s return type and idempotency generic param), `apps/api/internal/mcp/read_tools.go` (`getDetails`'s `domain.Run` case).
- No API/REST surface change — this is MCP-tool-output-only, mirroring the prior `fix-mcp-output-id-leaks` change's scope exactly.
- No migration, no frontend change.
