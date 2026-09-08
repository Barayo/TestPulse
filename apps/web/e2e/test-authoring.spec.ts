import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the test-authoring capability, mapped to
// openspec/changes/add-core-domain/specs/test-authoring/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database.
//
// Interaction steps updated for redesign-ui: folder creation lives in the
// folder explorer's inline rows, not directly on the project page — the
// domain requirements below are unchanged, only how you reach them. The
// one prior scenario dropped ("Folder name is required") was UI-only
// coverage never mapped to a spec.md scenario; the new inline creation row
// simply no-ops on an empty name rather than showing an error, a
// deliberate, lower-stakes UX for an inline row (see FolderExplorerPage
// for the equivalent title-required validation, which is still covered).
//
// Case creation moved from a drawer to a dedicated page
// (redesign-case-creation-as-page) — "+ New test case" is now a link, and
// creating a case navigates to its own detail page rather than staying in
// the Library, so flows that create several cases in a row navigate back
// to the Library explicitly instead of relying on the drawer's old
// stay-in-place behavior.

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
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-41' })
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
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-42' })
    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()
    await page.getByRole('button', { name: /^create$/i }).click()
    await expect(page.getByText(/name is required/i)).toBeVisible()
  })
})

test.describe('Requirement: Test case creation and immutable versioning', () => {
  test('Scenario: Create a test case, then edit it to create a new version', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-43' })
    await createProject(page, 'Versioning Project')
    await openFolderExplorer(page)

    // Create.
    await page.getByRole('link', { name: /new test case/i }).click()
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

  test('Scenario: Creating a Gherkin case', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-148' })
    await createProject(page, 'Gherkin Project')
    await openFolderExplorer(page)

    await page.getByRole('link', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Login BDD')
    await page.getByRole('button', { name: /gherkin/i }).click()
    await page
      .getByLabel(/scenario/i)
      .fill('Given a user\nWhen they log in\nThen they see the dashboard')
    await page.getByRole('button', { name: /create test case/i }).click()

    // Creating a case navigates straight to its own detail page
    // (redesign-case-creation-as-page) — no need to click back into it.
    await expect(page.getByRole('heading', { name: 'Login BDD' })).toBeVisible()
    await expect(page.getByText('Given')).toBeVisible()
    await expect(page.getByText('When')).toBeVisible()
  })
})

test.describe('Requirement: Test suite grouping', () => {
  test('Scenario: Add cases to a suite; removing one does not delete the case', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-44' })
    await createProject(page, 'Suites Project')
    const projectKey = new URL(page.url()).pathname.split('/')[2]
    await openFolderExplorer(page)
    await page.getByRole('link', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Case A')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByRole('heading', { name: 'Case A' })).toBeVisible()

    // A second case in its own section, to exercise the case grid's section
    // scoping (rework-suite-case-picker-scale) in the same flow. Creating a
    // case now navigates to its own detail page (redesign-case-creation-
    // as-page), so return to the Library directly rather than chaining
    // goBack() calls through a now-different-depth history stack.
    await page.goto(`/projects/${projectKey}/library`)
    await page.getByRole('button', { name: /^\+ new section$/i }).click()
    await page.getByLabel('New section name').fill('Checkout')
    await page.getByLabel('New section name').press('Enter')
    await content(page).getByText('Checkout').click()
    await page.getByRole('link', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Case B')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByRole('heading', { name: 'Case B' })).toBeVisible()

    await page.goto(`/projects/${projectKey}`)
    await page.getByRole('button', { name: 'Go to Suites' }).click()
    // Creating a suite opens straight into its own detail page
    // (rework-suites-landing-ux) — no inline form on the index.
    await page.getByRole('button', { name: /new suite/i }).click()
    await page.getByLabel(/suite name/i).fill('Smoke')
    await page.getByRole('button', { name: /^create$/i }).click()
    await expect(page.getByRole('heading', { name: 'Smoke' })).toBeVisible()
    // Suite detail defaults to view mode (rework-suite-run-flow) — the
    // case-selection grid only renders once "Edit cases" is clicked.
    await page.getByRole('button', { name: /edit cases/i }).click()

    // Scoping to "Checkout" narrows the grid to Case B only.
    await expect(page.getByRole('checkbox', { name: 'Case A' })).toBeVisible()
    await page.getByRole('treeitem', { name: /^checkout/i }).click()
    await expect(page.getByRole('checkbox', { name: 'Case B' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Case A' })).not.toBeVisible()
    await page.getByRole('treeitem', { name: /^all sections/i }).click()

    await page.getByRole('checkbox', { name: 'Case A' }).check()
    await page.getByRole('button', { name: /save changes/i }).click()
    // Saving returns to view mode, where the checkbox no longer renders —
    // "Edit cases" reappearing is the view-mode-visible proof of the save.
    await expect(page.getByRole('button', { name: /edit cases/i })).toBeVisible()

    await page.getByRole('link', { name: 'Suites', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Suites' }).getByText('Smoke')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Suites' }).getByText(/^1 case$/)).toBeVisible()

    // Membership lives on the suite's own detail page, not a list-level dialog.
    await page.getByText('Smoke').click()
    await page.getByRole('button', { name: /edit cases/i }).click()
    await expect(page.getByRole('checkbox', { name: 'Case A' })).toBeChecked()
    await page.getByRole('checkbox', { name: 'Case A' }).uncheck()
    await page.getByRole('button', { name: /save changes/i }).click()

    // Case A still exists in the project — it's still a selectable (just
    // unchecked) row, not gone from the grid entirely.
    await expect(page.getByRole('button', { name: /edit cases/i })).toBeVisible()
    await page.getByRole('button', { name: /edit cases/i }).click()
    await expect(page.getByRole('checkbox', { name: 'Case A' })).not.toBeChecked()
    await page.getByRole('button', { name: /^cancel$/i }).click()
    await page.getByRole('link', { name: 'Suites', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Suites' }).getByText(/^0 cases$/)).toBeVisible()
  })
})

test.describe('Requirement: Project-level case folders', () => {
  test('Scenario: New project has a root folder; case defaults into it', async ({ page, request }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-45' })
    await createProject(page, 'Folders Project')
    await openFolderExplorer(page)
    const projectId = new URL(page.url()).pathname.split('/')[2]

    await page.getByRole('link', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByText('Login works')).toBeVisible()

    const folders = await (await request.get(`/api/v1/projects/${projectId}/folders`)).json()
    const root = folders.items.find((f: { parentFolderId?: string }) => !f.parentFolderId)
    const cases = await (await request.get(`/api/v1/projects/${projectId}/cases`)).json()
    expect(cases.items[0].folderId).toBe(root.id)
  })

  test('Scenario: Create a nested folder and place a case in it', async ({ page, request }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-46' })
    await createProject(page, 'Nested Folders Project')
    await openFolderExplorer(page)
    const projectId = new URL(page.url()).pathname.split('/')[2]

    await page.getByRole('button', { name: /^\+ new section$/i }).click()
    await page.getByLabel('New section name').fill('Auth')
    await page.getByLabel('New section name').press('Enter')
    await expect(content(page).getByText('Auth')).toBeVisible()

    await content(page).getByText('Auth').click()
    await page.getByRole('link', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByText('Login works')).toBeVisible()

    const folders = await (await request.get(`/api/v1/projects/${projectId}/folders`)).json()
    const auth = folders.items.find((f: { name: string }) => f.name === 'Auth')
    const cases = await (await request.get(`/api/v1/projects/${projectId}/cases`)).json()
    expect(cases.items[0].folderId).toBe(auth.id)
  })
})

// add-jira-connector: openspec/changes/add-jira-connector/specs/test-authoring/spec.md,
// requirement "Linking a test case to a Jira issue".
test.describe('Requirement: Linking a test case to a Jira issue', () => {
  test('Scenario: Set a Jira issue key on a case', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-47' })
    await createProject(page, 'Jira Link Project')
    await openFolderExplorer(page)

    await page.getByRole('link', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works')
    await page.getByRole('button', { name: /create test case/i }).click()
    await page.getByText('Login works').click()

    await page.getByRole('button', { name: /link jira issue/i }).click()
    await page.getByRole('textbox', { name: /jira issue key/i }).fill('proj-123')
    await page.getByRole('button', { name: /^save$/i }).click()

    await expect(page.getByText('PROJ-123')).toBeVisible()
    await expect(page.getByRole('button', { name: /link jira issue/i })).not.toBeVisible()
  })

  test('Scenario: Clearing a Jira issue key also clears its cached summary', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-48' })
    await createProject(page, 'Jira Unlink Project')
    await openFolderExplorer(page)

    await page.getByRole('link', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works')
    await page.getByRole('button', { name: /create test case/i }).click()
    await page.getByText('Login works').click()

    await page.getByRole('button', { name: /link jira issue/i }).click()
    await page.getByRole('textbox', { name: /jira issue key/i }).fill('proj-123')
    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText('PROJ-123')).toBeVisible()

    await page.getByRole('button', { name: /change jira link/i }).click()
    await page.getByRole('textbox', { name: /jira issue key/i }).fill('')
    await page.getByRole('button', { name: /^save$/i }).click()

    await expect(page.getByText('PROJ-123')).not.toBeVisible()
    await expect(page.getByRole('button', { name: /link jira issue/i })).toBeVisible()
  })
})
