import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for introduce-release-test-plan, mapped to
// openspec/specs/release-management, openspec/specs/test-plans, and the
// test-execution/ui-navigation deltas archived with that change.
// GIVEN: the compose stack is up (make e2e), with a fresh database.

async function createProject(page: Page, label: string): Promise<string> {
  const name = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.waitForURL(/\/projects\//)
  return new URL(page.url()).pathname.split('/')[2]
}

async function createCase(page: Page, title: string) {
  await page.getByRole('link', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill(title)
  await page.getByRole('button', { name: /create test case/i }).click()
  await page.waitForURL(/\/cases\/(?!new)/)
  await page.goBack()
  await page.goBack()
}

// API setup for tests whose behavior under test is elsewhere (e.g. the run
// creation picker) — mirrors test-execution.spec.ts's addProjectMember
// helper, which does the same for RBAC setup unrelated to what's tested.
async function createReleaseAndPlan(page: Page, projectKey: string, releaseName: string, planName: string): Promise<{ releaseKey: string; planKey: string }> {
  const rel = await (await page.request.post(`/api/v1/projects/${projectKey}/releases`, { data: { name: releaseName } })).json()
  const plan = await (await page.request.post(`/api/v1/releases/${rel.key}/plans`, { data: { name: planName } })).json()
  return { releaseKey: rel.key, planKey: plan.key }
}

test.describe('Requirement: Release entity and lifecycle status', () => {
  test('Scenario: Creating a Release defaults to active status', async ({ page }) => {
    const projectKey = await createProject(page, 'Release Project')

    await page.goto(`/projects/${projectKey}/releases`)
    await page.getByRole('button', { name: /new release/i }).first().click()
    await page.getByLabel(/^name$/i).fill('2026.1')
    await page.getByRole('button', { name: /^create$/i }).click()

    await page.waitForURL(/\/releases\/.+/)
    await expect(page.getByRole('heading', { name: '2026.1' })).toBeVisible()
    await expect(page.getByText('Active').first()).toBeVisible()
  })
})

test.describe('Requirement: Test Plan entity scoped to a Release', () => {
  test('Scenario: A newly created Test Plan belongs to its Release', async ({ page }) => {
    const projectKey = await createProject(page, 'Test Plan Project')

    await page.goto(`/projects/${projectKey}/releases`)
    await page.getByRole('button', { name: /new release/i }).first().click()
    await page.getByLabel(/^name$/i).fill('2026.1')
    await page.getByRole('button', { name: /^create$/i }).click()
    await page.waitForURL(/\/releases\/.+/)

    await page.getByRole('button', { name: /new test plan/i }).first().click()
    await page.getByLabel(/^name$/i).fill('iOS')
    await page.getByRole('button', { name: /^create$/i }).click()

    await expect(page.getByText('iOS')).toBeVisible()
    await page.getByText('iOS').click()
    await expect(page.getByRole('heading', { name: 'iOS' })).toBeVisible()
    await expect(page.getByRole('link', { name: '2026.1' })).toBeVisible()
  })
})

test.describe('Requirement: Run creation pins case versions', () => {
  test('Scenario: A run may be scoped to a Test Plan at creation', async ({ page }) => {
    const projectKey = await createProject(page, 'Scoped Run Project')

    const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
    const getStarted = page.getByRole('button', { name: /add your first test case/i })
    await goToLibrary.or(getStarted).click()
    await createCase(page, 'Login works')

    const { planKey } = await createReleaseAndPlan(page, projectKey, '2026.1', 'iOS')

    await page.goto(`/projects/${projectKey}/runs/new`)
    await page.getByLabel(/^name$/i).fill('Sprint 1')
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByLabel(/test plan/i).selectOption({ label: 'iOS' })
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.waitForURL(/\/runs\/(?!new)/)
    const runKey = new URL(page.url()).pathname.split('/')[2]

    // Verify the scoping stuck end-to-end (UI picker → API), not just that
    // some run was created.
    const run = await (await page.request.get(`/api/v1/runs/${runKey}`)).json()
    expect(run.testPlanKey).toBe(planKey)

    const scopedRuns = await (await page.request.get(`/api/v1/plans/${planKey}/runs`)).json()
    expect(scopedRuns.map((r: { key: string }) => r.key)).toContain(runKey)
  })

  test('Scenario: A run created with no Test Plan has no Test Plan reference', async ({ page }) => {
    const projectKey = await createProject(page, 'Ad Hoc Run Project')

    const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
    const getStarted = page.getByRole('button', { name: /add your first test case/i })
    await goToLibrary.or(getStarted).click()
    await createCase(page, 'Login works')
    await createReleaseAndPlan(page, projectKey, '2026.1', 'iOS')

    await page.goto(`/projects/${projectKey}/runs/new`)
    await expect(page.getByLabel(/test plan/i)).toHaveValue('')
    await page.getByLabel(/^name$/i).fill('Ad hoc sprint')
    await page.getByRole('checkbox', { name: 'Login works' }).check()
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.waitForURL(/\/runs\/(?!new)/)
    const runKey = new URL(page.url()).pathname.split('/')[2]

    const run = await (await page.request.get(`/api/v1/runs/${runKey}`)).json()
    expect(run.testPlanKey ?? null).toBeNull()
  })
})

test.describe('Requirement: Releases are reachable from project navigation', () => {
  test('Scenario: A project with no Releases shows no Release navigation', async ({ page }) => {
    const projectKey = await createProject(page, 'No Release Project')

    await page.goto(`/projects/${projectKey}`)
    await expect(page.getByText('Releases', { exact: true })).not.toBeVisible()

    await page.goto(`/projects/${projectKey}/settings`)
    await expect(page.getByText('Releases', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /manage releases/i })).toBeVisible()
  })

  test('Scenario: A project with Releases exposes them in navigation', async ({ page }) => {
    const projectKey = await createProject(page, 'With Release Project')
    await createReleaseAndPlan(page, projectKey, '2026.1', 'iOS')
    // A project with zero cases/suites/runs shows the "Get started"
    // checklist instead of the panel grid (ProjectPage's isAllEmpty) — one
    // case is enough to reach the normal landing this scenario checks.
    await page.request.post(`/api/v1/projects/${projectKey}/cases`, { data: { title: 'Login works' } })

    await page.goto(`/projects/${projectKey}`)
    await expect(page.getByText('Releases', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /2026\.1/ }).click()
    await expect(page.getByRole('heading', { name: '2026.1' })).toBeVisible()
  })
})
