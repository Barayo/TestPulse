import { test, expect } from '@playwright/test'

// BDD E2E for the ui-theming capability, mapped to
// openspec/specs/ui-theming/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), authenticated as the seeded
// admin (global-setup.ts).
// The theme control lives on the Profile page's Appearance card, not the
// account dropdown — moved there after design review found the dropdown's
// filter-chip-style control read as the wrong kind of control for a
// set-once, whole-app preference (add-dark-mode-toggle follow-up).

test.describe('Requirement: A user can explicitly choose a theme', () => {
  test('Scenario: Explicit Dark choice overrides a light OS preference, and persists across sessions', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.goto('/settings/profile')
    const themeGroup = page.getByRole('group', { name: /theme/i })
    await expect(themeGroup).toBeVisible()
    await expect(page.getByRole('button', { name: /^system$/i })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: /^dark$/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: /^dark$/i })).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: /^dark$/i })).toHaveAttribute('aria-pressed', 'true')

    // Selecting System clears the explicit choice.
    await page.getByRole('button', { name: /^system$/i }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})

// add-color-theme-customization. Unlike the personal light/dark choice
// above (per-browser, via localStorage), colorTheme is a single
// instance-wide row every spec file shares against the same compose
// stack (fullyParallel: true) — serial execution within this describe
// block, plus resetting back to 'teal' in afterAll, avoids leaking a
// changed palette into whatever else is running against this instance
// (same reasoning public-project-access.spec.ts already documents for
// its own instance-wide mutations).
test.describe('Requirement: A Tenant Admin can choose an instance-wide color palette', () => {
  test.describe.configure({ mode: 'serial' })

  test.afterAll(async ({ request }) => {
    await request.patch('/api/v1/instance-settings', { data: { colorTheme: 'teal' } })
  })

  test('Scenario: Tenant Admin selects a preset', async ({ page }) => {
    await page.goto('/settings/instance')
    await page.getByRole('group', { name: 'Color theme' }).getByRole('button', { name: 'Ocean' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'ocean')
    const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary'))
    expect(primary.trim().toLowerCase()).toBe('#1453b8')
  })

  test('Scenario: The choice is visible to every user, not only admins', async ({ browser }) => {
    // The previous (serial) test already set the instance palette to
    // Ocean — confirm an anonymous visitor, with no session at all, sees
    // it too, not just the admin who set it.
    const anonContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anonPage = await anonContext.newPage()
    await anonPage.goto('/login')
    await expect(anonPage.locator('html')).toHaveAttribute('data-palette', 'ocean')
    await anonContext.close()
  })

  test('Scenario: Tenant Admin saves a custom palette', async ({ page }) => {
    await page.goto('/settings/instance')
    const colorThemeGroup = page.getByRole('group', { name: 'Color theme' })
    await colorThemeGroup.getByRole('button', { name: 'Custom' }).click()
    await page.getByLabel('Primary', { exact: true }).fill('#112233')
    await page.getByRole('button', { name: 'Save custom palette' }).click()
    await expect(colorThemeGroup.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')

    // aria-pressed on "Custom" reflects the editor being open, which is
    // already true before Save is even clicked — it doesn't tell us the
    // save's PATCH + refreshColorTheme() round trip (which is what actually
    // updates --primary, via AuthProvider -> ThemeProvider) has finished.
    // Poll the real observable outcome instead of a proxy for it.
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().toLowerCase()))
      .toBe('#112233')
  })
})
