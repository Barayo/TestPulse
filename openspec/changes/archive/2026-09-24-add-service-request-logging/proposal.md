## Why

As a maintainer, when something breaks in production, I want the logs to
actually let me trace the failure back to its cause, so I'm not reduced to
re-reading source code or waiting for a support ticket to even know
something is wrong (issue #207, from an Architect review of logging
across the stack).

That review found two concrete, fixable gaps in the backend: webhook
delivery failures are completely invisible (no log line anywhere in
`dispatchWebhooks`, not even Debug level — the newest, customer-facing
integration in the codebase, and it has zero signal when it silently
stops working), and chi's `RequestID` middleware is wired but its value
is never read anywhere — generated per request and discarded, so even the
one error class that is logged (`respond`'s 500 catch-all) can't be
correlated to a specific request or to what a user actually saw. A third,
structural gap makes both worse than they need to be: `Service` has no
logger field at all, so nothing in the service or store layers can log
even if someone wanted to add one call.

## What Changes

- Add a `*slog.Logger` to `Service` (`WithLogger`, following the existing
  `WithMailer`/`WithEncryptionKey` builder pattern), wired from `main.go`
  using the logger that already exists there.
- Log webhook delivery failures (`dispatchWebhooks`) at Warn, using the
  new logger — the single highest-impact gap the review found.
- Log each background worker's per-tick failure (`ProjectAutoArchiveWorker`,
  `RunRetentionWorker`, `ProjectDeletionWorker`) at Warn instead of
  silently discarding it — the same swallowed-error pattern as webhook
  delivery, now fixable with the same logger.
- Log `audit()`'s own append failure at Warn instead of discarding it —
  audit is the system's other quasi-observability mechanism and had the
  identical blind spot.
- Add an HTTP-layer request-logging middleware that logs every 4xx/5xx
  response (method, path, status, request ID, duration) — today only the
  generic-500 branch of `respond` is logged at all; every validation/401/
  403/404/409 response has zero server-side trace.
- Set the `X-Request-Id` response header from chi's already-generated
  request ID, so a request can actually be correlated end to end (server
  log → browser network tab → a user's bug report).

## Capabilities

### New Capabilities
- `operational-logging`: the backend's request paths and background
  processes are traceable after the fact — every request that returns an
  error is logged with a correlatable request ID, and every background
  process's failures are visible instead of silently discarded.

### Modified Capabilities
(none)

## Impact

- **Backend**: `apps/api/internal/service/service.go` (new field +
  builder), `apps/api/internal/service/webhooks.go`,
  `apps/api/internal/service/project_auto_archive_worker.go`,
  `apps/api/internal/service/run_retention_worker.go`,
  `apps/api/internal/service/project_deletion_worker.go`,
  `apps/api/internal/service/identity.go` (`audit()`),
  `apps/api/internal/server/middleware.go` (new request-logging
  middleware, request-ID response header), `apps/api/internal/server/
  server.go` (middleware registration), `apps/api/cmd/testpulse-api/
  main.go` (`.WithLogger(logger)` wiring).
- **Docs**: `docs/deployment.md` or `docs/development.md` — note what's
  now logged and at what level, for anyone debugging a production issue.
- **Sample Project**: exempt — pure observability/infra, no new
  user-visible surface (CLAUDE.md's standing exemption).
- **Explicitly out of scope** (see design.md Non-Goals): frontend error
  reporting (no `ErrorBoundary`, no `console.error`, no error-reporting
  service anywhere in `apps/web`) — a materially larger, separate
  initiative with its own tooling/budget questions, tracked as its own
  follow-up issue rather than folded in here.
