## Context

`add-step-level-results` (#128, archived) added `domain.NewResult.StepResults []domain.StepResult` and wired full validation (`Service.RecordResult` → `checkStepIndicesInBounds`), bounds-checking, and live-state syncing at the service layer, then exposed it on REST's `NewResult` schema. MCP's `record_result` tool (`apps/api/internal/mcp/write_tools.go`) builds its own `domain.NewResult{Verdict: ..., Comment: ...}` and has simply never set `StepResults` — every other field `NewResult` supports (`Verdict`, `Comment`) is already there; `StepResults` is the one gap. `ResultOutput` (the tool's return type) already declares a `StepResults []domain.StepResult` field mirroring `domain.Result`, so the output side needs no change — it already returns whatever `Service.RecordResult` gives back.

## Goals / Non-Goals

**Goals:**
- Let an MCP agent submit step-level verdicts atomically with `record_result`, matching REST's existing `stepResults` capability exactly.

**Non-Goals:**
- Any service- or store-layer change — `Service.RecordResult` already validates and syncs `StepResults` fully; this change only wires the MCP input through to it.
- Exposing `SetStepResult` (the incremental, one-step-at-a-time REST endpoint used by the interactive UI) as a separate MCP tool — out of scope; an agent reporting automated results already knows every step's outcome up front and uses the atomic path, same as REST's own `stepResults` was designed for.

## Decisions

**D1 — A dedicated `StepResultInput` type, not a reused `domain.StepResult`.** Mirrors the established `StepInput`/`toDomainSteps` pattern `upsert_test_case` already uses for `domain.Step`: every MCP input type gets its own jsonschema-documented struct, decoupling the wire format from the domain type and giving each field an MCP-specific doc string (`Verdict` here documented as `"one of pass, failed, skipped, blocked"`, matching every other verdict-shaped MCP field). A small `toDomainStepResults([]StepResultInput) []domain.StepResult` converter mirrors `toDomainSteps`.
  - *Alternative considered*: accept `[]domain.StepResult` directly. Rejected — inconsistent with every other MCP input in this file, and `domain.StepResult`'s `Verdict` field has no jsonschema tag (domain types never carry MCP-specific schema hints).

**D2 — No new validation at the MCP layer.** `checkStepIndicesInBounds` already rejects an out-of-range `stepIndex` with a clear `invalid(...)` error; `StepResult.Validate()` already rejects a negative index or unparseable verdict. The MCP handler does zero validation of its own before forwarding — exactly how `Verdict`/`Comment` already work on this same tool (validation happens once, in `Service.RecordResult`, not duplicated at the transport layer).

## Risks / Trade-offs

- **[Risk]** None identified — this is additive, backward-compatible (omitting `stepResults` preserves exact prior behavior via `Service.RecordResult`'s existing "supplied vs. omitted" branch), and reuses fully-tested service-layer logic.

## Migration Plan

No data migration. Purely additive MCP input field.
