## 1. Migration and store layer

- [x] 1.1 Add migration `apps/api/internal/db/migrations/00024_mcp_idempotency_keys.sql` creating `mcp_idempotency_keys` per design.md D1 (`actor_id`, `tool_name`, `idempotency_key`, `result_json jsonb`, `created_at`, `expires_at`, `UNIQUE (actor_id, tool_name, idempotency_key)`).
- [x] 1.2 Write a failing test `TestMCPIdempotencyKeyRepoStoreAndGet` in a new `apps/api/internal/store/mcp_idempotency_test.go` asserting `Store` then `Get` with the same `(actorID, toolName, key)` returns the stored `result_json`.
- [x] 1.3 Write a failing test `TestMCPIdempotencyKeyRepoGetMissReturnsNotFound` asserting a lookup with no matching row (or an expired one) returns `ErrNotFound`.
- [x] 1.4 Write a failing test `TestMCPIdempotencyKeyRepoDeleteExpiredRemovesOnlyExpiredRows`, mirroring `sessions.go`'s `DeleteExpired` test shape.
- [x] 1.5 Run the tests, confirm they fail (repo doesn't exist).
- [x] 1.6 Implement `apps/api/internal/store/mcp_idempotency.go`: `MCPIdempotencyKeyRepo` with `Get(ctx, actorID, toolName, key) (json.RawMessage, error)` (filtering `expires_at > now()`, `ErrNotFound` on miss), `Store(ctx, actorID, toolName, key string, result json.RawMessage, expiresAt time.Time) error`, `DeleteExpired(ctx) error` — mirroring `password_reset_tokens.go`/`sessions.go`'s shape exactly.
- [x] 1.7 Wire `MCPIdempotencyKeys *MCPIdempotencyKeyRepo` into the `Store` struct (`apps/api/internal/store/store.go`).
- [x] 1.8 Run the tests, confirm they pass.

## 2. Service layer

- [x] 2.1 Write a failing test `TestIdempotentResultMissReturnsFalse` in `apps/api/internal/service/*_test.go` asserting `Service.IdempotentResult` returns `(nil, false, nil)` when no matching key exists.
- [x] 2.2 Write a failing test `TestSaveThenIdempotentResultReturnsStoredValue` asserting `SaveIdempotentResult` followed by `IdempotentResult` with the same `(actorID, toolName, key)` returns the same value, unmarshaled correctly.
- [x] 2.3 Run the tests, confirm they fail (methods don't exist).
- [x] 2.4 Implement `Service.IdempotentResult(ctx, actorID, toolName, key string) (json.RawMessage, bool, error)` and `Service.SaveIdempotentResult(ctx, actorID, toolName, key string, result any) error` (design.md D6) — the latter marshals `result` to JSON and calls the store with a fixed 24-hour TTL (design.md D4).
- [x] 2.5 Write a failing test `TestCleanupExpiredIdempotencyKeysRemovesOnlyExpiredRows`, mirroring `CleanupExpiredSessions`'s existing test shape.
- [x] 2.6 Implement `Service.CleanupExpiredIdempotencyKeys(ctx) error`, a thin passthrough to the store method (design.md D5).
- [x] 2.7 Run the tests, confirm they pass.
- [x] 2.8 Wire `svc.CleanupExpiredIdempotencyKeys(ctx)` into `apps/api/cmd/testpulse-api/main.go`, alongside the existing `CleanupExpiredSessions` call.

## 3. upsert_test_case (create path)

- [x] 3.1 Write a failing test `TestMCPUpsertTestCaseCreateWithIdempotencyKeyReturnsOriginalOnRetry` in `apps/api/internal/mcp_test/mcp_scenarios_test.go`: call `upsert_test_case` twice with no case key and the same `idempotencyKey`, assert both calls return the same case key/version and only one case exists in the project afterward.
- [x] 3.2 Write a failing test `TestMCPUpsertTestCaseFailedCreateIsRetryableWithSameKey`: call with an `idempotencyKey` and invalid fields (expect failure), then retry with the same key and valid fields, assert the case is created normally.
- [x] 3.3 Run the tests, confirm they fail (no such parameter/behavior yet).
- [x] 3.4 Add `IdempotencyKey string \`json:"idempotencyKey,omitempty"\`` to `UpsertTestCaseInput` (`apps/api/internal/mcp/write_tools.go`) and implement the check-then-create-then-save flow on the create branch only (design.md D6) using `domain.ActorFromContext(ctx)` for the actor id.
- [x] 3.5 Run the tests, confirm they pass.

## 4. bulk_add_cases

- [x] 4.1 Write a failing test `TestMCPBulkAddCasesWithIdempotencyKeyReturnsOriginalOnRetry`: call `bulk_add_cases` twice with the same `idempotencyKey`, assert both calls return the same case keys and only one batch exists afterward.
- [x] 4.2 Run the test, confirm it fails.
- [x] 4.3 Add `IdempotencyKey` to `BulkAddCasesInput` and implement the same check-then-create-then-save flow.
- [x] 4.4 Run the test, confirm it passes.

## 5. create_test_run

- [x] 5.1 Write a failing test `TestMCPCreateTestRunWithIdempotencyKeyReturnsOriginalOnRetry`: call `create_test_run` twice with the same `idempotencyKey`, assert both calls return the same run key and only one run exists afterward.
- [x] 5.2 Run the test, confirm it fails.
- [x] 5.3 Add `IdempotencyKey` to `CreateTestRunInput` and implement the same check-then-create-then-save flow.
- [x] 5.4 Run the test, confirm it passes.

## 6. Documentation

- [x] 6.1 Update `docs/mcp-server.md`'s tool reference for `upsert_test_case`, `bulk_add_cases`, and `create_test_run`, documenting the new optional `idempotencyKey` parameter, its 24-hour TTL, and that it only protects the create path (not edits).

## 7. Full verification

- [x] 7.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 7.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 7.3 Run `make lint-api`, confirm clean.
