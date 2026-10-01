## Context

`add-service-request-logging` (archived, #207's backend half) gave `Service` a `logger *slog.Logger` field (`WithLogger`, defaulting to a discard sink) and established the project's logging conventions: structured `slog` calls, Warn for recoverable/expected failures, Error for unexpected ones, no new storage or third-party service for pure visibility (webhook delivery failures, background worker per-tick failures — both just log, nothing more). That same change's design.md explicitly deferred the frontend half to its own change, with a strong opinion already recorded: "This project has no budget for paid tooling... a minimal `ErrorBoundary` + structured `console.error`" was the suggested shape, not a third-party service.

Confirmed in `apps/web/src`: zero `ErrorBoundary`, zero `window.onerror`/`unhandledrejection` handler, and every API call goes through one shared client (`export const api = createClient<paths>(...)` in `apps/web/src/lib/api.ts`), which already has one `Middleware` registered (`sessionExpiryMiddleware`, reacting to 401 via `onResponse`). `openapi-fetch`'s `Middleware` type also exposes `onError` (network-level failures — the client's own `fetch` throwing, e.g. offline) distinct from `onResponse` (any HTTP response, any status, before the caller's `.then()`/`.catch()` ever sees it). Confirmed 17 call sites use a pattern like `request.then(({ data }) => setProject(data)).catch(() => setProject(undefined))` — since `openapi-fetch` resolves normally even on a 4xx/5xx response (returning `{ error }`, not rejecting), these `.catch()` blocks only ever fire on the rarer network-failure case; the actual "discarded" data is an HTTP error response whose `error` field is never read. Either way, a single `onResponse`/`onError` pair on the shared client observes every failure regardless of what each call site does afterward — no per-call-site changes needed.

## Goals / Non-Goals

**Goals:**
- A frontend render crash produces a server-side log line instead of a silent blank screen.
- A failed API call (any non-2xx response, or a network-level failure) produces a server-side log line, covering all existing and future call sites through the one shared `api` client.
- Stay within "no budget for paid tooling": no new dependency, no new service to operate, no new persistent storage.

**Non-Goals:**
- No error-tracking database table, admin UI, or queryable "error inbox" — matches `add-service-request-logging`'s "pure visibility, not a feature" scope for the exact same kind of gap on the backend side. A structured log line, visible in whatever log stream/aggregation the deployment already uses, is the full scope of v1.
- No self-hosted FOSS Sentry alternative (e.g. GlitchTip) or hosted third-party service — both rejected: the former adds a whole new stateful service to operate for a problem this size; the latter is a paid-tooling-adjacent vendor dependency this project has already ruled out.
- No reporting for crashes/failures that happen before a session exists (e.g. on `/login` before authenticating) — the new endpoint is authenticated, same as the rest of `/api/v1`, and no anonymous, rate-limited surface is being added to accept unauthenticated reports. An accepted, documented gap, not an oversight (see Risks).
- No change to any of the 17 existing `.catch()` call sites — the centralized middleware covers them for free (see D3).

## Decisions

**D1 — One flat `ClientErrorReport` shape covering both crash and API-failure reports, distinguished by a `kind` field.** Fields: `kind` (`"crash"` | `"apiError"`), `message` (required), `stack` (optional, JS stack), `componentStack` (optional, React's component stack — only set for `kind: "crash"`), `url` (the page path where it happened), and for `kind: "apiError"`: `method`, `path` (the OpenAPI `schemaPath`, not the raw interpolated URL, to avoid leaking IDs into log aggregation the way `add-service-request-logging` already avoids for webhook URLs), `status` (absent for a network-level failure). One schema, one endpoint, one service method — simpler than two parallel report types for what is, server-side, the same action ("log a structured frontend failure").

**D2 — No persistence; a single `s.logger.Warn("frontend client error", ...)` call, mirroring `dispatchWebhooks`'s existing failure-logging shape exactly** (`s.logger.Warn("webhook delivery failed", "host", host, "event", event.Event, "error", err)`). `Service.RecordClientError(ctx, report ClientErrorReport) error` validates only that `message` is non-empty; everything else is attached as structured log attributes, including the resolved actor (via `domain.ActorFromContext`, same as `RecordResult`) for correlation with who hit the failure. Returns an error only for the empty-message case — REST maps that to 400, otherwise the handler always responds 204.

**D3 — Centralized via `api.ts` middleware, not by touching the 17 existing call sites.** An `onResponse` handler reports any response with `status >= 400` (uniform with the backend's own `requestLogging` middleware's `status >= 400` threshold — deliberate symmetry between the two halves of this same visibility story); an `onError` handler reports a network-level failure. Both call a shared `reportClientError()` helper (`apps/web/src/lib/reportClientError.ts`) that POSTs fire-and-forget (no await in the caller, errors from the report itself are swallowed — see Risks). This is `sessionExpiryMiddleware`'s next-door neighbor: two independent middlewares on the same client, each reacting to the same responses for a different reason, exactly how the backend's own `requestLogging` middleware runs alongside `respond`'s existing error-mapping without replacing it.

**D4 — `ErrorBoundary` wraps `<App />` in `main.tsx`, outside every provider.** A crash inside `AuthProvider`/`ThemeProvider`/`DataRevisionProvider` itself must still be caught, so the boundary sits at the outermost point, not inside `App.tsx`. React only supports error boundaries as class components (`componentDidCatch`); this one is a small, self-contained class component, not a library dependency.

**D5 — Exclude `/api/v1/client-errors` itself from the `onResponse`/`onError` reporting middleware.** Without this guard, a failure delivering a report (e.g. the endpoint itself 500s, or the network is down) would recurse into reporting that failure. Matches `sessionExpiryMiddleware`'s existing precedent of excluding specific `schemaPath`s (`/api/v1/auth/login`/`/logout`) from its own reaction.

**D6 — The `ErrorBoundary` fallback screen's exact visual design is not fixed here.** Per this project's standing practice for UI changes, a Pepe (visual design) pass happens before the component is implemented, not decided unilaterally in this design doc — captured as the first implementation task, not skipped.

## Risks / Trade-offs

- **[Risk]** Fire-and-forget reporting is best-effort: a report can itself be lost (client fully offline, tab closed before the POST completes). **Mitigation**: accepted — this is strictly better than today's "nothing at all," not a guarantee of delivery; a future retry/queue mechanism is out of scope (YAGNI without evidence reports are actually being lost in practice).
- **[Risk]** A buggy page that fails the *same* API call repeatedly (e.g. a broken polling loop) could produce a burst of log lines. **Mitigation**: accepted for v1 — no client-side dedup/throttling; the backend's own `requestLogging` middleware already logs the same burst today from the request side, so this isn't a new failure mode, just a second, complementary log line per occurrence (matching `add-service-request-logging` D2's "two complementary log lines" precedent for 500s).
- **[Risk]** Reports are unauthenticated-inaccessible by design (D2/Non-Goals), so a pre-login crash (e.g. on `/login` itself) is invisible. **Mitigation**: accepted, documented gap; revisit only if evidence shows pre-login crashes are a real, recurring problem.

## Migration Plan

No data migration. Purely additive: one new REST endpoint, one new frontend component, one new frontend middleware. No existing behavior changes (the 17 call sites are untouched).
