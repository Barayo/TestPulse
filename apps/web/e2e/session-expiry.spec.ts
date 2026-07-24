import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for handle-session-expiry, mapped to
// openspec/changes/handle-session-expiry/specs/ui-navigation/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.

// Simulates the session going invalid mid-use (cookie expiry/revocation) by
// corrupting the existing session cookie's value directly via Playwright —
// no backend test-only endpoint needed, and it exercises the real 401 path
// the server already produces for an unrecognized session id.
async function corruptSessionCookie(page: Page) {
  const cookies = await page.context().cookies()
  const session = cookies.find((c) => c.name === 'session')
  if (!session) throw new Error('no session cookie found — was global-setup login successful?')
  await page.context().addCookies([{ ...session, value: 'corrupted-invalid-session-id' }])
}

// Waits for the *original* session check to actually resolve before a test
// goes on to corrupt the cookie — corrupting immediately after goto() races
// that first-load check itself, which would then (correctly) redirect to
// /login instead of exercising the mid-use path this spec is testing.
async function gotoAuthenticated(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /new project/i })).toBeVisible()
}

// Deliberately a client-side navigation (React Router <Link>), not a full
// page reload — a reload would remount the whole app fresh, which is the
// *first-load* invalid-session case (redirect to /login), not the mid-use
// case this feature exists for. Clicking into People keeps AuthProvider
// mounted with its already-authenticated `user`, then fires a new GET that
// hits the corrupted cookie and 401s — the real scenario being tested.
async function triggerMidUseRequest(page: Page) {
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  await page.getByRole('menuitem', { name: /^people$/i }).click()
}

test.describe('Requirement: Session expiry mid-use prompts re-login without losing place', () => {
  test('Scenario: A 401 after an established session opens the modal, explains why, and pre-fills email', async ({
    page,
  }) => {
    await gotoAuthenticated(page)

    await corruptSessionCookie(page)
    await triggerMidUseRequest(page)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/session has expired/i)
    await expect(page.getByLabel(/^email$/i)).toHaveValue('admin@example.com')
    expect(new URL(page.url()).pathname).toBe('/settings/people')
  })

  test('Scenario: The modal cannot be dismissed without logging in', async ({ page }) => {
    await gotoAuthenticated(page)
    await corruptSessionCookie(page)
    await triggerMidUseRequest(page)
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: /close/i })).toHaveCount(0)
  })

  test('Scenario: Re-authenticating as the same user resumes the same view', async ({ page }) => {
    await gotoAuthenticated(page)
    await corruptSessionCookie(page)
    await triggerMidUseRequest(page)
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel(/password/i).fill(process.env.E2E_ADMIN_PASSWORD ?? 'correcthorsebatterystaple')
    await page.getByRole('button', { name: /^log in$/i }).click()

    // A hard reload, so the URL is the same but the page is a fresh load —
    // wait for the browser navigation to actually complete before asserting.
    await page.waitForURL('/settings/people')
    await expect(page.getByRole('heading', { name: /^teams/i })).toBeVisible()
  })

  test('Scenario: Re-authenticating as a different user goes home', async ({ page }) => {
    const email = `${unique('session-expiry-other').replace(/\s+/g, '-').toLowerCase()}@example.com`
    const password = 'correcthorse'
    await page.request.post('/api/v1/users', { data: { email, password } })

    await gotoAuthenticated(page)
    await corruptSessionCookie(page)
    await triggerMidUseRequest(page)
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel(/^email$/i).fill(email)
    await page.getByLabel(/password/i).fill(password)
    await page.getByRole('button', { name: /^log in$/i }).click()

    await page.waitForURL('/')
    expect(new URL(page.url()).pathname).toBe('/')
  })
})
