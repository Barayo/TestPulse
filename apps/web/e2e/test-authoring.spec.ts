import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the test-authoring capability, mapped to
// openspec/changes/add-core-domain/specs/test-authoring/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database.
//
// Interaction steps updated for redesign-ui: case/folder creation now lives
// in the folder explorer's drawer/inline rows, not directly on the project
// page — the domain requirements below are unchanged, only how you reach
// them. The one prior scenario dropped ("Folder name is required") was
// UI-only coverage never mapped to a spec.md scenario; the new inline
// creation row simply no-ops on an empty name rather than showing an error,
// a deliberate, lower-stakes UX for an inline row (see CaseDrawer/
// FolderExplorerPage for the equivalent title-required validation, which is
// still covered).

async function createProject(page: Page, label: string) {
  const name = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.waitForURL(/\/projects\//)
  return name
}

async function openFolderExplorer(page: Page) {
  // A brand-new, genuinely empty project shows the "Get started" checklist
  // instead of the library panel (enrich-project-landing) — its first step
  // routes to the same /library destination, so either control works here.
  const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
  const getStarted = page.getByRole('button', { name: /add your first test case/i })
  await goToLibrary.or(getStarted).click()
  await page.waitForURL(/\/library/)
}

// The content list, not the tree — a folder can appear in both once it's a
// subfolder of the currently open one (also expanded in the tree).
function content(page: Page) {
  return page.getByRole('list', { name: 'Section contents' })
}

test.describe('Requirement: Project management', () => {
  test('Scenario: Create a project', async ({ page }) => {
    const name = unique('QA Platform')
    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: /^create$/i }).click()
    await page.waitForURL(/\/projects\//)
    await page.goto('/')
    await expect(page.getByText(name)).toBeVisible()
  })

  test('Scenario: Project name is required', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()
    await page.getByRole('button', { name: /^create$/i }).click()
    await expect(page.getByText(/name is required/i)).toBeVisible()
  })
})

test.describe('Requirement: Test case creation and immutable versioning', () => {
  test('Scenario: Create a test case, then edit it to create a new version', async ({ page }) => {
    await createProject(page, 'Versioning Project')
    await openFolderExplorer(page)

    // Create.
    await page.getByRole('button', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByText('Login works')).toBeVisible()

    // Edit → new version (scenario: "Editing creates a new version").
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works v2')
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('list', { name: /version history/i }).getByText('v2')).toBeVisible()
    await page.getByRole('link', { name: /back to library/i }).click()
    // Scoped to the content list, not a bare page-wide text search: during
    // the transition back from case detail, its breadcrumb and heading both
    // also carry the case title, so an unscoped locator is briefly (and
    // under load, not-so-briefly) ambiguous between the two pages.
    await expect(page.getByRole('list', { name: 'Section contents' }).getByText('Login works v2')).toBeVisible()
  })
})

test.describe('Requirement: Test suite grouping', () => {
  test('Scenario: Add cases to a suite; removing one does not delete the case', async ({ page }) => {
    await createProject(page, 'Suites Project')
    await openFolderExplorer(page)
    await page.getByRole('button', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Case A')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByText('Case A')).toBeVisible()

    await page.goBack()
    await page.getByRole('button', { name: 'Go to Suites' }).click()
    await page.getByLabel(/suite name/i).fill('Smoke')
    await page.getByRole('button', { name: 'Create suite' }).click()
    await expect(page.getByText(/Smoke/).first()).toBeVisible()

    // Membership lives in the suite's drawer, not inline on the list
    // (redesign-ui follow-up: the list stays a clean name+count row).
    await page.getByText('Smoke').click()
    const dialog = page.getByRole('dialog', { name: 'Smoke' })
    await dialog.getByRole('button', { name: /add case/i }).click()
    await page.getByRole('dialog', { name: /add a case/i }).getByText('Case A').click()
    await expect(dialog.getByText(/^1 case$/)).toBeVisible()

    await dialog.getByRole('button', { name: /remove case a/i }).click()
    await expect(dialog.getByText(/^0 cases$/)).toBeVisible()
    // Case A still exists in the project — it reappears as a selectable
    // option in the suite's search picker.
    await dialog.getByRole('button', { name: /add case/i }).click()
    await expect(page.getByRole('dialog', { name: /add a case/i }).getByText('Case A')).toBeVisible()
  })
})

test.describe('Requirement: Project-level case folders', () => {
  test('Scenario: New project has a root folder; case defaults into it', async ({ page, request }) => {
    await createProject(page, 'Folders Project')
    await openFolderExplorer(page)
    const projectId = new URL(page.url()).pathname.split('/')[2]

    await page.getByRole('button', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByText('Login works')).toBeVisible()

    const folders = await (await request.get(`/api/v1/projects/${projectId}/folders`)).json()
    const root = folders.find((f: { parentFolderId?: string }) => !f.parentFolderId)
    const cases = await (await request.get(`/api/v1/projects/${projectId}/cases`)).json()
    expect(cases[0].folderId).toBe(root.id)
  })

  test('Scenario: Create a nested folder and place a case in it', async ({ page, request }) => {
    await createProject(page, 'Nested Folders Project')
    await openFolderExplorer(page)
    const projectId = new URL(page.url()).pathname.split('/')[2]

    await page.getByRole('button', { name: /^\+ new section$/i }).click()
    await page.getByLabel('New section name').fill('Auth')
    await page.getByLabel('New section name').press('Enter')
    await expect(content(page).getByText('Auth')).toBeVisible()

    await content(page).getByText('Auth').click()
    await page.getByRole('button', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByText('Login works')).toBeVisible()

    const folders = await (await request.get(`/api/v1/projects/${projectId}/folders`)).json()
    const auth = folders.find((f: { name: string }) => f.name === 'Auth')
    const cases = await (await request.get(`/api/v1/projects/${projectId}/cases`)).json()
    expect(cases[0].folderId).toBe(auth.id)
  })
})
