import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the run-result-attachments capability, mapped to
// openspec/changes/add-run-item-screenshot-attachments/specs/run-result-attachments/spec.md
// scenarios "Attaching directly to an existing result" and "Opening the
// full-size view".
// GIVEN: the compose stack is up (make e2e), with a fresh database.

async function createProjectWithCase(page: Page, label: string): Promise<string> {
  const projectName = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByLabel('Name').fill(projectName)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.waitForURL(/\/projects\//)
  const projectId = new URL(page.url()).pathname.split('/')[2]

  const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
  const getStarted = page.getByRole('button', { name: /add your first test case/i })
  await goToLibrary.or(getStarted).click()
  await page.getByRole('button', { name: /new test case/i }).click()
  await page.getByLabel(/^title$/i).fill('Login works')
  await page.getByRole('button', { name: /create test case/i }).click()
  await expect(page.getByText('Login works')).toBeVisible()
  return projectId
}

async function createRun(page: Page, name: string, caseTitles: string[]) {
  await page.getByLabel(/^name$/i).fill(name)
  for (const title of caseTitles) {
    await page.getByRole('checkbox', { name: title }).check()
  }
  await page.getByRole('button', { name: 'Create run' }).click()
}

test.describe('Requirement: Serving and deleting attachments', () => {
  test('Scenario: Attaching directly to an existing result, then opening the full-size view', async ({ page }) => {
    const projectId = await createProjectWithCase(page, 'Attachments Project')
    await page.goto(`/projects/${projectId}/runs/new`)
    await createRun(page, 'Run 1', ['Login works'])

    await page.getByText('Login works').first().click()
    await expect(page).toHaveURL(/\/runs\/.+\/items\/.+/)
    await page.getByLabel(/comment/i).fill('reset email never arrived')
    await page.getByRole('button', { name: /^failed$/i }).click()
    await expect(page.getByText(/reset email never arrived/i)).toBeVisible()

    // Attach directly to the just-recorded result via the History entry's
    // paperclip — the after-the-fact attach path.
    await page.getByRole('button', { name: /attach screenshot/i }).click()
    await page.locator('input[type="file"]').last().setInputFiles('e2e/fixtures/avatar-sample.jpg')

    const thumbnail = page.getByRole('button', { name: /open attachment/i })
    await expect(thumbnail).toBeVisible()

    // Opening the full-size view.
    await thumbnail.click()
    await expect(page.getByRole('button', { name: /^close$/i })).toBeVisible()
    await expect(page.getByText(/1 of 1/)).toBeVisible()
    await page.getByRole('button', { name: /^close$/i }).click()
    await expect(page.getByRole('button', { name: /^close$/i })).not.toBeVisible()
  })
})
