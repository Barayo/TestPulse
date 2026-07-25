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
  // A brand-new, genuinely empty project shows the "Get started" checklist
  // instead of the library panel (enrich-project-landing) — its first step
  // routes to the same /library destination, so either control works here.
  const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
  const getStarted = page.getByRole('button', { name: /add your first test case/i })
  await goToLibrary.or(getStarted).click()
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
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-29' })
    const name = await createProject(page, 'Landing Breadcrumb Project')
    const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/')
    await expect(nav.getByText(name)).toBeVisible()
  })

  test('Scenario: Breadcrumb reflects folder depth', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-30' })
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

  test('Scenario: Deep section nesting collapses the middle of the trail', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-31' })
    await createProject(page, 'Deep Nesting Project')
    await openFolderExplorer(page)
    for (const name of ['Transfers', 'National', 'SEPA', 'Domestic']) {
      await createFolderInOpenFolder(page, name)
      await content(page).getByText(name).click()
    }

    // 7 segments: Projects › {Project} › Library › Transfers › National › SEPA › Domestic
    // exceeds the 5-segment threshold, so the trail must collapse.
    const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.getByRole('link', { name: 'Projects' })).toBeVisible()
    await expect(nav.getByText('Domestic')).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Transfers' })).not.toBeVisible()

    const trigger = nav.getByRole('button', { name: /hidden path segments/i })
    await expect(trigger).toBeVisible()
    await trigger.click()
    const menu = page.getByRole('menu', { name: /hidden path segments/i })
    await expect(menu.getByRole('menuitem', { name: 'Transfers' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'National' })).toBeVisible()

    await menu.getByRole('menuitem', { name: 'Transfers' }).click()
    await expect(content(page).getByText('National')).toBeVisible()
  })

  test('Scenario: Breadcrumb on a run page', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-32' })
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

  test('Scenario: Case detail breadcrumb does not repeat the case title', async ({ page }) => {
    await createProject(page, 'Case Detail Breadcrumb Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    await content(page).getByText('Transfers').click()
    await createCase(page, 'Daily limit check')
    await content(page).getByText('Daily limit check').click()

    await expect(page.getByRole('heading', { name: 'Daily limit check' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.getByText('Transfers')).toBeVisible()
    await expect(nav.getByText('Daily limit check')).toHaveCount(0)
  })
})

test.describe('Requirement: Project switcher', () => {
  test('Scenario: Navigating to the active project via the header', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-33' })
    const name = await createProject(page, 'Header Link Project')
    const projectUrl = page.url()
    await openFolderExplorer(page)
    await page.getByRole('banner').getByRole('link', { name }).click()
    await expect(page).toHaveURL(projectUrl)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('Scenario: Switching project via the header icon', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-34' })
    const first = await createProject(page, 'Switcher First Project')
    await createProject(page, 'Switcher Second Project')

    await page.getByRole('button', { name: /switch project/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(first)).toBeVisible()
    await dialog.getByText(first).click()
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText(first)).toBeVisible()
  })

  test('Scenario: Switching project via keyboard', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-35' })
    await createProject(page, 'Keyboard Switcher Project')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})

test.describe('Requirement: Brand wordmark', () => {
  test('Scenario: Wordmark links home', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-36' })
    await createProject(page, 'Wordmark Home Project')
    await page.getByRole('link', { name: 'TestPulse' }).click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('Requirement: Project landing shows top-level structure only', () => {
  test('Scenario: Empty project shows per-panel empty states', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-37' })
    // Spec WHEN clause: "a project has cases or suites already, but one
    // panel has nothing in it yet" — a *totally* empty project (no cases,
    // no suites, no runs at all) instead shows the get-started checklist
    // (next scenario), so this needs at least one case to land on the
    // per-panel empty states as a stable end state, not a transient one
    // that flips away once landing data finishes loading.
    await createProject(page, 'Empty Landing Project')
    await openFolderExplorer(page)
    await createCase(page, 'Placeholder case')
    await page.goBack()
    await expect(page.getByText(/no suites yet/i)).toBeVisible()
    // Anchored on the trailing period — see the next scenario's comment for
    // why (the summary strip's status pill also reads "No runs yet").
    await expect(page.getByText(/no runs yet\./i)).toBeVisible()
  })

  test('Scenario: Entirely empty project shows a getting-started checklist instead of three empty panels', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-38' })
    await createProject(page, 'Entirely Empty Project')
    await expect(page.getByText(/get started/i)).toBeVisible()
    await expect(page.getByText(/no sections yet/i)).not.toBeVisible()
    await expect(page.getByText(/no suites yet/i)).not.toBeVisible()
    // Anchored on the trailing period: the Runs panel's own empty label is
    // "No runs yet." — the summary strip's status pill also reads "No runs
    // yet" (no period) when the project has never run, and stays visible
    // regardless of which of the two landing views is showing, so a bare
    // /no runs yet/i match would false-negative this assertion.
    await expect(page.getByText(/no runs yet\./i)).not.toBeVisible()
  })

  test('Scenario: Dense project stays legible', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-39' })
    await createProject(page, 'Dense Landing Project')
    await openFolderExplorer(page)
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']) {
      await createFolderInOpenFolder(page, name)
    }
    // Folders alone don't count toward "empty" (enrich-project-landing: only
    // cases/suites/runs do) — without at least one case the landing page
    // correctly shows the get-started checklist instead of the library
    // panel this scenario means to exercise, so give it one case.
    await createCase(page, 'Placeholder case')
    await page.goBack()
    await expect(page.getByRole('button', { name: 'Go to Library' })).toHaveText(/see all 5/)
  })
})

test.describe('Requirement: Library with two-pane navigation', () => {
  test('Scenario: Navigating into a nested folder', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-40' })
    await createProject(page, 'Nested Nav Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    await content(page).getByText('Transfers').click()
    await createFolderInOpenFolder(page, 'National')
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Transfers')).toBeVisible()
  })

  test('Scenario: A folder can contain both subfolders and cases', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-41' })
    await createProject(page, 'Mixed Content Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    await createCase(page, 'Daily limit')
    await expect(content(page).getByText('Transfers')).toBeVisible()
    await expect(content(page).getByText('Daily limit')).toBeVisible()
  })

  test('Scenario: Section tree is hidden below 768px', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-42' })
    await createProject(page, 'Mobile Tree Hidden Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')

    await page.setViewportSize({ width: 375, height: 800 })
    await expect(page.getByRole('navigation', { name: 'Section tree' })).toBeHidden()
    await expect(content(page).getByText('Transfers')).toBeVisible()
  })

  test('Scenario: Breadcrumbs cover upward navigation on mobile', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-43' })
    await createProject(page, 'Mobile Breadcrumb Nav Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    await content(page).getByText('Transfers').click()
    await createFolderInOpenFolder(page, 'National')
    await content(page).getByText('National').click()

    await page.setViewportSize({ width: 375, height: 800 })
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Transfers').click()
    await expect(content(page).getByText('National')).toBeVisible()
  })

  test('Scenario: Browse sections covers sideways navigation on mobile', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-44' })
    await createProject(page, 'Mobile Browse Sections Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    await createFolderInOpenFolder(page, 'Cards')

    await page.setViewportSize({ width: 375, height: 800 })
    await page.getByRole('button', { name: /browse sections/i }).click()
    await page.getByRole('dialog').getByText('Library / Cards').click()
    await expect(content(page).getByText('Cards')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Cards')).toBeVisible()
  })
})

test.describe('Requirement: Creating a folder', () => {
  test('Scenario: Creating a folder in the currently open folder', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-45' })
    await createProject(page, 'Toolbar Folder Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Onboarding')
  })

  test('Scenario: Creating a subfolder from the tree without navigating', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-46' })
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
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-47' })
    await createProject(page, 'Case With Steps Project')
    await openFolderExplorer(page)
    await createCase(page, 'Daily transfer limit', [
      { action: 'Start a transfer over the limit', expected: 'Blocked before confirming' },
    ])
    await expect(page.getByText('Daily transfer limit')).toBeVisible()
  })

  test('Scenario: Expected result per step is optional', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-48' })
    await createProject(page, 'Case Without Expected Project')
    await openFolderExplorer(page)
    await createCase(page, 'Case with bare step', [{ action: 'Do the thing' }])
    await expect(page.getByText('Case with bare step')).toBeVisible()
  })
})

test.describe('Requirement: Viewing an existing test case', () => {
  test('Scenario: Viewing steps and suite membership', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-49' })
    await createProject(page, 'View Case Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works', [{ action: 'Enter valid credentials', expected: 'Signed in' }])

    await page.goBack()
    await page.getByRole('button', { name: 'Go to Suites' }).click()
    await page.getByLabel(/suite name/i).fill('Smoke')
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: /create suite \(1\)/i }).click()
    await page.getByText('Smoke').click()
    const suiteDialog = page.getByRole('dialog', { name: 'Smoke' })
    await expect(suiteDialog.getByRole('checkbox', { name: 'Login works' })).toBeChecked()
    await suiteDialog.getByRole('button', { name: /dismiss/i }).click()

    await page.goBack()
    await openFolderExplorer(page)
    await page.getByText('Login works').click()
    await page.waitForURL(/\/cases\//)
    await expect(page.getByText('Enter valid credentials')).toBeVisible()
    await expect(page.getByText('Smoke')).toBeVisible()
  })

  test('Scenario: Version history is visible', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-50' })
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

  test('Scenario: Opening a version\'s detail dialog', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-51' })
    await createProject(page, 'Version Dialog Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works v2')
    await page.getByRole('button', { name: /save changes/i }).click()

    await page.getByRole('list', { name: /version history/i }).getByText('v1').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Version 1')).toBeVisible()
  })

  test('Scenario: Diff shows only changed fields', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-52' })
    await createProject(page, 'Diff Fields Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works v2')
    await page.getByRole('button', { name: /save changes/i }).click()

    await page.getByRole('list', { name: /version history/i }).getByText('v2').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Login works', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Login works v2', { exact: true })).toBeVisible()
  })

  test('Scenario: Oldest version has nothing to diff against', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-53' })
    await createProject(page, 'Oldest Version Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()

    await page.getByRole('list', { name: /version history/i }).getByText('v1').click()
    await expect(page.getByRole('dialog').getByText(/no previous version/i)).toBeVisible()
  })

  test('Scenario: Executions list and Flaky flag reflect mixed results for the same version', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-54' })
    await createProject(page, 'Flaky Version Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await expect(content(page).getByText('Login works')).toBeVisible()
    const projectId = new URL(page.url()).pathname.split('/')[2]

    await page.goto(`/projects/${projectId}/runs`)
    await page.getByLabel(/^name$/i).fill('Run pass')
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.getByRole('link', { name: 'Run pass' }).click()
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByRole('button', { name: /^pass$/i }).click()
    await expect(page.getByRole('list', { name: /result history/i }).getByText('pass')).toBeVisible()

    await page.goto(`/projects/${projectId}/runs`)
    await page.getByLabel(/^name$/i).fill('Run fail')
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.getByRole('link', { name: 'Run fail' }).click()
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByRole('button', { name: /^failed$/i }).click()
    await expect(page.getByRole('list', { name: /result history/i }).getByText('failed')).toBeVisible()

    await page.goto(`/projects/${projectId}/library`)
    await page.getByText('Login works').click()
    await page.getByRole('list', { name: /version history/i }).getByText('v1').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Run pass')).toBeVisible()
    await expect(dialog.getByText('Run fail')).toBeVisible()
    await expect(dialog.getByText(/flaky/i)).toBeVisible()

    // link-run-item-and-case-detail: each execution links to its own run item page.
    await dialog.getByText('Run pass').click()
    await expect(page).toHaveURL(/\/runs\/.+\/items\/.+/)
    await expect(page.getByRole('heading', { name: 'Login works' })).toBeVisible()
  })

  test('Scenario: Opening a case navigates to its own route', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-55' })
    await createProject(page, 'Case Route Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    const libraryUrl = page.url()

    await page.getByText('Login works').click()
    await page.waitForURL(/\/cases\//)
    await page.goBack()
    await expect(page).toHaveURL(libraryUrl)
  })

  test('Scenario: Properties render as labeled pairs', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-56' })
    await createProject(page, 'Labeled Properties Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.waitForURL(/\/cases\//)

    await expect(page.getByText('Test type')).toBeVisible()
    await expect(page.getByText('Automation')).toBeVisible()
  })

  test('Scenario: Results section shows a designed empty state', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-57' })
    await createProject(page, 'Results Empty State Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.waitForURL(/\/cases\//)

    await expect(page.getByText('Results', { exact: true })).toBeVisible()
    await expect(page.getByText(/no result history yet/i)).toBeVisible()
  })

  test('Scenario: Sidebar collapses to stacked sections on narrow viewports', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-58' })
    await createProject(page, 'Mobile Sidebar Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.waitForURL(/\/cases\//)

    await page.setViewportSize({ width: 375, height: 800 })
    // <details>/<summary>'s implicit ARIA role isn't reliably matched by
    // Playwright's getByRole engine — assert on the visible summary text
    // directly instead, which is what a user actually sees and clicks.
    const propertiesToggle = page.getByText('Properties', { exact: true })
    await expect(propertiesToggle).toBeVisible()
    await expect(page.getByText('Test type')).toBeHidden()
    await propertiesToggle.click()
    await expect(page.getByText('Test type')).toBeVisible()
  })
})

test.describe('Requirement: Editing a test case creates a new version', () => {
  test('Scenario: Saving an edit creates a new version', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-59' })
    await createProject(page, 'Edit Case Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works v2')
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('list', { name: /version history/i }).getByText('v2')).toBeVisible()
    await page.getByRole('link', { name: /back to library/i }).click()
    await expect(content(page).getByText('Login works v2')).toBeVisible()
  })
})

test.describe('Requirement: Project list with permission-ready create action', () => {
  test('Scenario: Listing projects', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-60' })
    const name = await createProject(page, 'Listed Project')
    await page.goto('/')
    await expect(page.getByText(name)).toBeVisible()
  })

  test('Scenario: Manual view choice persists across reloads', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-61' })
    await createProject(page, 'View Toggle Project')
    await page.goto('/')
    await page.getByRole('button', { name: /compact view/i }).click()
    await expect(page.getByRole('button', { name: /compact view/i })).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(page.getByRole('button', { name: /compact view/i })).toHaveAttribute('aria-pressed', 'true')
  })

  test('Scenario: Searching filters by name', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-62' })
    const findable = await createProject(page, 'Findable Alpha')
    await page.goto('/')
    await page.getByRole('button', { name: /compact view/i }).click()
    await page.getByLabel(/search projects/i).fill('Findable Alpha')
    await expect(page.getByText(findable)).toBeVisible()
  })
})
