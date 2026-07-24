import createClient from 'openapi-fetch'
import type { Middleware } from 'openapi-fetch'
import type { paths } from '@testpulse/shared/api'
import { notifySessionExpired } from './sessionExpiry'

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
