import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the test-execution capability, mapped to
// openspec/changes/add-core-domain/specs/test-execution/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database.
//
// Only the project/case setup helper changed for redesign-ui (case creation
// now happens in the folder explorer's drawer) — the run execution board
// itself (RunPage) kept its structure, so those interactions are unchanged.

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
  await page.getByRole('button', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill('Login works')
  await page.getByRole('button', { name: /create test case/i }).click()
  await expect(page.getByText('Login works')).toBeVisible()
  return projectId
}

test.describe('Requirement: Run creation pins case versions', () => {
  test('Scenario: Run pins versions at creation; board shows pinned content', async ({ page }) => {
    const projectId = await createProjectWithCase(page, 'Pinning Project')

    await page.goto(`/projects/${projectId}/runs`)
    await page.getByLabel(/^name$/i).fill('Sprint 1')
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.getByRole('link', { name: 'Sprint 1' }).click()
    await expect(page.getByText('Login works')).toBeVisible()

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
    await expect(page.getByTestId('item-detail').getByText('Login works')).toBeVisible()
  })
})

test.describe('Requirement: Run execution board', () => {
  test('Scenario: Execute a case from the board (pass with comment)', async ({ page }) => {
    const projectId = await createProjectWithCase(page, 'Execution Project')
    await page.goto(`/projects/${projectId}/runs`)
    await page.getByLabel(/^name$/i).fill('Run 1')
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.getByRole('link', { name: 'Run 1' }).click()

    await page.getByText('Login works').first().click()
    await page.getByLabel(/your name/i).fill('ana')
    await page.getByLabel(/comment/i).fill('works great')
    await page.getByRole('button', { name: /^pass$/i }).click()

    await expect(page.getByText('ana: pass — works great')).toBeVisible()
  })
})

test.describe('Requirement: Run item status lifecycle', () => {
  test('Scenario: Marking retest after a failed verdict', async ({ page }) => {
    const projectId = await createProjectWithCase(page, 'Retest Project')
    await page.goto(`/projects/${projectId}/runs`)
    await page.getByLabel(/^name$/i).fill('Run 1')
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.getByRole('link', { name: 'Run 1' }).click()

    await page.getByText('Login works').first().click()
    await page.getByLabel(/your name/i).fill('ana')
    await page.getByRole('button', { name: /^failed$/i }).click()
    // Scoped to the history line, not just "failed" — the "Failed" verdict
    // button's own label also matches that substring once it's present.
    await expect(page.getByTestId('item-detail').getByText('ana: failed')).toBeVisible()

    await page.getByText('Login works').first().click()
    await page.getByTestId('item-detail').getByRole('button', { name: /retest/i }).click()
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /^pass$/i }).click()

    await expect(page.getByText('ana: failed')).toBeVisible()
    await expect(page.getByText('ana: pass')).toBeVisible()
  })
})

test.describe('Requirement: Run summary', () => {
  test('Scenario: Summary counts by status', async ({ page }) => {
    const projectId = await createProjectWithCase(page, 'Summary Project')
    await page.getByRole('button', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Second case')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByText('Second case')).toBeVisible()

    await page.goto(`/projects/${projectId}/runs`)
    await page.getByLabel(/^name$/i).fill('Run 1')
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.getByRole('link', { name: 'Run 1' }).click()

    await page.getByText('Login works').first().click()
    await page.getByLabel(/your name/i).fill('ana')
    await page.getByRole('button', { name: /^pass$/i }).click()

    await expect(page.getByText(/2 items/)).toBeVisible()
    await expect(page.getByText(/1 pass/)).toBeVisible()
    await expect(page.getByText(/1 pending/)).toBeVisible()
  })
})
