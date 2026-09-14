import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the parameterized-cases capability, mapped to
// openspec/changes/add-parameterized-cases/specs/parameterized-cases/spec.md
// scenarios. GIVEN: the compose stack is up (make e2e), with a fresh
// database.

async function createProject(page: Page, label: string): Promise<string> {
  const name = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByLabel('Name').fill(name)
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

async function createOrdinaryCase(page: Page, title: string) {
  await page.getByRole('link', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill(title)
  await page.getByLabel(/^Action for step 1/i).fill('Do the thing')
  await page.getByRole('button', { name: /create test case/i }).click()
  await page.waitForURL(/\/cases\/(?!new)/)
}

// Authors a Steps-format case with one placeholder-bearing step and a
// 3-row parameter table (Name + username), via the real editor UI.
async function createParameterizedCase(page: Page, title: string) {
  await page.getByRole('link', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill(title)
  await page.getByLabel(/^Action for step 1/i).fill('Enter {username}')
  await page.getByLabel(/^Expected result for step 1/i).fill('{username} is logged in')

  await page.getByRole('button', { name: '+ Add test data' }).click()
  await page.getByLabel('Row 1 name').fill('validLogin')
  await page.getByRole('button', { name: 'Add column' }).click()
  await page.getByLabel('Column 1').fill('username')
  await page.getByLabel('Row 1 username').fill('admin@example.com')

  await page.getByRole('button', { name: '+ Add row' }).click()
  await page.getByLabel('Row 2 name').fill('wrongPassword')
  await page.getByLabel('Row 2 username').fill('nobody@example.com')

  await page.getByRole('button', { name: '+ Add row' }).click()
  await page.getByLabel('Row 3 name').fill('lockedAccount')
  await page.getByLabel('Row 3 username').fill('locked@example.com')

  await page.getByRole('button', { name: /create test case/i }).click()
  await page.waitForURL(/\/cases\/(?!new)/)
}

async function createRun(page: Page, name: string, caseTitles: string[]) {
  await page.getByLabel(/^name$/i).fill(name)
  for (const title of caseTitles) {
    await page.getByRole('checkbox', { name: title }).check()
  }
  await page.getByRole('button', { name: 'Create run' }).click()
}

test('Requirement: Parameterized (data-driven) test cases expand into one run item per row', async ({ page }) => {
  const projectKey = await createProject(page, 'Data-Driven Project')
  await openFolderExplorer(page)

  await createParameterizedCase(page, 'Login')
  await page.goto(`/projects/${projectKey}/library`)
  await createOrdinaryCase(page, 'Logout')

  // 1. Adding the parameterized case to a run expands it to one item per
  // row; the ordinary case still produces exactly one, unchanged item.
  await page.goto(`/projects/${projectKey}/runs/new`)
  await createRun(page, 'Sprint 1', ['Login', 'Logout'])
  await expect(page.getByText('validLogin')).toBeVisible()
  await expect(page.getByText('wrongPassword')).toBeVisible()
  await expect(page.getByText('lockedAccount')).toBeVisible()
  await expect(page.getByText('Login', { exact: true })).toHaveCount(3)
  await expect(page.getByText('Logout', { exact: true })).toHaveCount(1)

  // 2. Each row's item shows correctly-substituted step text and its own
  // test-data values — never the raw {username} template.
  await page.getByRole('button').filter({ hasText: 'validLogin' }).click()
  await expect(page).toHaveURL(/row=validLogin/)
  await expect(page.getByText('Enter admin@example.com')).toBeVisible()
  await expect(page.getByText('admin@example.com is logged in')).toBeVisible()
  await expect(page.getByText('Test data')).toBeVisible()
  await expect(page.getByText('username:')).toBeVisible()

  await page.goBack()
  await page.getByRole('button').filter({ hasText: 'wrongPassword' }).click()
  await expect(page).toHaveURL(/row=wrongPassword/)
  await expect(page.getByText('Enter nobody@example.com')).toBeVisible()

  // 3. The ordinary case's single item carries no test-data row.
  await page.goBack()
  await page.getByRole('button').filter({ hasText: 'Logout' }).click()
  await expect(page).not.toHaveURL(/row=/)
  await expect(page.getByText('Test data')).not.toBeVisible()

  // 4. The case's own detail page shows the unsubstituted template plus a
  // read-only parameter table — substitution never happens there.
  await page.goto(`/projects/${projectKey}/library`)
  await page.getByText('Login', { exact: true }).click()
  await expect(page.getByText('{username}').first()).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'validLogin' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'admin@example.com' })).toBeVisible()
})
