## 1. Visual design for the crash fallback screen

- [x] 1.1 Dispatch Pepe (Fable 5) for the `ErrorBoundary`'s fallback screen: a minimal "something went wrong" state with a reload action, matching the app's existing visual language. Get user sign-off on the mockup before writing any component code (standing project practice for UI changes).

## 2. Contract: openapi.yaml + generated types

- [x] 2.1 Add `POST /api/v1/client-errors` and a `ClientErrorReport` schema to `packages/shared/openapi.yaml`: `kind` (enum `crash`/`apiError`), `message` (required string), `stack` (optional string), `componentStack` (optional string), `url` (optional string), `method` (optional string), `path` (optional string), `status` (optional integer). Response: `204 No Content` on success, standard `400` on validation failure (empty `message`).
- [x] 2.2 Run `make generate` and confirm it exits clean (regenerates the Go server interface and the TS `paths`/`components` types with no manual edits needed).

## 3. Backend: service layer (TDD)

- [x] 3.1 Write a failing test `TestRecordClientErrorLogsAWarnLevelLine` in a new `apps/api/internal/service/client_errors_test.go`, using the existing `recordingHandler` (`logtest_test.go`) pattern: construct a `Service` via `New(nil).WithLogger(slog.New(h))`, call `RecordClientError(ctx, domain.ClientErrorReport{Kind: "crash", Message: "boom"})`, assert a Warn-level record was produced whose message is `"frontend client error"` and whose attributes include the report's `message`.
- [x] 3.2 Write a failing test `TestRecordClientErrorRequiresMessage`: call `RecordClientError(ctx, domain.ClientErrorReport{Kind: "crash"})` (empty `Message`), assert a validation error and that no log line was produced.
- [x] 3.3 Write a failing test `TestRecordClientErrorIncludesResolvedActor`: call with a context carrying a resolved `domain.Actor` (same pattern as `result_actor_test.go`), assert the logged record's attributes include the actor's identity.
- [x] 3.4 Run `go test ./internal/service/... -run TestRecordClientError` and confirm all three fail (compile error: no `RecordClientError` method or `domain.ClientErrorReport` type yet).
- [x] 3.5 Add `domain.ClientErrorReport` (mirrors the OpenAPI schema fields) to `apps/api/internal/domain/domain.go`, and `Service.RecordClientError(ctx context.Context, report domain.ClientErrorReport) error` to a new `apps/api/internal/service/client_errors.go`: validate `Message != ""`, resolve the actor via `domain.ActorFromContext` (falling back silently to no actor attrs when absent — unlike `RecordResult`, a missing actor here is not itself an error), log via `s.logger.Warn("frontend client error", "kind", report.Kind, "message", report.Message, "url", report.URL, "method", report.Method, "path", report.Path, "status", report.Status, "actorId", ...)` (omit zero-value attrs).
- [x] 3.6 Run `go test ./internal/service/... -run TestRecordClientError` and confirm all three pass.

## 4. Backend: HTTP handler (TDD)

- [x] 4.1 Write a failing test in `apps/api/internal/server/*_test.go` (following this file's existing handler-test conventions): `POST /api/v1/client-errors` with a valid body returns `204`; with an empty `message` returns `400`; without authentication returns `401`.
- [x] 4.2 Run the new test and confirm it fails (404: route doesn't exist yet).
- [x] 4.3 Add the handler (in `handlers.go` or a new `client_errors.go` alongside it) and register `r.Post("/client-errors", h.recordClientError)` inside the existing authenticated route group in `server.go` (no `requireTenantAdmin` — any authenticated user/agent can report).
- [x] 4.4 Run the new test and confirm it passes.

## 5. Frontend: shared reporting helper + middleware (TDD)

- [x] 5.1 Write a failing test in a new `apps/web/src/lib/reportClientError.test.ts`: mock `api.POST`, call `reportClientError({ kind: 'crash', message: 'boom' })`, assert `api.POST` was called once with `/api/v1/client-errors` and the given body; assert it does not throw when the mocked `api.POST` rejects (fire-and-forget).
- [x] 5.2 Run the test, confirm it fails (module doesn't exist).
- [x] 5.3 Add `apps/web/src/lib/reportClientError.ts` exporting `reportClientError(report: ClientErrorReport): void` — calls `api.POST('/api/v1/client-errors', { body: report })` and swallows any rejection (`.catch(() => {})`), never awaited by its own callers.
- [x] 5.4 Run the test, confirm it passes.
- [x] 5.5 Write failing tests in `apps/web/src/lib/api.test.ts` (new `describe('errorReportingMiddleware', ...)` block, mirroring `sessionExpiryMiddleware`'s existing test shape exactly): reports on a 400+ response from a domain route; does not report on a 2xx response; does not report a failure of `/api/v1/client-errors` itself (D5's anti-recursion guard); `onError` reports a network-level failure.
- [x] 5.6 Run the new tests, confirm they fail (middleware doesn't exist).
- [x] 5.7 Add `errorReportingMiddleware` to `apps/web/src/lib/api.ts` (`onResponse`: report when `response.status >= 400` and `schemaPath !== '/api/v1/client-errors'`, with `kind: 'apiError'`; `onError`: same exclusion, report the caught error's message). Register via `api.use(errorReportingMiddleware)` alongside the existing `api.use(sessionExpiryMiddleware)`.
- [x] 5.8 Run the new tests, confirm they pass.

## 6. Frontend: ErrorBoundary (TDD)

- [x] 6.1 Write a failing test in a new `apps/web/src/components/ErrorBoundary.test.tsx` (mocking `@/lib/reportClientError` the same way `SessionExpiredModal.test.tsx` mocks `@/lib/api`): render a child that throws, assert the Pepe-designed fallback UI renders instead of the crash, and assert `reportClientError` was called once with `kind: 'crash'`, the thrown error's `message`, and a non-empty `componentStack`.
- [x] 6.2 Run the test, confirm it fails (component doesn't exist).
- [x] 6.3 Implement `apps/web/src/components/ErrorBoundary.tsx` as a class component (`componentDidCatch(error, info)` calling `reportClientError`), rendering the Pepe-approved fallback from task 1.1 when `this.state.hasError`.
- [x] 6.4 Run the test, confirm it passes.
- [x] 6.5 Wrap `<App />` with `<ErrorBoundary>` in `apps/web/src/main.tsx`, outside `<StrictMode>`'s inner tree position is irrelevant but outside any provider `App` itself renders (D4).

## 7. Verification, docs, and Sample Project check

- [x] 7.1 Run `make lint-api` and `make lint-web`; fix any issues.
- [x] 7.2 Run `make coverage-api` and `make coverage-web`; confirm both ≥80% gates still pass.
- [x] 7.3 Update `docs/deployment.md`'s "Logging and request correlation" list (around the existing `add-service-request-logging` bullet list) with a new bullet: frontend crashes and failed API calls are logged the same way, citing `(add-frontend-error-reporting)`.
- [x] 7.4 Sample Project check: this is an operational/observability capability with no seedable content (a crash or failed call isn't a piece of data a project can contain) — no `seed.go` change applies; note this explicitly rather than silently skipping it.
- [x] 7.5 Deploy locally (`docker-compose`), open the web app in a real browser, and manually verify: (a) triggering a deliberate render error (e.g. a temporary `throw` in a dev-only code path, reverted after) shows the fallback UI and produces a server log line; (b) a failed API call (e.g. block a request in devtools, or hit a 404) produces a server log line. Revert any temporary test code before calling this done.
