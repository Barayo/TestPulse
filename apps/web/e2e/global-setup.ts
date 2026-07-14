import { request as playwrightRequest, type FullConfig } from '@playwright/test'

// Logs in once via the real POST /api/v1/auth/login (add-identity-basics)
// and saves the resulting session cookie as storageState, so every spec
// starts already authenticated instead of re-running the login UI flow
// per test. This exercises the real login path once — not a testing-only
// bypass, no special flag or build mode.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:8080'
  const context = await playwrightRequest.newContext({ baseURL })

  const response = await context.post('/api/v1/auth/login', {
    data: {
      email: process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com',
      password: process.env.E2E_ADMIN_PASSWORD ?? 'correcthorsebatterystaple',
    },
  })
  if (!response.ok()) {
    throw new Error(`E2E global setup: login failed (${response.status()}): ${await response.text()}`)
  }

  await context.storageState({ path: 'e2e/.auth/admin.json' })
  await context.dispose()
}
