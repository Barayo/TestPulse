import { test, expect } from '@playwright/test'

// BDD E2E for the ui-theming capability, mapped to
// openspec/changes/add-dark-mode-toggle/specs/ui-theming/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), authenticated as the seeded
// admin (global-setup.ts).

test.describe('Requirement: A user can explicitly choose a theme', () => {
  test('Scenario: Explicit Dark choice overrides a light OS preference, and persists across sessions', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByRole('button', { name: /admin@example\.com/i }).click()
    const themeGroup = page.getByRole('group', { name: /theme/i })
    await expect(themeGroup).toBeVisible()
    await expect(page.getByRole('button', { name: /^system$/i })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: /^dark$/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: /^dark$/i })).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.getByRole('button', { name: /admin@example\.com/i }).click()
    await expect(page.getByRole('button', { name: /^dark$/i })).toHaveAttribute('aria-pressed', 'true')

    // Selecting System clears the explicit choice.
    await page.getByRole('button', { name: /^system$/i }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})
