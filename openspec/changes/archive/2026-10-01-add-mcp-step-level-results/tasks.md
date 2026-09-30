## 1. MCP tool layer: stepResults input

- [x] 1.1 Write a failing test `TestMCPRecordResultWithStepResults` in `apps/api/internal/mcp_test/mcp_scenarios_test.go`: create a case with 2+ steps, create a run from it, call `record_result` with `verdict: "failed"` and `stepResults: [{"stepIndex": 0, "verdict": "pass"}, {"stepIndex": 1, "verdict": "failed"}]`, assert the response's `stepResults` matches, and that a follow-up `list_run_items` (or `get_details` on the run) shows the item's live step state reflects it.
- [x] 1.2 Write a failing test `TestMCPRecordResultRejectsOutOfBoundsStepIndex`: same setup, call `record_result` with a `stepIndex` beyond the case's step count, assert the call fails (`IsError` / protocol error) and no result was appended (a follow-up read shows no new result).
- [x] 1.3 Run `go test ./internal/mcp_test/... -run TestMCPRecordResult` and confirm both new tests fail (compile error: `RecordResultInput` has no `StepResults` field yet).
- [x] 1.4 In `apps/api/internal/mcp/write_tools.go`: add a `StepResultInput` struct (`StepIndex int`, `Verdict string` with jsonschema `"one of pass, failed, skipped, blocked"`) and a `toDomainStepResults([]StepResultInput) []domain.StepResult` converter, mirroring `StepInput`/`toDomainSteps`. Add `StepResults []StepResultInput` (jsonschema: optional per-step verdicts submitted atomically with the overall verdict, mirroring REST's `NewResult.stepResults`) to `RecordResultInput`. In `recordResult`'s handler, pass `StepResults: toDomainStepResults(in.StepResults)` into the `domain.NewResult{...}` literal. Update the tool's registered `Description` to mention step-level verdicts.
- [x] 1.5 Run `go test ./internal/mcp_test/... -run TestMCPRecordResult` (requires `TESTPULSE_TEST_DATABASE_URL`) and confirm both new tests pass and no existing `record_result` test regressed.

## 2. Verification, docs, and Sample Project check

- [x] 2.1 Run `make lint-api` and fix any issues.
- [x] 2.2 Run `make coverage-api` and confirm the ≥80% gate still passes.
- [x] 2.3 Update `docs/mcp-server.md`'s `record_result` row to mention the optional `stepResults` input, citing `(add-mcp-step-level-results)`.
- [x] 2.4 Check the Sample Project (`apps/api/internal/sampledata/seed.go`): confirm at least one seeded result already demonstrates step-level verdicts via REST/service, or note that this MCP change doesn't need its own seed addition since the underlying capability is already showcased by `add-step-level-results`'s seed data. No seed change expected, but verify rather than assume.
- [x] 2.5 Deploy locally (`docker-compose`) and manually call `record_result` with `stepResults` via a real MCP request (e.g. `curl` against `/mcp`), confirming real output before calling this done.
