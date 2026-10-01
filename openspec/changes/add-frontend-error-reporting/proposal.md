## Why

As a maintainer, when the frontend crashes or an API call fails, I want some record of what happened, so I'm not limited to whatever a user happens to describe in a support message. Confirmed: zero `ErrorBoundary` anywhere in `apps/web/src`, no `window.onerror`/`unhandledrejection` handler, and 17 call sites that discard a failed API call's actual error (`.catch(() => setProject(undefined))`). A crash or failed call leaves nothing behind once the tab closes (#209, split from #207's backend-half sibling `add-service-request-logging`).

## What Changes

- A new `POST /api/v1/client-errors` endpoint accepts a structured error report (crash or failed API call) and logs it server-side via the existing `slog`-based logger — no new storage, no new third-party service, matching `add-service-request-logging`'s established "pure visibility, not a feature" scope for webhook/worker failures.
- A new React `ErrorBoundary` wraps the app, catching render crashes, reporting them, and showing a minimal fallback instead of a blank white screen.
- A new middleware on the shared `api` client (`apps/web/src/lib/api.ts`) reports every failed API call (non-2xx response or network error) centrally — covering all 17 existing silent-catch call sites without touching any of them individually, since they all already go through this one shared client.

## Capabilities

### Modified Capabilities
- `operational-logging`: gains requirements for frontend crash and failed-API-call visibility, extending the existing backend-only "traceable after the fact" purpose to the frontend.

## Impact

- `packages/shared/openapi.yaml`: new `POST /api/v1/client-errors` path + `ClientErrorReport` schema.
- `apps/api/internal/server/handlers.go` (or a new `client_errors.go`): new handler, authenticated (same group as other authenticated routes).
- `apps/api/internal/service/service.go` (or a new `client_errors.go`): new `RecordClientError` method, logging via `s.logger` — no store/migration changes.
- `apps/web/src/lib/api.ts`: new middleware reporting failed responses/network errors.
- `apps/web/src/components/ErrorBoundary.tsx` (new): wraps `<App />` in `apps/web/src/main.tsx`.
- `apps/web/src/lib/reportClientError.ts` (new): shared fire-and-forget reporting helper used by both the middleware and the `ErrorBoundary`.
- `docs/mcp-server.md` unaffected; `docs/development.md` or `docs/api.md` gains a short note on the new endpoint.
