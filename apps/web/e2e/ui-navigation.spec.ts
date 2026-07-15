import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the ui-navigation capability, mapped to
// openspec/changes/redesign-ui/specs/ui-navigation/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database.

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
  await page.getByRole('button', { name: 'Go to Library' }).click()
  await page.waitForURL(/\/library/)
}

// The content list, not the tree — a folder can appear in both once it's a
// subfolder of the currently open one (also expanded in the tree), so tests
// that mean "the row you'd click in the main pane" scope to this.
function content(page: Page) {
  return page.getByRole('list', { name: 'Section contents' })
}

async function createFolderInOpenFolder(page: Page, name: string) {
  await page.getByRole('button', { name: /^\+ new section$/i }).click()
  await page.getByLabel('New section name').fill(name)
  await page.getByLabel('New section name').press('Enter')
  await expect(content(page).getByText(name)).toBeVisible()
}

async function createCase(
  page: Page,
  title: string,
  steps: { action: string; expected?: string }[] = [],
) {
  await page.getByRole('button', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill(title)
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) await page.getByRole('button', { name: /add step/i }).click()
    await page.getByLabel(`Action for step ${i + 1}`).fill(steps[i].action)
    if (steps[i].expected) {
      await page.getByLabel(`Expected result for step ${i + 1}`).fill(steps[i].expected!)
    }
  }
  await page.getByRole('button', { name: /create test case/i }).click()
}

test.describe('Requirement: Breadcrumb trail', () => {
  test("Scenario: Breadcrumb on a project's landing page", async ({ page }) => {
    const name = await createProject(page, 'Landing Breadcrumb Project')
    const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/')
    await expect(nav.getByText(name)).toBeVisible()
  })

  test('Scenario: Breadcrumb reflects folder depth', async ({ page }) => {
    await createProject(page, 'Folder Depth Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    await content(page).getByText('Transfers').click()
    await createFolderInOpenFolder(page, 'SEPA')
    await page.getByRole('navigation', { name: 'Section tree' }).getByText('SEPA').click()

    const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.getByRole('link', { name: 'Transfers' })).toBeVisible()
    await expect(nav.getByText('SEPA')).toBeVisible()
  })

  test('Scenario: Breadcrumb on a run page', async ({ page }) => {
    const name = await createProject(page, 'Run Breadcrumb Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.goBack()

    await page.getByRole('button', { name: 'Go to Runs' }).click()
    await page.getByLabel(/^name$/i).fill('Sprint 1')
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.getByRole('link', { name: 'Sprint 1' }).click()

    const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.getByRole('link', { name: name.split(' ')[0] })).toBeVisible()
    await expect(nav.getByText('Sprint 1')).toBeVisible()
  })
})

test.describe('Requirement: Project switcher', () => {
  test('Scenario: Navigating to the active project via the header', async ({ page }) => {
    const name = await createProject(page, 'Header Link Project')
    const projectUrl = page.url()
    await openFolderExplorer(page)
    await page.getByRole('banner').getByRole('link', { name }).click()
    await expect(page).toHaveURL(projectUrl)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('Scenario: Switching project via the header icon', async ({ page }) => {
    const first = await createProject(page, 'Switcher First Project')
    await createProject(page, 'Switcher Second Project')

    await page.getByRole('button', { name: /switch project/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(first)).toBeVisible()
    await dialog.getByText(first).click()
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText(first)).toBeVisible()
  })

  test('Scenario: Switching project via keyboard', async ({ page }) => {
    await createProject(page, 'Keyboard Switcher Project')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})

test.describe('Requirement: Brand wordmark', () => {
  test('Scenario: Wordmark links home', async ({ page }) => {
    await createProject(page, 'Wordmark Home Project')
    await page.getByRole('link', { name: 'TestPulse' }).click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('Requirement: Project landing shows top-level structure only', () => {
  test('Scenario: Empty project shows per-panel empty states', async ({ page }) => {
    await createProject(page, 'Empty Landing Project')
    await expect(page.getByText(/no sections yet/i)).toBeVisible()
    await expect(page.getByText(/no suites yet/i)).toBeVisible()
    await expect(page.getByText(/no runs yet/i)).toBeVisible()
  })

  test('Scenario: Dense project stays legible', async ({ page }) => {
    await createProject(page, 'Dense Landing Project')
    await openFolderExplorer(page)
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']) {
      await createFolderInOpenFolder(page, name)
    }
    await page.goBack()
    await expect(page.getByRole('button', { name: 'Go to Library' })).toHaveText(/see all 5/)
  })
})

test.describe('Requirement: Folder explorer with two-pane navigation', () => {
  test('Scenario: Navigating into a nested folder', async ({ page }) => {
    await createProject(page, 'Nested Nav Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    await content(page).getByText('Transfers').click()
    await createFolderInOpenFolder(page, 'National')
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Transfers')).toBeVisible()
  })

  test('Scenario: A folder can contain both subfolders and cases', async ({ page }) => {
    await createProject(page, 'Mixed Content Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    await createCase(page, 'Daily limit')
    await expect(content(page).getByText('Transfers')).toBeVisible()
    await expect(content(page).getByText('Daily limit')).toBeVisible()
  })
})

test.describe('Requirement: Creating a folder', () => {
  test('Scenario: Creating a folder in the currently open folder', async ({ page }) => {
    await createProject(page, 'Toolbar Folder Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Onboarding')
  })

  test('Scenario: Creating a subfolder from the tree without navigating', async ({ page }) => {
    await createProject(page, 'Right Click Folder Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    const tree = page.getByRole('navigation', { name: 'Section tree' })
    await tree.getByText('Transfers').click({ button: 'right' })
    await page.getByRole('menuitem', { name: /new section/i }).click()
    await page.getByLabel('New section name').fill('National')
    await page.getByLabel('New section name').press('Enter')

    // Still on the project root — the trigger didn't navigate into Transfers.
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Transfers')).toHaveCount(0)
    await tree.getByText('Transfers').click()
    await expect(content(page).getByText('National')).toBeVisible()
  })
})

test.describe('Requirement: Creating a test case', () => {
  test('Scenario: Creating a case with steps', async ({ page }) => {
    await createProject(page, 'Case With Steps Project')
    await openFolderExplorer(page)
    await createCase(page, 'Daily transfer limit', [
      { action: 'Start a transfer over the limit', expected: 'Blocked before confirming' },
    ])
    await expect(page.getByText('Daily transfer limit')).toBeVisible()
  })

  test('Scenario: Expected result per step is optional', async ({ page }) => {
    await createProject(page, 'Case Without Expected Project')
    await openFolderExplorer(page)
    await createCase(page, 'Case with bare step', [{ action: 'Do the thing' }])
    await expect(page.getByText('Case with bare step')).toBeVisible()
  })
})

test.describe('Requirement: Viewing an existing test case', () => {
  test('Scenario: Viewing steps and suite membership', async ({ page }) => {
    await createProject(page, 'View Case Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works', [{ action: 'Enter valid credentials', expected: 'Signed in' }])

    await page.goBack()
    await page.getByRole('button', { name: 'Go to Suites' }).click()
    await page.getByLabel(/suite name/i).fill('Smoke')
    await page.getByRole('button', { name: 'Create suite' }).click()
    await page.getByText('Smoke').click()
    const suiteDialog = page.getByRole('dialog', { name: 'Smoke' })
    await suiteDialog.getByRole('button', { name: /add case/i }).click()
    await page.getByRole('dialog', { name: /add a case/i }).getByText('Login works').click()
    await suiteDialog.getByRole('button', { name: /close/i }).click()

    await page.goBack()
    await openFolderExplorer(page)
    await page.getByText('Login works').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Enter valid credentials')).toBeVisible()
    await expect(dialog.getByText('Smoke')).toBeVisible()
  })

  test('Scenario: Version history is visible', async ({ page }) => {
    await createProject(page, 'Version History Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works v2')
    await page.getByRole('button', { name: /save changes/i }).click()

    const history = page.getByRole('list', { name: /version history/i })
    await expect(history.getByText('v1')).toBeVisible()
    await expect(history.getByText('v2')).toBeVisible()
  })
})

test.describe('Requirement: Editing a test case creates a new version', () => {
  test('Scenario: Saving an edit creates a new version', async ({ page }) => {
    await createProject(page, 'Edit Case Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works v2')
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('dialog').getByText('v2')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(content(page).getByText('Login works v2')).toBeVisible()
  })
})

test.describe('Requirement: Project list with permission-ready create action', () => {
  test('Scenario: Listing projects', async ({ page }) => {
    const name = await createProject(page, 'Listed Project')
    await page.goto('/')
    await expect(page.getByText(name)).toBeVisible()
  })

  test('Scenario: Manual view choice persists across reloads', async ({ page }) => {
    await createProject(page, 'View Toggle Project')
    await page.goto('/')
    await page.getByRole('button', { name: /compact view/i }).click()
    await expect(page.getByRole('button', { name: /compact view/i })).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(page.getByRole('button', { name: /compact view/i })).toHaveAttribute('aria-pressed', 'true')
  })

  test('Scenario: Searching filters by name', async ({ page }) => {
    const findable = await createProject(page, 'Findable Alpha')
    await page.goto('/')
    await page.getByRole('button', { name: /compact view/i }).click()
    await page.getByLabel(/search projects/i).fill('Findable Alpha')
    await expect(page.getByText(findable)).toBeVisible()
  })
})
