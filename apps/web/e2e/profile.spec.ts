import { test, expect } from '@playwright/test'

// BDD E2E for the authentication capability's self-service profile
// requirement, mapped to
// openspec/changes/add-custom-avatar-upload/specs/authentication/spec.md
// scenarios "Uploading a custom photo avatar" and "Removing a custom photo
// avatar".
// GIVEN: the compose stack is up (make e2e), authenticated as the seeded
// admin (global-setup.ts).

test.describe('Requirement: Self-service profile', () => {
  test('Scenario: Uploading a custom photo avatar replaces it everywhere, removing reverts to the generated default', async ({
    page,
  }) => {
    await page.goto('/settings/profile')

    await expect(page.getByRole('button', { name: /upload a photo/i })).toBeVisible()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/avatar-sample.jpg')

    const removeButton = page.getByRole('button', { name: /^remove$/i })
    await expect(removeButton).toBeVisible()
    await expect(page.getByText(/using your uploaded photo/i)).toBeVisible()
    // Header account-menu trigger now shows the uploaded photo, not the
    // generated initial chip — the Avatar component's single rendering
    // path (add-user-profile) applying to the new "custom" source too.
    await expect(page.locator('header img[src*="/avatar"]')).toBeVisible()

    await removeButton.click()

    await expect(removeButton).toBeHidden()
    await expect(page.locator('header img[src*="/avatar"]')).toBeHidden()
  })
})
