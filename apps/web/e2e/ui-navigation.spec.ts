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
  test("Scenario: No breadcrumb on a project's own landing page", async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-29' })
    const name = await createProject(page, 'Landing Breadcrumb Project')
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0)
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
    for (const name of ['Transfers', 'National', 'SEPA', 'Domestic', 'Recurring']) {
      await createFolderInOpenFolder(page, name)
      await content(page).getByText(name).click()
    }

    // 6 segments after the header chip's now-redundant leading "Projects ›
    // {Project}" is trimmed: Library › Transfers › National › SEPA ›
    // Domestic › Recurring — exceeds the 5-segment threshold, so the trail
    // must collapse (keeping the first two and last two, hiding the middle).
    const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.getByRole('link', { name: 'Library' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Transfers' })).toBeVisible()
    await expect(nav.getByText('Recurring')).toBeVisible()
    await expect(nav.getByRole('link', { name: 'National' })).not.toBeVisible()

    const trigger = nav.getByRole('button', { name: /hidden path segments/i })
    await expect(trigger).toBeVisible()
    await trigger.click()
    const menu = page.getByRole('menu', { name: /hidden path segments/i })
    await expect(menu.getByRole('menuitem', { name: 'National' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'SEPA' })).toBeVisible()

    await menu.getByRole('menuitem', { name: 'National' }).click()
    await expect(content(page).getByText('SEPA')).toBeVisible()
  })

  test('Scenario: No breadcrumb on a run page — the header chip covers the project, the run name is already the heading', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-32' })
    await createProject(page, 'Run Breadcrumb Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await expect(content(page).getByText('Login works')).toBeVisible()
    await page.goBack()

    await page.getByRole('button', { name: 'Go to Runs' }).click()
    // A brand-new project has zero runs, so the page shows both the header
    // "+ New run" and the empty-state CTA of the same name — the header one
    // (DOM order) is what a user reaches for first.
    await page.getByRole('link', { name: /\+ new run/i }).first().click()
    await page.getByLabel(/^name$/i).fill('Sprint 1')
    // rework-run-creation-ux: "Create run" is gated behind an explicit case
    // selection — no longer implicitly includes every project case.
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: 'Create run' }).click()
    // Creating a run now navigates straight to its own detail page.
    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)

    // RunPage's title renders via CardTitle (a styled div, not a semantic
    // heading role) — same pattern as SuitesPage/RunsPage.
    await expect(page.locator('[data-slot="card-title"]', { hasText: 'Sprint 1' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0)
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
    await expect(page.getByRole('heading', { name: first })).toBeVisible()
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

  test('Scenario: Resized tree width persists across reloads', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-87' })
    await createProject(page, 'Resize Persist Project')
    await openFolderExplorer(page)
    const tree = page.getByRole('navigation', { name: 'Section tree' })
    const handle = page.getByRole('separator', { name: /resize section tree/i })
    const before = await tree.evaluate((el) => el.getBoundingClientRect().width)

    await handle.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const widened = before + 32
    await expect(tree).toHaveJSProperty('offsetWidth', widened)

    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Section tree' })).toHaveJSProperty('offsetWidth', widened)
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
    await page.getByRole('dialog').getByText('Cards').click()
    await expect(content(page).getByText('Cards')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Cards')).toBeVisible()
  })

  test('Scenario: A section row shows its case count and a critical-priority indicator', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-67' })
    await createProject(page, 'Section Richness Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Transfers')
    await content(page).getByText('Transfers').click()
    await page.getByRole('button', { name: /new test case/i }).click()
    const drawer = page.getByRole('dialog', { name: /new test case/i })
    await drawer.getByLabel(/^title$/i).fill('Daily limit')
    await drawer.getByLabel(/^priority$/i).selectOption('critical')
    await drawer.getByRole('button', { name: /create test case/i }).click()
    await expect(content(page).getByText('Daily limit')).toBeVisible()

    // Up one level, where Transfers itself is a row (with its count/critical
    // indicator) in the parent's content list.
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Library').click()

    const transfersRow = content(page).getByText('Transfers').locator('xpath=ancestor::li')
    await expect(transfersRow.getByText('1 case')).toBeVisible()
    await expect(transfersRow.getByText(/critical/i)).toBeVisible()
  })

  test('Scenario: Filtering the toolbar narrows the section, with a distinct filtered-to-zero state', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-68' })
    await createProject(page, 'Library Filter Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await expect(content(page).getByText('Login works')).toBeVisible()

    await page.getByRole('combobox', { name: /^priority$/i }).selectOption('critical')
    await expect(page.getByText(/no cases match your filters/i)).toBeVisible()
    await expect(page.getByText(/nothing here yet/i)).toHaveCount(0)

    await page.getByRole('button', { name: /clear filters/i }).click()
    await expect(content(page).getByText('Login works')).toBeVisible()
  })

  test('Scenario: Search entire Library flattens matches across sections with their section path', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-69' })
    await createProject(page, 'Library Cross-Search Project')
    await openFolderExplorer(page)
    await createCase(page, 'Root level case')
    await createFolderInOpenFolder(page, 'Transfers')
    await content(page).getByText('Transfers').click()
    await createCase(page, 'Nested case')

    // Still viewing Transfers — the root-level case isn't part of this
    // section's own contents.
    await expect(page.getByText('Root level case')).toHaveCount(0)
    await page.getByLabel(/search entire library/i).check()
    await expect(page.getByText('Root level case')).toBeVisible()
    await expect(page.getByText('Nested case')).toBeVisible()
    await expect(content(page).getByText('Transfers', { exact: true })).toBeVisible()
  })

  // add-flaky-test-detection: the same "pass in one run, fail in another,
  // same pinned version" shape as TD-54's per-version Flaky badge, but
  // checked against the Library's project-scoped Flaky filter/indicator
  // instead of the version-detail dialog.
  test('Scenario: A currently-flaky case shows a Flaky indicator and surfaces via the Flaky filter', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-77' })
    await createProject(page, 'Flaky Filter Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await createCase(page, 'Checkout works')
    await expect(content(page).getByText('Login works')).toBeVisible()
    const projectId = new URL(page.url()).pathname.split('/')[2]

    await page.goto(`/projects/${projectId}/runs/new`)
    await page.getByLabel(/^name$/i).fill('Run pass')
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByRole('button', { name: /^pass$/i }).click()
    // recordVerdict (RunItemDetailPage.tsx) keeps the verdict buttons
    // disabled until the POST and its follow-up refetches finish — wait for
    // that real completion signal before the hard page.goto below, which
    // otherwise races (and under load, can cancel) the in-flight write.
    await expect(page.getByRole('button', { name: /^pass$/i })).toBeEnabled()

    await page.goto(`/projects/${projectId}/runs/new`)
    await page.getByLabel(/^name$/i).fill('Run fail')
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByRole('button', { name: /^failed$/i }).click()
    await expect(page.getByRole('button', { name: /^failed$/i })).toBeEnabled()

    await page.goto(`/projects/${projectId}/library`)
    const row = content(page).getByText('Login works').locator('xpath=ancestor::li')
    await expect(row.getByText('Flaky')).toBeVisible()
    await expect(content(page).getByText('Checkout works')).toBeVisible()

    await page.getByRole('combobox', { name: /^flaky$/i }).selectOption('yes')
    await expect(content(page).getByText('Login works')).toBeVisible()
    await expect(content(page).getByText('Checkout works')).toHaveCount(0)
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
    await page.getByRole('button', { name: /new suite/i }).click()
    await page.getByLabel(/suite name/i).fill('Smoke')
    await page.getByRole('button', { name: /^create$/i }).click()
    await expect(page.getByRole('heading', { name: 'Smoke' })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('checkbox', { name: 'Login works' })).toBeChecked()

    // Two entries back: the suite detail page (pushed on create), then the
    // Suites index, landing back on the project page.
    await page.goBack()
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

  test('Scenario: Opening a version\'s execution history dialog', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-51' })
    await createProject(page, 'Version Dialog Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works v2')
    await page.getByRole('button', { name: /save changes/i }).click()

    const history = page.getByRole('list', { name: /version history/i })
    await history.getByText('v1').click()
    await history.getByRole('button', { name: /view executions/i }).click()
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

    const history = page.getByRole('list', { name: /version history/i })
    await history.getByText('v2').click()
    await expect(history.getByText('Login works', { exact: true })).toBeVisible()
    await expect(history.getByText('Login works v2', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('Scenario: Oldest version has nothing to diff against', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-53' })
    await createProject(page, 'Oldest Version Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()

    const history = page.getByRole('list', { name: /version history/i })
    await history.getByText('v1').click()
    await expect(history.getByText(/no previous version/i)).toBeVisible()
  })

  test('Scenario: Executions list and Flaky flag reflect mixed results for the same version', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-54' })
    await createProject(page, 'Flaky Version Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await expect(content(page).getByText('Login works')).toBeVisible()
    const projectId = new URL(page.url()).pathname.split('/')[2]

    await page.goto(`/projects/${projectId}/runs/new`)
    await page.getByLabel(/^name$/i).fill('Run pass')
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: 'Create run' }).click()
    // Creating a run now navigates straight to its own detail page.
    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByRole('button', { name: /^pass$/i }).click()
    await expect(page.getByRole('list', { name: /result history/i }).getByText('pass')).toBeVisible()

    await page.goto(`/projects/${projectId}/runs/new`)
    await page.getByLabel(/^name$/i).fill('Run fail')
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByRole('button', { name: /^failed$/i }).click()
    await expect(page.getByRole('list', { name: /result history/i }).getByText('failed')).toBeVisible()

    await page.goto(`/projects/${projectId}/library`)
    await page.getByText('Login works').click()
    const history = page.getByRole('list', { name: /version history/i })
    await history.getByText('v1').click()
    await history.getByRole('button', { name: /view executions/i }).click()
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

  test('Scenario: Header actions menu — Move to… and Delete', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-72' })
    await createProject(page, 'Case Actions Project')
    await openFolderExplorer(page)
    await createFolderInOpenFolder(page, 'Archive')
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.waitForURL(/\/cases\//)

    await page.getByRole('button', { name: /actions for login works/i }).click()
    await page.getByRole('menuitem', { name: /move to…/i }).click()
    const moveDialog = page.getByRole('dialog', { name: /move to…/i })
    await moveDialog.getByText('Archive').click()
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(breadcrumb.getByText('Archive')).toBeVisible()

    await page.getByRole('button', { name: /actions for login works/i }).click()
    await page.getByRole('menuitem', { name: /^delete$/i }).click()
    await page.getByRole('button', { name: /^delete case$/i }).click()
    await page.waitForURL(/\/library/)
    await expect(page.getByText('Login works')).not.toBeVisible()
  })

  test('Scenario: Version history shows a change signal, with an inline diff expand', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-73' })
    await createProject(page, 'Version Signal Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works v2')
    await page.getByRole('button', { name: /save changes/i }).click()

    const history = page.getByRole('list', { name: /version history/i })
    await expect(history.getByText(/initial version/i)).toBeVisible()
    await expect(history.getByText(/title changed/i)).toBeVisible()

    await history.getByText('v2').click()
    await expect(history.getByText('Login works', { exact: true })).toBeVisible()
    await expect(history.getByText('Login works v2', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).not.toBeVisible()
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

  test('Scenario: A version history row shows who made the change', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-73' })
    await createProject(page, 'Version Actor Project')
    await openFolderExplorer(page)
    await createCase(page, 'Login works')
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works v2')
    await page.getByRole('button', { name: /save changes/i }).click()

    // The e2e session is authenticated as the Tenant Admin (global-setup.ts),
    // whose display name is the hardcoded "Admin" (BootstrapAdmin) — so the
    // new version's row folds that actor's avatar and first name into the
    // change-signal line.
    const history = page.getByRole('list', { name: /version history/i })
    const v2Row = history.getByRole('button').filter({ hasText: 'v2' })
    await expect(v2Row.getByText('Admin', { exact: true })).toBeVisible()
    await expect(v2Row.getByText('Admin', { exact: true })).toHaveAttribute('title', 'Admin')
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

// rework-run-creation-ux: the "New run" form gained a real case picker (no
// longer silently includes every project case) and suites gained a "Run
// suite" quick action. Both share one seeding mechanism — see design.md.

async function createSuiteWithOneCase(page: Page, projectLabel: string, suiteName: string, caseTitle: string): Promise<string> {
  await createProject(page, projectLabel)
  await openFolderExplorer(page)
  await createCase(page, caseTitle)
  await expect(page.getByText(caseTitle)).toBeVisible()
  const projectId = new URL(page.url()).pathname.split('/')[2]

  await page.goBack()
  await page.getByRole('button', { name: 'Go to Suites' }).click()
  await page.getByRole('button', { name: /new suite/i }).click()
  await page.getByLabel(/suite name/i).fill(suiteName)
  await page.getByRole('button', { name: /^create$/i }).click()
  await expect(page.getByRole('heading', { name: suiteName })).toBeVisible()
  await page.getByRole('checkbox', { name: caseTitle }).check()
  await page.getByRole('button', { name: /save changes/i }).click()
  // The checkbox being checked is true immediately (it's local state, set
  // before the click) — it does not prove the PUT actually completed. Wait
  // for the round trip: after a successful save, the button re-disables
  // itself once the reloaded suite's baseline matches the selection again.
  await expect(page.getByRole('button', { name: /save changes/i })).toBeDisabled()
  return projectId
}

test.describe('Requirement: Run creation', () => {
  test('Scenario: Opening the Runs page shows the runs list first', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-70' })
    const projectId = await createSuiteWithOneCase(page, 'Runs List Project', 'Smoke', 'Login works')

    await page.goto(`/projects/${projectId}/runs`)
    const newRunLink = page.getByRole('link', { name: /\+ new run/i }).first()
    await expect(newRunLink).toBeVisible()
    await expect(page.getByLabel(/^name$/i)).not.toBeVisible()

    await newRunLink.click()
    await expect(page).toHaveURL(/\/runs\/new$/)
    await expect(page.getByLabel(/^name$/i)).toBeVisible()
  })

  test('Scenario: Runs are grouped into Open and Closed sections', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-74' })
    const projectId = await createSuiteWithOneCase(page, 'Runs Grouping Project', 'Smoke', 'Login works')

    await page.goto(`/projects/${projectId}/runs/new`)
    await page.getByLabel(/^name$/i).fill('Open run')
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)
    await page.getByRole('button', { name: /^close run$/i }).click()
    await expect(page.getByText('closed', { exact: true })).toBeVisible()

    await page.goto(`/projects/${projectId}/runs`)
    await expect(page.getByText(/no open runs/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /open run/i })).toBeVisible()
  })

  test('Scenario: Creating a run navigates to it with a confirmation', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-71' })
    const projectId = await createSuiteWithOneCase(page, 'Run Created Banner Project', 'Smoke', 'Login works')

    await page.goto(`/projects/${projectId}/runs/new`)
    await page.getByLabel(/^name$/i).fill('Smoke run')
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: /create run/i }).click()

    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)
    await expect(page.getByText(/run created successfully/i)).toBeVisible()

    // One-shot: refreshing the same URL does not re-show the banner.
    await page.reload()
    await expect(page.getByText(/run created successfully/i)).not.toBeVisible()
  })

  test('Scenario: Selecting a suite in the New run form seeds the case selection', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-63' })
    const projectId = await createSuiteWithOneCase(page, 'Run Creation Project', 'Smoke', 'Login works')

    await page.goto(`/projects/${projectId}/runs/new`)
    await expect(page.getByRole('button', { name: /create run/i })).toBeDisabled()

    await page.getByLabel(/suite/i).selectOption({ label: 'Smoke (1 case)' })
    await expect(page.getByRole('checkbox', { name: 'Login works' })).toBeChecked()

    await page.getByLabel(/^name$/i).fill('Smoke run')
    await page.getByRole('button', { name: /create run/i }).click()
    // Creating a run now navigates straight to its own detail page.
    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)
    await expect(page.getByText('Smoke run').first()).toBeVisible()
  })
})

test.describe('Requirement: Suites index and detail page', () => {
  test('Scenario: Resizing the case picker\'s section tree', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-88' })
    await createSuiteWithOneCase(page, 'Suite Rail Resize Project', 'Regression', 'Checkout works')

    const rail = page.getByRole('tree', { name: 'Sections' }).locator('..')
    const handle = page.getByRole('separator', { name: /resize section tree/i })
    const before = await rail.evaluate((el) => el.getBoundingClientRect().width)

    await handle.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const widened = before + 32
    await expect(rail).toHaveJSProperty('offsetWidth', widened)

    await page.reload()
    await expect(page.getByRole('tree', { name: 'Sections' }).locator('..')).toHaveJSProperty('offsetWidth', widened)

    await page.getByRole('button', { name: /^hide$/i }).click()
    await expect(page.getByRole('separator', { name: /resize section tree/i })).not.toBeVisible()
  })

  test('Scenario: Running a suite from its detail page', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-64' })
    await createSuiteWithOneCase(page, 'Suite Quick Run Project', 'Regression', 'Checkout works')

    const sidebar = page.getByTestId('suite-sidebar')
    await expect(sidebar.getByText(/never run/i).first()).toBeVisible()
    await page.getByRole('button', { name: /^run suite$/i }).click()
    await expect(page.getByText(/1 case from regression/i)).toBeVisible()
    await page.getByRole('button', { name: /^create run$/i }).click()

    // Dialog closes before the properties refresh finishes (same ordering as
    // Rename/Delete elsewhere on this page) — both "Never run" rows (pass
    // rate, last run) go to 0 once the reload lands; toHaveCount tolerates
    // the multi-match locator without a strict-mode violation while it
    // settles, unlike a bare not.toBeVisible() on an ambiguous locator.
    await expect(page.getByRole('button', { name: /^create run$/i })).not.toBeVisible()
    await expect(sidebar.getByText(/never run/i)).toHaveCount(0, { timeout: 10000 })

    // rework-runs-list-ux: the quick-run action now leaves an inline
    // confirmation banner with a link to the new run instead of just
    // reloading silently.
    const viewRunLink = page.getByRole('link', { name: /view run/i })
    await expect(viewRunLink).toBeVisible()
    await viewRunLink.click()
    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)
  })

  test('Scenario: Customize selection hands off to the New run form pre-seeded', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-65' })
    await createSuiteWithOneCase(page, 'Suite Customize Run Project', 'Nightly', 'Deploy works')

    await page.getByRole('button', { name: /^run suite$/i }).click()
    const dialogName = page.getByLabel(/^name$/i)
    await dialogName.fill('Nightly custom run')
    await page.getByRole('button', { name: /customize selection/i }).click()

    await expect(page).toHaveURL(/\/runs\/new$/)
    await expect(page.getByLabel(/^name$/i)).toHaveValue('Nightly custom run')
    await expect(page.getByRole('checkbox', { name: 'Deploy works' })).toBeChecked()

    await page.getByRole('button', { name: /create run/i }).click()
    // Creating a run now navigates straight to its own detail page.
    await page.waitForURL(/\/runs\/(?!new$)[^/]+$/)
    await expect(page.getByText('Nightly custom run').first()).toBeVisible()
  })

  // add-suite-index-context-menu: the same Run suite/Rename/Delete actions
  // reachable via the detail page's Actions sidebar, now also reachable
  // directly from each card on the index — via the visible "⋯" trigger or a
  // right-click — without navigating into the suite first.
  test('Scenario: Renaming a suite from its index card menu', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-75' })
    // Deliberately avoids "Name" as a substring anywhere in the project
    // label — the Star button's aria-label ("Star {project label}") would
    // otherwise collide with page.getByLabel(/suite name/i)'s fuzzy match.
    const projectId = await createSuiteWithOneCase(page, 'Suite Card Actions Project', 'Smoke', 'Login works')
    await page.goto(`/projects/${projectId}/suites`)

    await page.getByRole('button', { name: /actions for smoke/i }).click()
    await page.getByRole('menuitem', { name: /rename/i }).click()
    await page.getByLabel(/suite name/i).fill('Smoke v2')
    await page.getByRole('button', { name: /^save$/i }).click()

    await expect(page.getByRole('menuitem', { name: /rename/i })).not.toBeVisible()
    await expect(page.getByText('Smoke v2')).toBeVisible()
  })

  test('Scenario: Deleting a suite via right-click on its index card', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-76' })
    const projectId = await createSuiteWithOneCase(page, 'Suite Index Delete Project', 'Nightly', 'Deploy works')
    await page.goto(`/projects/${projectId}/suites`)

    await page.getByText('Nightly').click({ button: 'right' })
    await page.getByRole('menuitem', { name: /^delete$/i }).click()
    await page.getByRole('button', { name: /confirm delete/i }).click()

    await expect(page.getByText(/no suites yet/i)).toBeVisible()
  })
})
