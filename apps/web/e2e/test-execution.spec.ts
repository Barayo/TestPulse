import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the test-execution capability, mapped to
// openspec/changes/add-core-domain/specs/test-execution/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database.
//
// Only the project/case setup helper changed for redesign-ui and
// redesign-case-creation-as-page (case creation is now its own dedicated
// page, not a drawer) — the run execution board itself (RunPage) kept its
// structure, so those interactions are unchanged.

async function createCase(page: Page, title: string) {
  await page.getByRole('link', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill(title)
  await page.getByRole('button', { name: /create test case/i }).click()
  // Creating a case now navigates to its own detail page
  // (redesign-case-creation-as-page) — unwind both pushed history entries
  // to return to the Library (goBack(), not goto(): goto() would push a
  // third entry instead of reusing the original one). The wait must
  // exclude /cases/new itself — /\/cases\// alone matches both the
  // create page and the new case's own page, so it would resolve
  // instantly against the still-current create-page URL instead of
  // waiting for the real post-creation navigation.
  await page.waitForURL(/\/cases\/(?!new)/)
  await page.goBack()
  await page.goBack()
  await expect(page.getByText(title)).toBeVisible()
}

async function createProjectWithCase(page: Page, label: string): Promise<string> {
  const projectName = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByLabel('Name').fill(projectName)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.waitForURL(/\/projects\//)
  const projectId = new URL(page.url()).pathname.split('/')[2]

  // A brand-new, genuinely empty project shows the "Get started" checklist
  // instead of the library panel (enrich-project-landing) — its first step
  // routes to the same /library destination, so either control works here.
  const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
  const getStarted = page.getByRole('button', { name: /add your first test case/i })
  await goToLibrary.or(getStarted).click()
  await createCase(page, 'Login works')
  return projectId
}

// rework-run-creation-ux: "Create run" is gated behind an explicit case
// selection via the picker — no longer implicitly includes every project case.
async function createRun(page: Page, name: string, caseTitles: string[]) {
  await page.getByLabel(/^name$/i).fill(name)
  for (const title of caseTitles) {
    await page.getByRole('checkbox', { name: title }).check()
  }
  await page.getByRole('button', { name: 'Create run' }).click()
}

// link-run-item-assignee-to-identity: assignment now targets a real project
// member, not free text — create the user and grant project membership via
// the API (mirrors project-rbac.spec.ts's loginAsNewUser/assignRole), since
// the scenarios here only need the person to exist and appear in the
// AssignDialog's picker, not to act as that user themselves.
async function addProjectMember(page: Page, projectId: string, label: string): Promise<{ userId: string; email: string }> {
  const email = `${unique(label).replace(/\s+/g, '-').toLowerCase()}@example.com`
  const created = await (await page.request.post('/api/v1/users', { data: { email, password: 'correcthorse' } })).json()
  const roles: { id: string; name: string }[] = await (await page.request.get('/api/v1/roles')).json()
  const roleId = roles.find((r) => r.name === 'Tester')?.id
  if (!roleId) throw new Error(`no seeded role named "Tester" found in ${JSON.stringify(roles)}`)
  const res = await page.request.put(`/api/v1/projects/${projectId}/members/${created.id}`, { data: { roleId } })
  expect(res.status()).toBe(204)
  return { userId: created.id, email }
}

test.describe('Requirement: Run creation pins case versions', () => {
  test('Scenario: Run pins versions at creation; board shows pinned content', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-49' })
    const projectId = await createProjectWithCase(page, 'Pinning Project')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Sprint 1', ['Login works'])
    await expect(page.getByText('Login works')).toBeVisible()
    // rework-run-detail-ux: a run created from an explicit case list (no
    // suite) reads as a deliberate ad hoc state, not a missing link.
    await expect(page.getByText(/ad hoc run/i)).toBeVisible()

    // Edit the case after the run exists — the run must keep showing v1.
    await page.goto(`/projects/${projectId}/library`)
    await page.getByText('Login works').click()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^title$/i).fill('Login works EDITED')
    await page.getByRole('button', { name: /save changes/i }).click()
    await page.getByRole('link', { name: /back to library/i }).click()

    await page.goto(`/projects/${projectId}/runs`)
    await page.getByRole('link', { name: 'Sprint 1' }).click()
    await page.getByText('Login works').first().click()
    await expect(page.getByText(/newer version of this case exists/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Login works' })).toBeVisible()
  })
})

test.describe('Requirement: Run execution board', () => {
  test('Scenario: Execute a case from the board (pass with comment)', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-50' })
    const projectId = await createProjectWithCase(page, 'Execution Project')
    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])

    // Selecting an item navigates to its own page (redesign-run-execution-view)
    // rather than opening an inline detail pane.
    await page.getByText('Login works').first().click()
    await expect(page).toHaveURL(/\/runs\/.+\/items\/.+/)
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByLabel(/comment/i).fill('works great')
    await page.getByRole('button', { name: /^pass$/i }).click()

    await expect(page.getByText('ana — works great')).toBeVisible()
  })

  test('Scenario: Run header links to its source suite', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-51' })
    const projectId = await createProjectWithCase(page, 'Suite Link Project')

    await page.goto(`/projects/${projectId}/suites`)
    await page.getByRole('button', { name: /new suite/i }).click()
    await page.getByLabel(/suite name/i).fill('Regression')
    await page.getByRole('button', { name: /^create$/i }).click()
    await expect(page.getByRole('heading', { name: 'Regression' })).toBeVisible()
    // Suite detail defaults to view mode (rework-suite-run-flow) — the
    // case-selection grid only renders once "Edit cases" is clicked.
    await page.getByRole('button', { name: /edit cases/i }).click()
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByRole('button', { name: /edit cases/i })).toBeVisible()

    await page.getByRole('button', { name: /^run suite$/i }).click()
    await page.getByRole('button', { name: /^create run$/i }).click()
    await expect(page.getByRole('button', { name: /^create run$/i })).not.toBeVisible()

    await page.goto(`/projects/${projectId}/runs`)
    await page.getByRole('link', { name: /regression run/i }).click()

    const suiteLink = page.getByRole('link', { name: /from suite: regression/i })
    await expect(suiteLink).toBeVisible()
    await suiteLink.click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/suites/`))
    await expect(page.getByRole('heading', { name: 'Regression' })).toBeVisible()
  })

  test('Scenario: Right-click a run item, jump straight to its case in the Library', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-52' })
    const projectId = await createProjectWithCase(page, 'Right-Click Project')
    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])

    const row = page.getByText('Login works').first().locator('xpath=ancestor::li')
    await row.click({ button: 'right' })
    await page.getByRole('menuitem', { name: /go to case in library/i }).click()

    await expect(page).toHaveURL(/\/projects\/.+\/cases\/.+/)
    await expect(page.getByRole('heading', { name: 'Login works' })).toBeVisible()
  })

  test('Scenario: Item page breadcrumb ends at the run, not the item\'s own title', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-53' })
    const projectId = await createProjectWithCase(page, 'Item Breadcrumb Project')
    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])
    await page.getByText('Login works').first().click()

    const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.getByText('Run 1')).toBeVisible()
    await expect(nav.getByText('Login works')).toHaveCount(0)
  })

  // add-run-keyboard-shortcuts
  test('Scenario: j/k moves the board\'s focus cursor and Enter opens the focused item', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-54' })
    const projectId = await createProjectWithCase(page, 'Keyboard List Project')
    await createCase(page, 'Second case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works', 'Second case'])
    // Wait for the run board itself (not the still-unmounting picker form,
    // which also renders these case titles as checkbox labels) before
    // sending keys — the switch only exists once RunPage has mounted.
    await expect(page.getByRole('switch', { name: /group by status/i })).toBeVisible()
    await expect(page.getByText('Login works')).toBeVisible()
    await expect(page.getByText('Second case')).toBeVisible()

    await page.keyboard.press('j')
    const focusedRow = page.locator('[data-focused="true"]')
    const focusedTitle = (await focusedRow.innerText()).split('\n')[0]

    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/runs\/.+\/items\/.+/)
    await expect(page.getByRole('heading', { name: focusedTitle })).toBeVisible()
  })
})

test.describe('Requirement: Run item detail page', () => {
  // add-run-keyboard-shortcuts
  test('Scenario: Recording a verdict via keyboard auto-advances to the next pending item', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-55' })
    const projectId = await createProjectWithCase(page, 'Keyboard Verdict Project')
    await createCase(page, 'Second case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works', 'Second case'])

    await page.getByText('Login works').first().click()
    await expect(page.getByRole('heading', { name: 'Login works' })).toBeVisible()

    await page.keyboard.press('f')

    await expect(page.getByRole('heading', { name: 'Second case' })).toBeVisible()
  })

  // unify-case-result-sidebar
  test('Scenario: Item page links to its test case', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-56' })
    const projectId = await createProjectWithCase(page, 'Case Link Project')
    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])

    await page.getByText('Login works').first().click()
    await expect(page.getByRole('heading', { name: 'Login works' })).toBeVisible()

    const sidebar = page.getByTestId('run-item-sidebar')
    const testCaseRow = sidebar.getByText('Test case', { exact: true }).locator('..')
    await testCaseRow.getByRole('link').click()

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/cases/`))
    await expect(page.getByRole('heading', { name: 'Login works' })).toBeVisible()
  })

  // unify-case-result-sidebar
  test('Scenario: Item page shows the case\'s cross-run Results', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-57' })
    const projectId = await createProjectWithCase(page, 'Cross Run Results Project')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /^pass$/i }).click()
    await expect(page.getByRole('list', { name: /result history/i }).getByText('pass')).toBeVisible()

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 2', ['Login works'])
    await page.getByText('Login works').first().click()
    await expect(page.getByRole('heading', { name: 'Login works' })).toBeVisible()

    const sidebar = page.getByTestId('run-item-sidebar')
    await expect(sidebar.getByText('Results', { exact: true })).toBeVisible()
    // Run 1's recorded pass plus Run 2's own (still-pending) item — the
    // cross-run panel includes every run item for the case, not only
    // executed ones, matching CaseDetailPage's own Results section.
    await expect(sidebar.getByTestId('case-result-bar')).toHaveCount(2)
  })
})

test.describe('Requirement: Run item status lifecycle', () => {
  test('Scenario: Marking retest after a failed verdict', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-58' })
    const projectId = await createProjectWithCase(page, 'Retest Project')
    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])

    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByRole('button', { name: /^failed$/i }).click()
    // Scoped to the History list — "failed" also appears in the header
    // and sidebar Properties status badges, which reflect the same
    // current status and would otherwise make this ambiguous.
    const history = page.getByRole('list', { name: /result history/i })
    await expect(history.getByText('failed')).toBeVisible()

    // Still on the item's own page — recording never navigates away.
    await page.getByRole('button', { name: /retest/i }).click()
    await page.getByRole('button', { name: /^pass$/i }).click()

    await expect(history.getByText('failed')).toBeVisible()
    await expect(history.getByText('pass')).toBeVisible()
  })
})

test.describe('Requirement: Run open/closed lifecycle', () => {
  test('Scenario: Closing a run blocks recording; reopening allows it again', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-59' })
    const projectId = await createProjectWithCase(page, 'Lifecycle Project')
    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])

    await expect(page.getByText(/^open$/i)).toBeVisible()
    await page.getByRole('button', { name: /close run/i }).click()
    await expect(page.getByText(/^closed$/i)).toBeVisible()

    await page.getByText('Login works').first().click()
    await expect(page.getByText(/this run is closed/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^pass$/i })).toHaveCount(0)

    // Close/Reopen live on the run page, not the item's own page.
    await page.getByRole('link', { name: /back to run 1/i }).click()
    await page.getByRole('button', { name: /reopen/i }).click()
    await expect(page.getByText(/^open$/i)).toBeVisible()

    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByRole('button', { name: /^pass$/i }).click()
    await expect(page.getByRole('list', { name: /result history/i }).getByText('pass')).toBeVisible()
  })
})

test.describe('Requirement: Run summary', () => {
  test('Scenario: Summary counts by status', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-60' })
    const projectId = await createProjectWithCase(page, 'Summary Project')
    await createCase(page, 'Second case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works', 'Second case'])

    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /record on behalf of someone else/i }).click()
    await page.getByLabel(/record on behalf of/i).fill('ana')
    await page.getByRole('button', { name: /^pass$/i }).click()

    await page.getByRole('link', { name: /back to run 1/i }).click()
    await expect(page.getByText(/pass · 2 items/i)).toBeVisible()
    const breakdown = page.getByRole('list', { name: /status breakdown/i })
    await expect(breakdown).toContainText('Pass1')
    await expect(breakdown).toContainText('Pending1')

    // rework-run-detail-ux: status filter chips and the grouping toggle.
    const filters = page.getByRole('group', { name: /filter items by status/i })
    await filters.getByRole('button', { name: /^pass/i }).click()
    await expect(page.getByText('Login works')).toBeVisible()
    await expect(page.getByText('Second case')).not.toBeVisible()
    await expect(page.getByText(/showing 1 of 2 items/i)).toBeVisible()

    await filters.getByRole('button', { name: /^all/i }).click()
    await expect(page.getByText('Second case')).toBeVisible()

    await page.getByRole('switch', { name: /group by status/i }).click()
    await expect(page.getByText('Pass · 1')).toBeVisible()
    await expect(page.getByText('Pending · 1')).toBeVisible()
  })
})

test.describe('Requirement: Run item assignment', () => {
  // add-run-item-assignment-ui, link-run-item-assignee-to-identity
  test('Scenario: Assign an item from the board, then filter by assignee and by Unassigned', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-61' })
    const projectId = await createProjectWithCase(page, 'Assignment Project')
    const ana = await addProjectMember(page, projectId, 'Ana')
    await createCase(page, 'Second case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works', 'Second case'])

    const row = page.getByText('Login works').first().locator('xpath=ancestor::li')
    await row.getByRole('button', { name: /actions for login works/i }).click()
    await page.getByRole('menuitem', { name: /assign to/i }).click()
    await page.getByRole('button', { name: ana.email }).click()
    await expect(row.getByText(ana.email)).toBeVisible()

    const assigneeFilters = page.getByRole('group', { name: /filter items by assignee/i })
    await assigneeFilters.getByRole('button', { name: ana.email }).click()
    await expect(page.getByText('Login works')).toBeVisible()
    await expect(page.getByText('Second case')).not.toBeVisible()

    await assigneeFilters.getByRole('button', { name: /unassigned/i }).click()
    await expect(page.getByText('Second case')).toBeVisible()
    await expect(page.getByText('Login works')).not.toBeVisible()
  })

  test('Scenario: Bulk-assigning two selected items in one action', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-62' })
    const projectId = await createProjectWithCase(page, 'Bulk Assign Project')
    const ana = await addProjectMember(page, projectId, 'Ana')
    await createCase(page, 'Second case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works', 'Second case'])

    await page.getByRole('checkbox', { name: /select login works/i }).check()
    await page.getByRole('checkbox', { name: /select second case/i }).check()
    await expect(page.getByText('2 selected')).toBeVisible()
    await page.getByRole('button', { name: /assign selected/i }).click()
    await page.getByRole('button', { name: ana.email }).click()

    const loginRow = page.getByText('Login works').first().locator('xpath=ancestor::li')
    const secondRow = page.getByText('Second case').first().locator('xpath=ancestor::li')
    await expect(loginRow.getByText(ana.email)).toBeVisible()
    await expect(secondRow.getByText(ana.email)).toBeVisible()
    await expect(page.getByText('2 selected')).not.toBeVisible()
  })

  test('Scenario: Bulk-recording a verdict for selected items on an open run', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-63' })
    const projectId = await createProjectWithCase(page, 'Bulk Verdict Project')
    await createCase(page, 'Second case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works', 'Second case'])

    await page.getByRole('checkbox', { name: /select login works/i }).check()
    await page.getByRole('checkbox', { name: /select second case/i }).check()
    await expect(page.getByText('2 selected')).toBeVisible()
    await page.getByRole('button', { name: 'Mark as' }).click()
    await page.getByRole('menuitem', { name: 'Failed' }).click()

    const loginRow = page.getByText('Login works').first().locator('xpath=ancestor::li')
    const secondRow = page.getByText('Second case').first().locator('xpath=ancestor::li')
    await expect(loginRow.getByText(/failed/i)).toBeVisible()
    await expect(secondRow.getByText(/failed/i)).toBeVisible()
    await expect(page.getByText('2 selected')).not.toBeVisible()
  })

  test('Scenario: Right-clicking a checked row shows the bulk menu instead of single-item actions', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-64' })
    const projectId = await createProjectWithCase(page, 'Right-Click Bulk Project')
    await createCase(page, 'Second case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works', 'Second case'])

    await page.getByRole('checkbox', { name: /select login works/i }).check()
    await page.getByRole('checkbox', { name: /select second case/i }).check()

    const loginRow = page.getByText('Login works').first().locator('xpath=ancestor::li')
    await loginRow.click({ button: 'right' })

    await expect(page.getByRole('menuitem', { name: 'Assign 2 selected…' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Pass' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /open execution/i })).not.toBeVisible()
    await expect(page.getByRole('menuitem', { name: /go to case in library/i })).not.toBeVisible()

    await page.getByRole('menuitem', { name: 'Failed' }).click()

    const secondRow = page.getByText('Second case').first().locator('xpath=ancestor::li')
    await expect(loginRow.getByText(/failed/i)).toBeVisible()
    await expect(secondRow.getByText(/failed/i)).toBeVisible()
  })

  test('Scenario: Right-clicking an unchecked row leaves an active selection untouched', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-65' })
    const projectId = await createProjectWithCase(page, 'Right-Click Unchecked Project')
    await createCase(page, 'Second case')
    await createCase(page, 'Third case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works', 'Second case', 'Third case'])

    await page.getByRole('checkbox', { name: /select login works/i }).check()
    await page.getByRole('checkbox', { name: /select second case/i }).check()
    await expect(page.getByText('2 selected')).toBeVisible()

    const thirdRow = page.getByText('Third case').first().locator('xpath=ancestor::li')
    await thirdRow.click({ button: 'right' })

    await expect(page.getByRole('menuitem', { name: /open execution/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /go to case in library/i })).toBeVisible()
    await expect(page.getByText('2 selected')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /select third case/i })).not.toBeChecked()
  })

  test('Scenario: Space selects the focused row and Shift+click extends the range (add-run-board-select-shortcuts)', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-66' })
    const projectId = await createProjectWithCase(page, 'Select Shortcuts Project')
    await createCase(page, 'Second case')
    await createCase(page, 'Third case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works', 'Second case', 'Third case'])
    // Wait for the run board itself (not the still-unmounting picker form,
    // which also renders these case titles as checkbox labels) before
    // sending keys — see the j/k scenario above for the same guard.
    await expect(page.getByRole('switch', { name: /group by status/i })).toBeVisible()
    await expect(page.getByText('Login works')).toBeVisible()

    await page.keyboard.press('j')
    await page.keyboard.press('Space')
    await expect(page.getByText('1 selected')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /select login works/i })).toBeChecked()

    await page.getByRole('checkbox', { name: /select third case/i }).click({ modifiers: ['Shift'] })
    await expect(page.getByText('3 selected')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /select second case/i })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: /select third case/i })).toBeChecked()

    await page.getByRole('button', { name: 'Mark as' }).click()
    await page.getByRole('menuitem', { name: 'Failed' }).click()

    const loginRow = page.getByText('Login works').first().locator('xpath=ancestor::li')
    const secondRow = page.getByText('Second case').first().locator('xpath=ancestor::li')
    const thirdRow = page.getByText('Third case').first().locator('xpath=ancestor::li')
    await expect(loginRow.getByText(/failed/i)).toBeVisible()
    await expect(secondRow.getByText(/failed/i)).toBeVisible()
    await expect(thirdRow.getByText(/failed/i)).toBeVisible()
  })

  test('Scenario: Creating a run with a default assignee pre-assigns every item', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-67' })
    const projectId = await createProjectWithCase(page, 'Default Assignee Project')
    const ana = await addProjectMember(page, projectId, 'Ana')
    await createCase(page, 'Second case')

    await page.goto(`/projects/${projectId}/runs/new`)
    await page.getByRole('button', { name: /default assignee/i }).click()
    await page.getByRole('button', { name: ana.email }).click()
    await createRun(page, 'Run 1', ['Login works', 'Second case'])

    const loginRow = page.getByText('Login works').first().locator('xpath=ancestor::li')
    const secondRow = page.getByText('Second case').first().locator('xpath=ancestor::li')
    await expect(loginRow.getByText(ana.email)).toBeVisible()
    await expect(secondRow.getByText(ana.email)).toBeVisible()
  })

  test('Scenario: Someone outside the project is not offered as an assignee', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-68' })
    const projectId = await createProjectWithCase(page, 'Non-Member Assignee Project')
    const ana = await addProjectMember(page, projectId, 'Ana')
    const outsiderEmail = `${unique('Outsider').replace(/\s+/g, '-').toLowerCase()}@example.com`
    await page.request.post('/api/v1/users', { data: { email: outsiderEmail, password: 'correcthorse' } })

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])

    const row = page.getByText('Login works').first().locator('xpath=ancestor::li')
    await row.getByRole('button', { name: /actions for login works/i }).click()
    await page.getByRole('menuitem', { name: /assign to/i }).click()

    await expect(page.getByRole('button', { name: ana.email })).toBeVisible()
    await expect(page.getByRole('button', { name: outsiderEmail })).not.toBeVisible()
  })
})

test.describe('Requirement: Project Reports page', () => {
  // add-project-reports-page
  test('Scenario: Reports page assembles all three sections', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-69' })
    const projectId = await createProjectWithCase(page, 'Reports Page Project')

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /^pass$/i }).click()
    await expect(page.getByRole('list', { name: /result history/i }).getByText('pass')).toBeVisible()

    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 2', ['Login works'])
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /^failed$/i }).click()
    await expect(page.getByRole('list', { name: /result history/i }).getByText('failed')).toBeVisible()

    await page.goto(`/projects/${projectId}/reports`)

    // Status breakdown: 1 pass, 1 failed across the project's two runs.
    // (Status breakdown's Card precedes Flaky cases' in DOM order, and the
    // flaky rate happens to also be 50% here — .first() disambiguates.)
    await expect(page.getByText('50%').first()).toBeVisible()

    // Flaky cases: the alternating pass/fail on the same case makes it
    // flaky (add-flaky-test-detection), linking through to its own page.
    const flakyList = page.getByRole('list', { name: /flaky cases/i })
    const flakyRow = flakyList.getByRole('link', { name: /login works/i })
    await expect(flakyRow).toBeVisible()
    await flakyRow.click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/cases/`))
    await expect(page.getByRole('heading', { name: 'Login works' })).toBeVisible()

    // Compare runs entry point.
    await page.goto(`/projects/${projectId}/reports`)
    await page.getByRole('button', { name: /compare runs/i }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/runs/compare`))
  })
})
