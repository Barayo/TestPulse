import { test, expect } from '@playwright/test'

// BDD end-to-end suite for the walking skeleton, mapped 1:1 to
// openspec scenarios in specs/platform-deployment/spec.md.
// GIVEN: the compose stack is up (make e2e).

test.describe('Requirement: Single-command evaluation via docker-compose', () => {
  test('Scenario: Fresh checkout starts successfully — UI is reachable and healthy', async ({
    page,
  }) => {
    // WHEN the user opens the documented localhost port
    await page.goto('/')

    // THEN the web UI serves with the app shell
    await expect(page).toHaveTitle('TestPulse')
    await expect(page.getByRole('heading', { name: 'TestPulse' })).toBeVisible()
    await expect(page.getByText('Dashboard')).toBeVisible()

    // AND the API behind it is ready (database up, migrations applied),
    // proven end-to-end through the UI's own status check
    await expect(page.getByText('System ready')).toBeVisible()
    await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible()
  })

  test('Scenario: SPA routes are served after a full page load', async ({
    page,
  }) => {
    // WHEN the browser loads a client-side route directly
    await page.goto('/projects/some-future-route')

    // THEN the app shell still renders (SPA fallback, no 404)
    await expect(page.getByRole('heading', { name: 'TestPulse' })).toBeVisible()
  })
})

test.describe('Requirement: Health and readiness endpoints', () => {
  test('Scenario: Ready when database is reachable', async ({ request }) => {
    // WHEN the readiness endpoint is called while the stack is healthy
    const readyz = await request.get('/readyz')

    // THEN it returns success
    expect(readyz.status()).toBe(200)
    expect(await readyz.json()).toEqual({ status: 'ok' })
  })

  test('Scenario: Liveness reports process health', async ({ request }) => {
    const healthz = await request.get('/healthz')
    expect(healthz.status()).toBe(200)
  })
})

test.describe('Requirement: Versioned API under /api/v1', () => {
  test('Scenario: Service metadata is exposed', async ({ request }) => {
    const meta = await request.get('/api/v1/meta')
    expect(meta.status()).toBe(200)
    expect(await meta.json()).toMatchObject({ name: 'TestPulse' })
  })
})
