import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the reusable-steps capability, mapped to
// openspec/changes/add-reusable-steps/specs/reusable-steps/spec.md
// scenarios. GIVEN: the compose stack is up (make e2e), with a fresh
// database.

async function createProject(page: Page, label: string): Promise<string> {
  const name = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByRole('menuitem', { name: /start from scratch/i }).click()
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
// (redesign-case-creation-as-page) — the caller decides whether to edit
// further or navigate away.
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

test('Requirement: Reusable step groups — extract, reference, edit, refresh, delete, detach', async ({ page }) => {
  const projectKey = await createProject(page, 'Reusable Steps Project')
  await openFolderExplorer(page)

  // 1. Author a case with the steps that will become the shared group,
  // plus a trailing step that stays the case's own.
  await createCaseWithSteps(page, 'Admin dashboard access', [
    'Navigate to /admin/login',
    'Enter admin credentials',
    'Open the dashboard',
  ])

  // 2. Extract the first two steps into a new shared group.
  await page.getByRole('button', { name: /^edit$/i }).click()
  await page.getByTestId('step-number-0').click()
  await page.getByTestId('step-number-1').click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: /extract as shared group/i }).click()
  await page.getByLabel(/group name/i).fill('Log in as admin')
  await page.getByRole('button', { name: /^create group$/i }).click()
  await expect(page.getByText('Log in as admin')).toBeVisible()
  await page.getByRole('button', { name: /save changes/i }).click()
  await expect(page.getByText('Log in as admin')).toBeVisible()

  // 3. Reference the same group from a second, brand-new case.
  await page.goto(`/projects/${projectKey}/library`)
  await page.getByRole('link', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill('Settings access')
  // Remove the format editor's default empty first step before inserting,
  // so the group block starts at position 1 rather than leaving a stray
  // untouched empty step ahead of it.
  await page.getByLabel(/remove step 1/i).click()
  await page.getByRole('button', { name: /insert shared group/i }).click()
  await page.getByRole('button', { name: 'Log in as admin', exact: false }).click()
  await expect(page.getByText('Navigate to /admin/login')).toBeVisible()
  await page.getByRole('button', { name: /add step/i }).click()
  await page.getByLabel(/^Action for step 3/i).fill('Open account settings')
  await page.getByRole('button', { name: /create test case/i }).click()
  await page.waitForURL(/\/cases\/(?!new)/)

  // 4. Edit the shared group's own content from the admin page — staged
  // locally, only sent on an explicit Save changes (add-reusable-steps
  // QA fix: this editor no longer saves on every keystroke).
  await page.goto(`/projects/${projectKey}/settings`)
  await page.getByText('Log in as admin').click()
  await page.getByLabel(/^Action for step 1/i).fill('Navigate to /admin/login (v2)')
  const groupSaved = page.waitForResponse((r) => r.url().includes('/api/v1/step-groups/') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /save changes/i }).click()
  await groupSaved

  // 5. The second case's editor now shows a staleness pill on that block.
  await page.goto(`/projects/${projectKey}/library`)
  await page.getByText('Settings access').click()
  await page.getByRole('button', { name: /^edit$/i }).click()
  await expect(page.getByText(/update available/i)).toBeVisible()

  // 6. Refresh pulls in the group's current content.
  await page.getByRole('button', { name: /refresh/i }).click()
  await expect(page.getByText('Navigate to /admin/login (v2)')).toBeVisible()
  await expect(page.getByText(/update available/i)).not.toBeVisible()
  await page.getByRole('button', { name: /save changes/i }).click()

  // 7. Deleting the group doesn't touch either already-saved case, but a
  // case still referencing it in a fresh edit shows the deleted state.
  await page.goto(`/projects/${projectKey}/settings`)
  await page.getByRole('button', { name: /delete log in as admin/i }).click()
  await page.getByRole('button', { name: /^delete group$/i }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText(/no shared step groups yet/i)).toBeVisible()

  await page.goto(`/projects/${projectKey}/library`)
  await page.getByText('Admin dashboard access').click()
  await page.getByRole('button', { name: /^edit$/i }).click()
  await expect(page.getByText(/source group deleted/i)).toBeVisible()
  await page.getByRole('button', { name: /detach/i }).click()
  await expect(page.getByText(/source group deleted/i)).not.toBeVisible()
  await expect(page.getByLabel(/^Action for step 1/i)).toHaveValue('Navigate to /admin/login')
})
