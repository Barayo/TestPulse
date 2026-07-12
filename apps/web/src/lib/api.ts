import createClient from 'openapi-fetch'
import type { paths } from '@testpulse/shared/api'

// Same-origin in production; the Vite dev server proxies to the Go API.
export const api = createClient<paths>({ baseUrl: '/' })
