import { test, expect } from '@playwright/test'
import { unique } from './support'

// BDD E2E for add-scoped-api-tokens, mapped to
// openspec/changes/add-scoped-api-tokens/specs/authentication/spec.md and
// specs/authorization/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.

test.describe('Requirement: Scoped API tokens', () => {
  test('Scenario: A token scoped to Viewer can read but not write within its project', async ({ page, request }) => {
test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-35' })

    const projectName = unique('Scoped Token Project')
    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()
    await page.getByRole('menuitem', { name: /start from scratch/i }).click()
    await page.getByLabel('Name').fill(projectName)
    await page.getByRole('button', { name: /^create$/i }).click()
    await page.waitForURL(/\/projects\//)
    const projectKey = new URL(page.url()).pathname.split('/')[2]

    // Create a token scoped to this project's seeded read-only Viewer role,
    // through the real creation UI at /settings/tokens.
    await page.goto('/settings/tokens')
    await page.getByRole('button', { name: /new token/i }).click()
    await page.getByLabel(/^name$/i).fill(unique('e2e-viewer-token'))
    await page.getByRole('button', { name: /scope to a project/i }).click()
    await page.getByLabel('Project').selectOption({ label: projectName })
    await page.getByLabel(/^role$/i).selectOption({ label: 'Viewer' })
    await page.getByRole('button', { name: /^create$/i }).click()

    const tokenValue = await page.locator('code').innerText()
    expect(tokenValue).toMatch(/^tp_/)

    // A real second HTTP client, authenticated only via the scoped token's
    // bearer header — mirrors project-rbac.spec.ts's real-second-actor
    // pattern (a genuine request through the router/middleware chain, not a
    // mocked unit test).
    const readRes = await request.get(`/api/v1/projects/${projectKey}/cases`, {
      headers: { Authorization: `Bearer ${tokenValue}` },
    })
    expect(readRes.status()).toBe(200)

    const writeRes = await request.patch(`/api/v1/projects/${projectKey}`, {
      headers: { Authorization: `Bearer ${tokenValue}` },
      data: { name: 'Should be rejected' },
    })
    expect(writeRes.status()).toBe(403)
  })
})
