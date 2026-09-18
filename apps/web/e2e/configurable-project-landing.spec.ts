import { test, expect } from '@playwright/test'

// BDD E2E for add-configurable-project-landing, mapped to
// openspec/specs/configurable-project-landing/spec.md's three
// requirements. defaultLandingView is a single instance-wide row every
// spec file shares against the same compose stack (fullyParallel: true) —
// serial execution plus resetting back to "dashboard" in afterAll,
// matching session-timeout-setting.spec.ts's own handling of a sibling
// instance-wide setting.

test.describe('Requirement: The instance has a Tenant-Admin-configurable default landing view', () => {
  test.describe.configure({ mode: 'serial' })

  test.afterAll(async ({ request }) => {
    await request.patch('/api/v1/instance-settings', { data: { defaultLandingView: 'dashboard' } })
  })

  test('Scenario: A Tenant Admin changes the instance default', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-172' })
    await page.goto('/settings/instance')
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Default landing view' })
    const group = card.getByRole('group', { name: 'Default landing view' })
    await expect(group.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-pressed', 'true')

    await group.getByRole('button', { name: 'Reports' }).click()
    await expect(group.getByRole('button', { name: 'Reports' })).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(card.getByRole('group', { name: 'Default landing view' }).getByRole('button', { name: 'Reports' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

test.describe('Requirement: A project may override the instance default landing view', () => {
  test('Scenario: A Project Admin sets and clears a per-project override', async ({ page, request }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-173' })
    const created = await (
      await request.post('/api/v1/projects', { data: { name: 'Landing Override E2E' } })
    ).json()
    const projectKey = created.key as string

    await page.goto(`/projects/${projectKey}/settings`)
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Landing view' })
    const group = card.getByRole('group', { name: 'Landing view' })
    await expect(group.getByRole('button', { name: /use instance default/i })).toHaveAttribute('aria-pressed', 'true')

    await group.getByRole('button', { name: 'Suites' }).click()
    await expect(group.getByRole('button', { name: 'Suites' })).toHaveAttribute('aria-pressed', 'true')

    await group.getByRole('button', { name: /use instance default/i }).click()
    await expect(group.getByRole('button', { name: /use instance default/i })).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('Requirement: Opening a project navigates to its effective landing view', () => {
  test('Scenario: A project configured for a non-Dashboard view redirects there', async ({ page, request }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-174' })
    const created = await (
      await request.post('/api/v1/projects', { data: { name: 'Landing Redirect E2E' } })
    ).json()
    const projectKey = created.key as string
    await request.patch(`/api/v1/projects/${projectKey}`, { data: { landingView: 'runs' } })

    await page.goto(`/projects/${projectKey}`)
    await page.waitForURL(new RegExp(`/projects/${projectKey}/runs`))
    // RunsPage's title is a CardTitle (ui/card.tsx), a plain div with no
    // ARIA heading role — getByRole('heading', ...) can never match it.
    await expect(page.locator('[data-slot="card-title"]', { hasText: 'Runs' })).toBeVisible()
  })
})
