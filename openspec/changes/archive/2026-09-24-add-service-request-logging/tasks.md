## 1. Give Service a logger

- [x] 1.1 Write a failing test `TestServiceLogsNothingByDefault` in `apps/api/internal/service/service_test.go` (or a new `logging_test.go`) confirming `service.New(store)` never panics when something logs through it (proves the nil-safe discard default).
- [x] 1.2 Write a failing test `TestWithLoggerSetsTheLogger` asserting `service.New(store).WithLogger(l)` uses the supplied logger (observable via a later task's log-producing behavior — can be deferred to task 3's tests if this one is redundant once those exist; keep only if it adds independent coverage).
- [x] 1.3 Add a `logger *slog.Logger` field to `Service` in `service.go`, defaulted to `slog.New(slog.DiscardHandler)` in `New(...)`, plus `WithLogger(l *slog.Logger) *Service` following the existing `WithMailer`/`WithEncryptionKey` builder pattern.
- [x] 1.4 Wire it in `apps/api/cmd/testpulse-api/main.go`: add `.WithLogger(logger)` to the existing `svc := service.New(...).WithMailer(...).WithEncryptionKey(...)` chain.
- [x] 1.5 Run the tests, confirm green.

## 2. Test infrastructure: a recording slog.Handler

- [x] 2.1 Add `apps/api/internal/service/logtest_test.go` (package `service_test`) with a small `recordingHandler` implementing `slog.Handler`, recording every `slog.Record` it receives, plus a `messages() []string` and `attrs(msg string) map[string]any` helper for assertions. No production code changes in this task — pure test infrastructure, so no separate red/green cycle applies here (nothing to fail yet).

## 3. Webhook delivery failure logging

- [x] 3.1 Write a failing test `TestDispatchWebhooksLogsAFailedDelivery` in `apps/api/internal/service/webhook_dispatch_test.go` — configure a destination that fails (reuse the existing unreachable-port or redirect-refused pattern), wire a `recordingHandler` via `WithLogger`, call `RecordResult`/`CloseRun`, assert a Warn-level log line naming the destination host and event type appears (poll with the existing `waitForDelivery`-style pattern, since dispatch is async).
- [x] 3.2 Write a failing test `TestDispatchWebhooksDoesNotLogASuccessfulDelivery` — successful delivery produces no failure log line.
- [x] 3.3 Implement: in `webhooks.go`'s `dispatchWebhooks`, log `s.logger.Warn("webhook delivery failed", "host", ..., "event", event.Event)` on each failure path (unreachable, non-2xx, dial-time rejection) — never the full URL query string or payload body (design.md D4).
- [x] 3.4 Run the tests in this group, confirm green.

## 4. Background worker failure logging

- [x] 4.1 Write a failing test `TestProjectAutoArchiveWorkerLogsSweepFailure` in `apps/api/internal/service/project_auto_archive_worker_test.go` — force `Sweep` to fail (e.g. an invalid/unreachable store state already used by an existing failure-path test, or a minimal fake), call `Run` for one tick (or call the same failure path `Run` exercises), assert a Warn-level log line appears via a `recordingHandler`-wired `Service`.
- [x] 4.2 Implement: log the per-tick error in `ProjectAutoArchiveWorker.Run` (`w.svc.logger.Warn("project auto-archive sweep failed", "error", err)`) instead of discarding it.
- [x] 4.3 Write a failing test `TestRunRetentionWorkerLogsSweepFailure` in `apps/api/internal/service/run_retention_worker_test.go`, same shape as 4.1.
- [x] 4.4 Implement the equivalent log line in `RunRetentionWorker.Run`.
- [x] 4.5 Write a failing test `TestProjectDeletionWorkerLogsProcessingFailure` in `apps/api/internal/service/project_deletion_worker_test.go`, same shape as 4.1.
- [x] 4.6 Implement the equivalent log line in `ProjectDeletionWorker.Run`.
- [x] 4.7 Run the tests in this group, confirm green.

## 5. Audit failure logging

- [x] 5.1 Write a failing test `TestAuditLogsAppendFailure` in `apps/api/internal/service/identity_test.go` (or wherever `audit()` already has coverage) — force `store.Audit.Append` to fail (e.g. a closed pool, or a test double if one already exists for this store method; otherwise the smallest viable forcing mechanism), assert a Warn-level log line appears.
- [x] 5.2 Implement: in `identity.go`'s `audit()`, log on `Append`'s failure instead of `_ = s.store.Audit.Append(...)`.
- [x] 5.3 Run the test, confirm green.

## 6. HTTP request-logging middleware and X-Request-Id header

- [x] 6.1 Add `apps/api/internal/server/logtest_test.go` (package `server_test`) with the same `recordingHandler` shape as task 2.1 (server package can't import service's unexported test helper — a second small copy is the right call here, not a shared-package extraction for two ~20-line test doubles).
- [x] 6.2 Write a failing test `TestScenario_ErrorResponseIsLoggedWithRequestID` in `apps/api/internal/server/middleware_test.go` (new file, or add to an existing HTTP-layer test file) — make a request that returns a 4xx (e.g. an existing validation-error scenario), assert a log line appears including status, method, path, and a non-empty request ID.
- [x] 6.3 Write a failing test `TestScenario_SuccessfulResponseIsNotLoggedByRequestLoggingMiddleware` — a 200 response produces no log line from the new middleware (distinguish from any other logging the test's own scenario might incidentally trigger).
- [x] 6.4 Implement `requestLogging(logger *slog.Logger) func(http.Handler) http.Handler` in `middleware.go`: wrap the response writer via `chimiddleware.NewWrapResponseWriter`, after the handler returns log `"request error"` at Warn (4xx) or Error (5xx) with method/path/status/request ID/duration, skip anything under 400.
- [x] 6.5 Write a failing test `TestScenario_ResponseIncludesXRequestIdHeader` — any request's response includes a non-empty `X-Request-Id` header.
- [x] 6.6 Implement a small middleware step setting `w.Header().Set("X-Request-Id", middleware.GetReqID(r.Context()))`, registered immediately after `middleware.RequestID` in `server.go`.
- [x] 6.7 Register `requestLogging(logger)` in `server.go`'s middleware chain.
- [x] 6.8 Run the tests in this group, confirm green.

## 7. Split off frontend error reporting as its own backlog issue

- [x] 7.1 File a new GitHub issue (label `backlog`) for frontend error reporting (no `ErrorBoundary`, no `console.error`, no error-reporting service anywhere in `apps/web` today) — split off from #207 per design.md's Non-Goals, matching the #130/#206 precedent. Not part of this change's implementation.

## 8. Documentation

- [x] 8.1 Update `docs/deployment.md` (or `docs/development.md`, wherever operational/logging guidance lives) documenting: what's now logged and at what level (webhook delivery failures, background worker tick failures, audit append failures, 4xx/5xx request errors), and that `X-Request-Id` can be used to correlate a server log line with a specific request/bug report.

## 9. Full verification

- [x] 9.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 9.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 9.3 Run `make lint-api`, confirm clean.
- [x] 9.4 Deploy locally (`docker compose down -v` + `up --build -d`) and manually verify: configure a webhook destination pointing at an unreachable host, record a failing result, confirm a Warn-level log line appears in `docker compose logs app`; make a request that returns 400/403/404, confirm a log line with a request ID appears and the response carries a matching `X-Request-Id` header (e.g. via browser devtools' Network tab or `curl -i`).
