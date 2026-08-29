import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for add-change-own-password, mapped to
// openspec/changes/add-change-own-password/specs/authentication/spec.md
// scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.

async function createUser(page: Page, email: string, password: string) {
  const res = await page.request.post('/api/v1/users', { data: { email, password } })
  expect(res.status()).toBe(201)
}

// A genuinely unauthenticated context — mirrors project-rbac.spec.ts's
// loginAsNewUser, but through the real UI login form (not the API
// directly), since the required-password-change scenario needs to observe
// the client-side gate the browser actually renders after login.
async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel(/^email$/i).fill(email)
  await page.getByLabel(/^password$/i).fill(password)
  await page.getByRole('button', { name: /^log in$/i }).click()
}

test.describe('Requirement: Self-service password change', () => {
  test('Scenario: Changing the password with the correct current password', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-1' })
    const email = `${unique('change-own-password').replace(/\s+/g, '-').toLowerCase()}@example.com`
    const oldPassword = 'correcthorse-original'
    const newPassword = 'correcthorse-changed'
    await createUser(page, email, oldPassword)

    const context = await browser.newContext()
    const target = await context.newPage()
    await loginViaUI(target, email, oldPassword)
    await target.waitForURL('/')

    await target.goto('/settings/profile')
    await target.getByRole('button', { name: /change password/i }).click()
    const dialog = target.getByRole('dialog')
    await dialog.getByLabel(/current password/i).fill(oldPassword)
    await dialog.getByLabel(/^new password$/i).fill(newPassword)
    await dialog.getByRole('button', { name: /^change password$/i }).click()

    await target.waitForURL('/login')
    await expect(target.getByText(/password updated/i)).toBeVisible()

    const oldLogin = await target.request.post('/api/v1/auth/login', { data: { email, password: oldPassword } })
    expect(oldLogin.ok()).toBe(false)
    const newLogin = await target.request.post('/api/v1/auth/login', { data: { email, password: newPassword } })
    expect(newLogin.ok()).toBe(true)
  })
})

test.describe('Requirement: Required password change at next login', () => {
  test('Scenario: A flagged account is gated at login until it changes its password', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-2' })
    const email = `${unique('require-change-target').replace(/\s+/g, '-').toLowerCase()}@example.com`
    const oldPassword = 'correcthorse-original'
    const newPassword = 'correcthorse-changed'
    await createUser(page, email, oldPassword)

    await page.goto('/settings/people')
    await page.getByPlaceholder(/search by email/i).fill(email)
    await page.getByText(email).waitFor()
    await page.getByRole('button', { name: `Edit ${email}` }).click()
    const editDialog = page.getByRole('dialog')
    await editDialog.getByRole('checkbox', { name: /require a password change/i }).check()
    await editDialog.getByRole('button', { name: /^save$/i }).click()
    await expect(editDialog).toHaveCount(0)

    const context = await browser.newContext()
    const target = await context.newPage()
    await loginViaUI(target, email, oldPassword)

    await expect(target.getByText(/requires a new password/i)).toBeVisible()
    // Blocked from ordinary routes until the gate is cleared.
    const blocked = await target.request.get('/api/v1/projects')
    expect(blocked.status()).toBe(403)

    await target.getByLabel(/current password/i).fill(oldPassword)
    await target.getByLabel(/^new password$/i).fill(newPassword)
    await target.getByRole('button', { name: /set new password/i }).click()

    await target.waitForURL('/login')
    await loginViaUI(target, email, newPassword)
    await target.waitForURL('/')
    await expect(target.getByText(/requires a new password/i)).toHaveCount(0)
    const unblocked = await target.request.get('/api/v1/projects')
    expect(unblocked.status()).toBe(200)
  })
})
