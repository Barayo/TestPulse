## Why

As a manual tester running a multi-step test case, when a step fails
partway through, I want to mark exactly which step failed (not just the
overall item verdict), so whoever triages the failure knows where it broke
without re-reading my comment and guessing. Execution today records one
verdict per run item; a case's steps are display-only during execution —
TestRail, Zephyr, and qTest all support step-level pass/fail as standard,
and for any case with more than a couple of steps, item-level-only results
lose real diagnostic value (GitHub issue #128).

## What Changes

- Each step of a step-based run item can be marked with its own verdict
  (pass/failed/skipped/blocked), independently of the item's overall
  verdict, via a new incremental per-step endpoint that persists each mark
  immediately.
- Step marks carry forward across retests (they are not reset when an
  overall verdict is recorded) and are optional — a tester can still record
  an overall verdict with zero, some, or all steps marked, exactly like
  today.
- Every time an overall verdict is recorded, the current step marks are
  snapshotted immutably alongside that `Result`, so the results history
  shows exactly what each step's state was at each past attempt.
- `RunItemDetailPage` gains a compact per-step `P F B S` marking control
  (approved visual design) and the existing results-history list gains a
  collapsed step-snapshot summary per entry.
- The REST API's `NewResult` gains an optional `stepResults` field so a
  caller can submit step-level verdicts atomically with the overall verdict
  (used by a future agent/import path — not by the interactive UI in this
  change). MCP tool wiring to use it is explicitly deferred (tracked
  separately as issue #187).

## Capabilities

### New Capabilities

- `step-level-results`: recording, carrying forward, and snapshotting
  per-step verdicts on a run item, independently of its overall verdict.

### Modified Capabilities

- `test-execution`: run item execution gains step-level marking alongside
  the existing overall-verdict recording; the results history requirement
  gains a per-result step-snapshot.
- `sample-data`: the seeded Sample Project gains a run item demonstrating
  step-level marking (mixed pass/fail) so the showroom shows it on first
  look.

## Impact

- **Backend**: new `test_run_item_step_states` and `test_run_result_steps`
  tables (migration); `domain.Step Result`, `domain.RunItem.StepStates`,
  `domain.Result.StepResults`, `domain.NewResult.StepResults`; new
  `PUT /api/v1/run-items/{itemId}/steps/{stepIndex}` endpoint;
  `RecordResult` service logic to snapshot step state per `Result`;
  `packages/shared/openapi.yaml` contract update (`make generate`).
- **Frontend**: new `ExecutionStepsList.tsx` component on
  `RunItemDetailPage`; results-history entry gains a step-snapshot summary.
- **Docs**: `docs/test-management.md`'s execution section.
- **Sample Project**: `apps/api/internal/sampledata/seed.go` and
  `seed_test.go`.
- **Out of scope**: MCP tool surface (issue #187), Gherkin/text-format case
  execution, `CaseDetailPage`'s editable step authoring, auto-deriving the
  overall verdict from step verdicts.
