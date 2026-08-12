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
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-79' })
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

  test('Scenario: Tenant Admin sets a new password for a user', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-80' })
    const email = `${unique('reset-target').replace(/\s+/g, '-').toLowerCase()}@example.com`
    await createUser(page, email, 'correcthorse-old')

    // A real active session for the target, established before the reset —
    // proves it stops authenticating afterward.
    const memberContext = await browser.newContext()
    const memberPage = await memberContext.newPage()
    const loginRes = await memberPage.request.post('/api/v1/auth/login', { data: { email, password: 'correcthorse-old' } })
    expect(loginRes.ok()).toBe(true)
    const meBefore = await memberPage.request.get('/api/v1/users/me')
    expect(meBefore.status()).toBe(200)

    await page.goto('/settings/people')
    await page.getByPlaceholder(/search by email/i).fill(email)
    await page.getByText(email).waitFor()
    await page.getByRole('button', { name: `Edit ${email}` }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^generate$/i }).click()
    const passwordField = dialog.getByLabel(/new password/i)
    const generated = await passwordField.inputValue()
    expect(generated).toHaveLength(20)
    await expect(dialog).toContainText(/signs them out everywhere/i)
    await dialog.getByRole('button', { name: /^save$/i }).click()
    await expect(dialog).toHaveCount(0)

    // The pre-existing session no longer authenticates…
    const meAfter = await memberPage.request.get('/api/v1/users/me')
    expect(meAfter.status()).toBe(401)
    // …but the new password works.
    const newLogin = await memberPage.request.post('/api/v1/auth/login', { data: { email, password: generated } })
    expect(newLogin.ok()).toBe(true)

    await memberPage.close()
  })
})
