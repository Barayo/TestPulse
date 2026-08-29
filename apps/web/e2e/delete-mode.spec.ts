import { test, expect, type Browser, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for redesign-delete-mode-menu, mapped to
// openspec/changes/redesign-delete-mode-menu/specs/test-authoring/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.

async function createProjectId(page: Page, label: string): Promise<string> {
  const projectName = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByLabel('Name').fill(projectName)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.waitForURL(/\/projects\//)
  return new URL(page.url()).pathname.split('/')[2]
}

async function openFolderExplorer(page: Page) {
  const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
  const getStarted = page.getByRole('button', { name: /add your first test case/i })
  await goToLibrary.or(getStarted).click()
  await page.waitForURL(/\/library/)
}

function content(page: Page) {
  return page.getByRole('list', { name: 'Section contents' })
}

async function createFolderInOpenFolder(page: Page, name: string) {
  await page.getByRole('button', { name: /^\+ new section$/i }).click()
  await page.getByLabel('New section name').fill(name)
  await page.getByLabel('New section name').press('Enter')
  await expect(content(page).getByText(name)).toBeVisible()
}

async function createCase(page: Page, title: string) {
  await page.getByRole('button', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill(title)
  await page.getByRole('button', { name: /create test case/i }).click()
  await expect(page.getByText(title)).toBeVisible()
}

async function loginAsNewUser(adminPage: Page, browser: Browser, label: string): Promise<{ page: Page; userId: string }> {
  const email = `${unique(label).replace(/\s+/g, '-').toLowerCase()}@example.com`
  const password = 'correcthorse'
  const created = await (await adminPage.request.post('/api/v1/users', { data: { email, password } })).json()

  const context = await browser.newContext()
  const page = await context.newPage()
  const loginResponse = await page.request.post('/api/v1/auth/login', { data: { email, password } })
  expect(loginResponse.ok()).toBe(true)
  return { page, userId: created.id }
}

async function assignRole(adminPage: Page, projectId: string, userId: string, roleName: string) {
  const roles: { id: string; name: string }[] = await (await adminPage.request.get('/api/v1/roles')).json()
  const roleId = roles.find((r) => r.name === roleName)?.id
  if (!roleId) throw new Error(`no seeded role named "${roleName}" found`)
  const res = await adminPage.request.put(`/api/v1/projects/${projectId}/members/${userId}`, { data: { roleId } })
  expect(res.status()).toBe(204)
}

test.describe('Requirement: Destructive actions are tucked behind a per-row menu and require confirmation', () => {
  test('Scenario: A folder row\'s menu trigger is not shown without sectionDelete permission', async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-3' })
    const projectId = await createProjectId(page, 'Delete Menu Visibility')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Auth')

    const { page: testerPage, userId } = await loginAsNewUser(page, browser, 'Tester No Delete')
    await assignRole(page, projectId, userId, 'Tester')

    await testerPage.goto(`/projects/${projectId}/library`)
    await expect(content(testerPage).getByText('Auth')).toBeVisible()
    await expect(testerPage.getByRole('button', { name: /actions for auth/i })).toHaveCount(0)
  })

  test('Scenario: Opening a folder row\'s menu reveals Delete; deleting a folder cascades to its subtree', async ({
    page,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-4' })
    await createProjectId(page, 'Delete Menu Cascade')
    await openFolderExplorer(page)

    // A subfolder with a case inside, so the confirmation preview has
    // something non-trivial to show.
    await createFolderInOpenFolder(page, 'Auth')
    await content(page).getByText('Auth').click()
    await createCase(page, 'Login works')
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Library').click()

    // No delete affordance until the row's own "⋯" menu is opened.
    await expect(page.getByRole('menuitem', { name: /^delete$/i })).toHaveCount(0)
    await page.getByRole('button', { name: /actions for auth/i }).click()
    await expect(page.getByRole('menuitem', { name: /^delete$/i })).toBeVisible()

    await page.getByRole('menuitem', { name: /^delete$/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/1 case/i)).toBeVisible()

    // Cancel first: nothing changes.
    await dialog.getByRole('button', { name: /^cancel$/i }).click()
    await expect(content(page).getByText('Auth')).toBeVisible()

    // Confirm: the folder and its case are gone.
    await page.getByRole('button', { name: /actions for auth/i }).click()
    await page.getByRole('menuitem', { name: /^delete$/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^delete section$/i }).click()
    await expect(content(page).getByText('Auth')).toHaveCount(0)
  })

  test('Scenario: Right-clicking a case or folder row opens its menu at the cursor', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-5' })
    await createProjectId(page, 'Right Click Row Menu')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Auth')

    await content(page).getByText('Auth').click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: /^delete$/i })).toBeVisible()
    await page.keyboard.press('Escape')

    await createCase(page, 'Login works')
    await content(page).getByText('Login works').click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: /move to/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /^delete$/i })).toBeVisible()
  })

  test('Scenario: The section tree\'s "New section" action has a visible trigger, not just right-click', async ({
    page,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-6' })
    await createProjectId(page, 'Tree Visible Trigger')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Auth')

    const tree = page.getByRole('navigation', { name: 'Section tree' })
    await tree.getByRole('button', { name: /new section in auth/i }).click()
    await page.getByRole('menuitem', { name: /new section/i }).click()
    await page.getByLabel('New section name').fill('2FA')
    await page.getByLabel('New section name').press('Enter')

    await content(page).getByText('Auth').click()
    await expect(content(page).getByText('2FA')).toBeVisible()
  })
})
