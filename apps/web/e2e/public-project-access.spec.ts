import { test, expect, type Browser, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the public-project-access capability, mapped to
// openspec/changes/enable-public-project-access/specs/public-project-access/spec.md
// scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.

async function createProject(page: Page, label: string): Promise<{ projectId: string; projectKey: string }> {
  const projectName = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByLabel('Name').fill(projectName)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.waitForURL(/\/projects\//)
  const projectId = new URL(page.url()).pathname.split('/')[2]
  const project = await (await page.request.get(`/api/v1/projects/${projectId}`)).json()
  return { projectId, projectKey: project.key }
}

// A fresh, unauthenticated browser context — no session cookie, mirroring
// project-rbac.spec.ts's loginAsNewUser but deliberately never logging in.
async function anonymousPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

test.describe('Requirement: Per-project public read access', () => {
  test('Scenario: Project Admin enables public access and an anonymous visitor can read it, with no write controls', async ({
    page,
    browser,
  }) => {
    const { projectId, projectKey } = await createProject(page, 'Public Access')

    await page.goto(`/projects/${projectId}/settings`)
    await page.getByRole('switch', { name: /public access/i }).click()
    await expect(page.getByText(`/public/${projectKey}`)).toBeVisible()

    const anon = await anonymousPage(browser)
    await anon.goto(`/public/${projectKey}`)
    await expect(anon.getByText(/viewing this project without an account/i)).toBeVisible()
    await expect(anon.getByText(projectKey)).toBeVisible()
    await expect(anon.getByRole('button', { name: /new run/i })).toHaveCount(0)
    await expect(anon.getByRole('button', { name: /create/i })).toHaveCount(0)
    await anon.close()
  })

  test('Scenario: Disabling public access immediately revokes anonymous reads', async ({ page, browser }) => {
    const { projectId, projectKey } = await createProject(page, 'Public Access Revoke')

    await page.goto(`/projects/${projectId}/settings`)
    await page.getByRole('switch', { name: /public access/i }).click()
    await expect(page.getByText(`/public/${projectKey}`)).toBeVisible()

    const anon = await anonymousPage(browser)
    await anon.goto(`/public/${projectKey}`)
    await expect(anon.getByText(/viewing this project without an account/i)).toBeVisible()

    await page.getByRole('switch', { name: /public access/i }).click()
    await anon.goto(`/public/${projectKey}`)
    await expect(anon.getByText(/not found|isn.t public/i)).toBeVisible()
    await anon.close()
  })

  test('Scenario: A non-public project is unreachable anonymously', async ({ page, browser }) => {
    const { projectKey } = await createProject(page, 'Never Public')

    const anon = await anonymousPage(browser)
    await anon.goto(`/public/${projectKey}`)
    await expect(anon.getByText(/not found|isn.t public/i)).toBeVisible()
    await anon.close()
  })
})

// publicProjectsEnabled is a single, genuinely instance-wide row — unlike
// every other piece of E2E test data, it can't be namespaced per-test via
// unique() (support.ts). This spec is the only one that reads/mutates it
// today; if a future spec ever exercises /public/* too, this describe
// block should move to test.describe.serial (or the assertions need to
// tolerate the switch being briefly off) to stay correct under
// playwright.config.ts's fullyParallel: true against the shared database.
test.describe('Requirement: Instance-wide kill switch for public project access', () => {
  test('Scenario: Instance-wide switch overrides a project\'s own setting, and re-enabling restores it without touching the project flag', async ({
    page,
    browser,
  }) => {
    const { projectId, projectKey } = await createProject(page, 'Kill Switch')
    await page.goto(`/projects/${projectId}/settings`)
    await page.getByRole('switch', { name: /public access/i }).click()
    await expect(page.getByText(`/public/${projectKey}`)).toBeVisible()

    const anon = await anonymousPage(browser)
    await anon.goto(`/public/${projectKey}`)
    await expect(anon.getByText(/viewing this project without an account/i)).toBeVisible()

    // Turn the instance-wide switch off.
    await page.goto('/settings/instance')
    const instanceSwitch = page.getByRole('switch', { name: /public project access, instance-wide/i })
    await expect(instanceSwitch).toBeChecked()
    await instanceSwitch.click()

    await anon.goto(`/public/${projectKey}`)
    await expect(anon.getByText(/not found|isn.t public/i)).toBeVisible()

    // Turn it back on — the project's own setting was never touched.
    await page.goto('/settings/instance')
    await page.getByRole('switch', { name: /public project access, instance-wide/i }).click()

    await anon.goto(`/public/${projectKey}`)
    await expect(anon.getByText(/viewing this project without an account/i)).toBeVisible()
    await anon.close()
  })
})
