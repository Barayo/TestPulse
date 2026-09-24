## Context

`Service` (`apps/api/internal/service/service.go`) already follows an
established optional-dependency pattern for things that aren't always
configured: `mailer`/`publicURL`/`passwordResetEnabled` via `WithMailer`,
`encryptionKey` via `WithEncryptionKey`. It has no logger field at all —
confirmed by grepping every file under `internal/service` and
`internal/store` for `slog`/`logger`: zero hits. `main.go` already
constructs a `*slog.Logger` (`logger := newLogger(cfg.LogLevel)`) and
passes it to `server.New(logger, ...)` for HTTP-layer logging, but never
to `service.New(...)` — the logger exists, it's just never reaches the
layer that most needs it.

`dispatchWebhooks` (`webhooks.go`, added this session in
`add-run-notifications`) is fire-and-forget by design (D4: a slow/dead
destination must never block the triggering write) — every failure path
is a bare `return`/`continue`. The three background workers
(`ProjectAutoArchiveWorker`, `RunRetentionWorker`, `ProjectDeletionWorker`,
all from `add-data-retention`) follow an identical documented pattern:
"errors are swallowed per-tick... there is no caller to report them to
once this is running detached." `audit()` (`identity.go`) has the same
shape: `_ = s.store.Audit.Append(ctx, ...)`.

On the HTTP side, `server.go` registers `middleware.RequestID` (chi), which
stores a generated ID in the request's context — but chi's own
`RequestID` middleware does not set a response header itself (confirmed:
that's the documented, deliberate responsibility of the consuming
application), and nothing in this codebase calls
`middleware.GetReqID(ctx)` anywhere. `respond` (`handlers.go`) only takes
`http.ResponseWriter`, not `*http.Request` or a context — its one existing
log line (`h.logger.Error("request failed", "error", err)`, the `default`
case mapping an unrecognized error to 500) has no route, method, actor, or
request ID, and every other error class (validation/401/403/404/409) is
mapped straight to a JSON response with no server-side log line at all.

## Goals / Non-Goals

**Goals:**
- Give `Service` (and everything built on it — workers, webhook dispatch,
  audit) a logger, closing the structural gap that makes the other two
  findings harder to fix than they should be.
- Make webhook delivery failures visible — the single highest-impact gap
  the review found, on the newest customer-facing feature in the codebase.
- Make a request's own ID actually usable for correlation: present in
  server logs for error responses, and returned to the client via a
  response header.

**Non-Goals:**
- Not building frontend error reporting (no `ErrorBoundary`, no
  `console.error`, no third-party error-tracking service). This project
  has no budget for paid tooling (established this session, re: GitHub
  Advanced Security) — a free-only frontend error-reporting story is a
  real, separate design question (build vs. self-host vs. a minimal
  `ErrorBoundary` + structured `console.error`) that deserves its own
  change, not a rushed addition here. Filed as a new backlog issue,
  split off from #207 the same way #130 was split into #130/#206 earlier
  this session.
- Not adding a delivery-history UI or retry mechanism for webhooks — pure
  visibility (a log line), not a product-facing feature. Matches
  `add-run-notifications` design.md's own non-goals.
- Not changing `respond`'s signature to thread `*http.Request` through
  (would touch all ~182 call sites across every handler file for a
  disproportionate diff) — see D2 for the chosen alternative.
- Not changing log *levels* globally or adding log aggregation/shipping —
  `TESTPULSE_LOG_LEVEL` + JSON-to-stdout is already the right choice at
  this deployment scale (confirmed by the same review) and is unaffected.

## Decisions

**D1: `Service.WithLogger(*slog.Logger) *Service`, defaulting to a
discard logger if never called.** Matches the existing `WithMailer`/
`WithEncryptionKey` builder pattern exactly. A nil-safe default (rather
than requiring every test/call site to set one) avoids a nil-pointer
panic in any test harness that constructs a `Service` without explicitly
wiring a logger — `slog.New(slog.DiscardHandler)` as the zero-value
default, matching how `mailer`'s zero value already means "silently
no-op" rather than requiring every caller to configure it.

**D2: Request/response error logging via a new HTTP middleware, not by
changing `respond`'s signature.** Adding `*http.Request` (or a context) to
`respond` would touch all ~182 existing call sites for what should be a
contained fix. Instead, a new middleware
(`requestLogging(logger)` in `middleware.go`) wraps the response writer
(chi's own `middleware.NewWrapResponseWriter`, already available via the
existing `chi/middleware` import), and after the handler returns, logs
one line for any response with `status >= 400`: method, path, status,
request ID (via `middleware.GetReqID`), duration. Warn for 4xx, Error for
5xx. This closes the "4xx has zero server-side trace" gap uniformly, for
every route, without touching a single handler. It runs alongside (not
instead of) `respond`'s existing `h.logger.Error("request failed", "error",
err)` line for the 500 case specifically — that line carries the actual
Go error value the middleware can't see (it only observes the status
code), so a 500 legitimately produces two complementary log lines: one
correlatable access-log-shaped line, one detailed application-error line.
Distinguished by log message text (`"request error"` for the middleware,
existing `"request failed"` for `respond`'s own) so they're not confused
for duplicates when read together.

**D3: `X-Request-Id` response header set via a small dedicated middleware
step, immediately after `middleware.RequestID`.** Chi's `RequestID`
generates the ID and stores it in context; it deliberately doesn't set a
response header (an app-level choice per chi's own design). A four-line
middleware (`w.Header().Set("X-Request-Id", middleware.GetReqID(ctx))`)
closes this — the same ID that shows up in an error's server-side log line
is now visible in the browser's network tab and can be quoted in a bug
report.

**D4: Webhook and worker logging both use `Warn`, not `Error`.** Neither
represents an application bug — a webhook destination being down, or a
retention sweep hitting a transient DB blip, are expected operational
conditions the system already tolerates by design (fire-and-forget,
retried next tick). `Error` is reserved for the unexpected-internal-error
class `respond`'s `default` case and the new middleware's 5xx branch
already use. Each webhook failure log line includes the destination host
(not the full URL with any query string) and the event type, but never the
payload body.

## Risks / Trade-offs

- **The new middleware and `respond`'s existing line can both fire for
  the same 500**, producing two log lines instead of one → Accepted (D2)
  — they carry different, complementary information, and are
  distinguishable by message text; not worth the ~182-call-site diff a
  unified single line would require.
- **Warn-level noise from expected conditions** (a webhook destination
  that's down for an extended period logs on every failed attempt) → No
  worse than today's total silence, and `Warn` (not `Error`) keeps it out
  of any alerting tuned to `Error`-and-above. A rate-limit/dedup pass is a
  reasonable future refinement if real usage shows it's noisy, not a v1
  requirement.
- **Splitting frontend error reporting out of #207** could mean it never
  gets picked up → Mitigated by filing it as its own tracked backlog issue
  immediately (not just a design.md mention), matching the #130/#206
  precedent.

## Migration Plan

No schema/data migration. Additive logging calls plus one new field on an
existing struct (defaulted, non-breaking for any existing `Service`
construction). Rollback is reverting the commit.
