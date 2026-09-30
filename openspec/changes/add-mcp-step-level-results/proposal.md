## Why

As an agent recording automated test results via MCP, when a case has multiple steps, I want to report which specific step failed, so a human triaging the failure doesn't have to guess from the overall verdict alone. REST's `POST /api/v1/run-items/{itemId}/results` already accepts an optional `stepResults` array end-to-end (`add-step-level-results`, #128) — service-layer validation, bounds-checking, and live-state syncing are all already in place — but the MCP `record_result` tool never exposes it as input, so an MCP-only agent has no way to submit step-level verdicts at all (#187).

## What Changes

- `record_result`'s input gains an optional `stepResults` array (`stepIndex` + `verdict` pairs), forwarded verbatim into `domain.NewResult.StepResults` — the exact field REST already validates and syncs. No new service or store logic: this is a thin MCP-layer passthrough to functionality that already exists and is already tested.
- `record_result`'s tool description is updated to mention `stepResults`, and its output (`ResultOutput`, already carrying `StepResults` for free since it mirrors `domain.Result`) will now actually be populated when an agent supplies them.

## Capabilities

### Modified Capabilities
- `mcp-server`: the `record_result tool` requirement changes — it gains an optional `stepResults` input.

## Impact

- `apps/api/internal/mcp/write_tools.go`: `RecordResultInput` gains a `StepResults []StepResultInput` field (new `StepResultInput` type mirroring `domain.StepResult`, following the same pattern as `StepInput`/`toDomainSteps` already used by `upsert_test_case`); the `recordResult` handler converts and forwards it.
- `docs/mcp-server.md`: `record_result` row updated to mention step-level verdicts.
