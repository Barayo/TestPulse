import { test, expect } from '@playwright/test'

// BDD E2E for add-session-timeout-setting, mapped to the "Session-based
// login" requirement's new scenarios in openspec/specs/authentication/spec.md.
// sessionTimeoutDays is a single instance-wide row every spec file shares
// against the same compose stack (fullyParallel: true) — serial execution
// plus resetting back to 30 in afterAll, matching ui-theming.spec.ts's own
// handling of the sibling colorTheme setting.

test.describe('Requirement: Session-based login', () => {
  test.describe.configure({ mode: 'serial' })

  test.afterAll(async ({ request }) => {
    await request.patch('/api/v1/instance-settings', { data: { sessionTimeoutDays: 30 } })
  })

  test('Scenario: A Tenant Admin configures the session timeout', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-146' })
    await page.goto('/settings/instance')
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Session timeout' })
    const input = card.getByLabel(/timeout/i)
    await expect(input).toHaveValue('30')

    await input.fill('14')
    await card.getByRole('button', { name: /^save$/i }).click()

    await expect(input).toHaveValue('14')
    await page.reload()
    await expect(card.getByLabel(/timeout/i)).toHaveValue('14')
  })

  test('Scenario: Out-of-bounds timeout values are rejected', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-147' })
    await page.goto('/settings/instance')
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Session timeout' })
    const input = card.getByLabel(/timeout/i)
    await expect(input).toHaveValue('14')

    await input.fill('91')
    await expect(card.getByRole('alert').filter({ hasText: /between 1 and 90/i })).toBeVisible()
    await expect(card.getByRole('button', { name: /^save$/i })).toBeDisabled()

    // The rejected value never reached the server — reloading still shows
    // the last successfully saved one, not 91.
    await page.reload()
    await expect(card.getByLabel(/timeout/i)).toHaveValue('14')
  })
})
