import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for add-update-user, mapped to
// openspec/changes/add-update-user/specs/authentication/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.

async function createUser(page: Page, email: string, password: string) {
  const res = await page.request.post('/api/v1/users', { data: { email, password } })
  expect(res.status()).toBe(201)
}

test.describe('Requirement: Local user accounts', () => {
  test('Scenario: Tenant Admin changes a user\'s email', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-144' })
    const originalEmail = `${unique('edit-email-target').replace(/\s+/g, '-').toLowerCase()}@example.com`
    const newEmail = `${unique('edit-email-new').replace(/\s+/g, '-').toLowerCase()}@example.com`
    await createUser(page, originalEmail, 'correcthorse')

    await page.goto('/settings/people')
    await page.getByPlaceholder(/search by email/i).fill(originalEmail)
    await page.getByText(originalEmail).waitFor()
    await page.getByRole('button', { name: `Edit ${originalEmail}` }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const emailField = dialog.getByLabel(/^email$/i)
    await emailField.fill(newEmail)
    await dialog.getByRole('button', { name: /^save$/i }).click()
    await expect(dialog).toHaveCount(0)

    await page.getByPlaceholder(/search by email/i).fill(newEmail)
    await expect(page.getByText(newEmail)).toBeVisible()
    await expect(page.getByText(originalEmail)).toHaveCount(0)
  })

  // Replaces the old "Tenant Admin sets a new password for a user"
  // scenario (TD-80) — that exercised the Edit-user dialog's free-text
  // password field, removed by add-change-own-password. An admin can no
  // longer choose another account's password directly; see
  // change-own-password.spec.ts for the replacement admin actions
  // (trigger a reset email, require a password change at next login).
  test('Scenario: Tenant Admin triggers a password reset email for a user', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-145' })
    const email = `${unique('admin-reset-target').replace(/\s+/g, '-').toLowerCase()}@example.com`
    await createUser(page, email, 'correcthorse')

    await page.goto('/settings/people')
    await page.getByPlaceholder(/search by email/i).fill(email)
    await page.getByText(email).waitFor()
    await page.getByRole('button', { name: `Edit ${email}` }).click()

    const dialog = page.getByRole('dialog')
    // The compose stack has Mailpit configured by default (add-forgot-password),
    // so this is the send-reset-email path, not the SMTP-less fallback.
    await dialog.getByRole('button', { name: /send password reset email/i }).click()
    await expect(dialog).toContainText(new RegExp(`reset email sent to ${email}`, 'i'))
  })
})
