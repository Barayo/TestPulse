import { test, expect } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the test-execution capability, mapped to
// openspec/changes/add-core-domain/specs/test-execution/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database.

async function createProjectWithCase(page: import('@playwright/test').Page, label: string) {
  const projectName = unique(label)
  await page.goto('/')
  await page.getByLabel('Name').fill(projectName)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('link', { name: projectName }).click()
  await page.getByLabel('Title').fill('Login works')
  await page.getByRole('button', { name: 'Create case' }).click()
  await expect(page.getByText('Login works')).toBeVisible()
}

test.describe('Requirement: Run creation pins case versions', () => {
  test('Scenario: Run pins versions at creation; board shows pinned content', async ({ page }) => {
    await createProjectWithCase(page, 'Pinning Project')

    await page.getByLabel(/^name$/i).fill('Sprint 1')
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.getByRole('link', { name: 'Sprint 1' }).click()
    await expect(page.getByText('Login works')).toBeVisible()

    // Edit the case after the run exists — the run must keep showing v1.
    await page.goBack()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Edit title').fill('Login works EDITED')
    await page.getByRole('button', { name: 'Save' }).click()

    await page.getByRole('link', { name: 'Sprint 1' }).click()
    await page.getByText('Login works').first().click()
    await expect(page.getByText(/newer version of this case exists/i)).toBeVisible()
    await expect(page.getByTestId('item-detail').getByText('Login works')).toBeVisible()
  })
})

test.describe('Requirement: Run execution board', () => {
  test('Scenario: Execute a case from the board (pass with comment)', async ({ page }) => {
    await createProjectWithCase(page, 'Execution Project')
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
    await createProjectWithCase(page, 'Retest Project')
    await page.getByLabel(/^name$/i).fill('Run 1')
    await page.getByRole('button', { name: 'Create run' }).click()
    await page.getByRole('link', { name: 'Run 1' }).click()

    await page.getByText('Login works').first().click()
    await page.getByLabel(/your name/i).fill('ana')
    await page.getByRole('button', { name: /^failed$/i }).click()
    await expect(page.getByTestId('item-detail').getByText('failed')).toBeVisible()

    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /retest/i }).click()
    await page.getByText('Login works').first().click()
    await page.getByRole('button', { name: /^pass$/i }).click()

    await expect(page.getByText('ana: failed')).toBeVisible()
    await expect(page.getByText('ana: pass')).toBeVisible()
  })
})

test.describe('Requirement: Run summary', () => {
  test('Scenario: Summary counts by status', async ({ page }) => {
    await createProjectWithCase(page, 'Summary Project')
    await page.getByLabel('Title').fill('Second case')
    await page.getByRole('button', { name: 'Create case' }).click()

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
