import createClient from 'openapi-fetch'
import type { paths } from '@testpulse/shared/api'

// Same-origin in production; the Vite dev server proxies to the Go API.
// credentials: 'include' sends the session cookie set by /api/v1/auth/login
// on every request — the web app authenticates purely via that cookie, it
// never stores or sends a bearer token itself (design D7).
export const api = createClient<paths>({ baseUrl: '/', credentials: 'include' })
