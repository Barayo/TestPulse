import createClient from 'openapi-fetch'
import type { Middleware } from 'openapi-fetch'
import type { paths } from '@testpulse/shared/api'
import { notifySessionExpired } from './sessionExpiry'
import { reportClientError } from './reportClientError'

// Same-origin in production; the Vite dev server proxies to the Go API.
// credentials: 'include' sends the session cookie set by /api/v1/auth/login
// on every request — the web app authenticates purely via that cookie, it
// never stores or sends a bearer token itself (design D7).
export const api = createClient<paths>({ baseUrl: '/', credentials: 'include' })

// A 401 mid-use (session expired/revoked) needs a different reaction than a
// 401 before any session existed (handled by RequireAuth's redirect) — the
// login/logout endpoints' own 401s are excluded so a wrong-password attempt
// or a logout-of-an-already-dead-session never re-triggers this
// (handle-session-expiry). AuthProvider decides what to actually do; this
// middleware only reports the fact.
export const sessionExpiryMiddleware: Middleware = {
  onResponse({ response, schemaPath }) {
    if (response.status !== 401) return
    if (schemaPath === '/api/v1/auth/login' || schemaPath === '/api/v1/auth/logout') return
    notifySessionExpired()
  },
}

api.use(sessionExpiryMiddleware)

// Reports every failed API call made through the shared client — any
// response with status 400+, or a network-level failure — independent of
// whether the calling code itself inspects the response's error field
// (add-frontend-error-reporting design.md D3). /api/v1/client-errors
// itself is excluded from both reactions so a failure delivering a report
// never recurses into reporting that failure (design.md D5).
export const errorReportingMiddleware: Middleware = {
  onResponse({ response, schemaPath, request }) {
    if (response.status < 400) return
    if (schemaPath === '/api/v1/client-errors') return
    reportClientError({
      kind: 'apiError',
      message: `${request.method} ${schemaPath} responded ${response.status}`,
      method: request.method,
      path: schemaPath,
      status: response.status,
      url: window.location.pathname,
    })
  },
  onError({ error, schemaPath, request }) {
    if (schemaPath === '/api/v1/client-errors') return
    reportClientError({
      kind: 'apiError',
      message: error instanceof Error ? error.message : String(error),
      method: request.method,
      path: schemaPath,
      url: window.location.pathname,
    })
  },
}

api.use(errorReportingMiddleware)
