import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the step-level-results capability, mapped to
// openspec/changes/add-step-level-results/specs/step-level-results/spec.md
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

// Creates a case with the given steps and stays on its own detail page
// (mirrors reusable-steps.spec.ts's helper of the same shape).
async function createCaseWithSteps(page: Page, title: string, steps: string[]) {
  await page.getByRole('link', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill(title)
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) await page.getByRole('button', { name: /add step/i }).click()
    await page.getByLabel(new RegExp(`^Action for step ${i + 1}`, 'i')).fill(steps[i])
  }
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

test('Requirement: A step can be marked independently, carries forward across retests, and each result keeps its own snapshot', async ({ page }) => {
  const projectId = await createProject(page, 'Step Level Results Project')
  await openFolderExplorer(page)
  await createCaseWithSteps(page, 'Login flow', ['Navigate to login', 'Enter credentials', 'Submit form'])

  await page.goto(`/projects/${projectId}/runs/new`)
  await createRun(page, 'Sprint 1', ['Login flow'])
  await page.getByText('Login flow').first().click()
  await expect(page).toHaveURL(/\/runs\/.+\/items\/.+/)

  // 1. Mark step 1 pass and step 2 failed, independently of the overall
  // verdict — no overall verdict has been recorded yet.
  await page.getByRole('group', { name: /mark step 1 result/i }).getByRole('button', { name: /mark step 1 as pass/i }).click()
  await page.getByRole('group', { name: /mark step 2 result/i }).getByRole('button', { name: /mark step 2 as fail/i }).click()
  await expect(page.getByRole('group', { name: /mark step 1 result/i }).getByRole('button', { name: /mark step 1 as pass/i })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/pending/i).first()).toBeVisible()

  // 2. Record the overall verdict — the history entry's step-snapshot
  // summary reflects the 2 marked steps, 1 of them failed.
  await page.getByLabel(/comment/i).fill('password step is flaky')
  await page.getByRole('button', { name: /^failed$/i }).click()
  await expect(page.getByText('2/3 steps marked · 1 failed')).toBeVisible()

  // 3. Retest: only re-mark step 2 (now pass) — step 1's mark must carry
  // forward untouched, requiring no re-click.
  await page.getByRole('button', { name: /^retest$/i }).click()
  await page.getByRole('group', { name: /mark step 2 result/i }).getByRole('button', { name: /mark step 2 as pass/i }).click()
  await expect(page.getByRole('group', { name: /mark step 1 result/i }).getByRole('button', { name: /mark step 1 as pass/i })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: /^pass$/i }).click()
  await expect(page.getByText('2/3 steps marked', { exact: true })).toBeVisible()

  // 4. Both history entries keep their own independent, immutable
  // snapshot — expanding the first (older) entry still shows step 2 as
  // failed, not pass, even though the run item's live state has since
  // moved on.
  const firstSummary = page.getByText('2/3 steps marked · 1 failed')
  await firstSummary.click()
  const firstDetails = firstSummary.locator('xpath=ancestor::details')
  await expect(firstDetails.getByText('Step 2')).toBeVisible()
  await expect(firstDetails.getByText('failed', { exact: true })).toBeVisible()
})
