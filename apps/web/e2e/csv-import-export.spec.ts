import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for add-csv-import-export, mapped to
// openspec/changes/add-csv-import-export/specs/csv-case-import-export/spec.md's
// import/export requirements. GIVEN: the compose stack is up (make e2e),
// with a fresh database. Unlike the vendor importers, there's no external
// system to fake here — the backend genuinely runs the whole CSV
// parse/import/export pipeline in this environment, so this suite covers
// the real round trip, not just the entry-point UI.

async function openFolderExplorer(page: Page) {
  const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
  const getStarted = page.getByRole('button', { name: /add your first test case/i })
  await goToLibrary.or(getStarted).click()
  await page.waitForURL(/\/library/)
}

test.describe('Requirement: A user with caseCreate permission can import cases from a CSV file into a target folder', () => {
  test('Scenario: A CSV with all valid rows imports every row', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-155' })

    const projectName = unique('CSV Import Project')
    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()
    await page.getByRole('menuitem', { name: /import from csv/i }).click()
    await page.waitForURL(/\/projects\/import\/csv/)

    await page
      .locator('input[type="file"]')
      .setInputFiles({
        name: 'cases.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('Title,Priority\nLogin works,high\nLogout works,medium\n'),
      })
    await page.getByLabel('New project name').fill(projectName)
    await page.getByRole('button', { name: /^import cases$/i }).click()

    await expect(page.getByText('Import complete')).toBeVisible()
    await expect(page.getByText('2', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: new RegExp(`open ${projectName}`, 'i') }).click()
    await openFolderExplorer(page)
    await expect(page.getByText('Login works')).toBeVisible()
    await expect(page.getByText('Logout works')).toBeVisible()
  })

  test('Scenario: An invalid row is skipped without aborting the rest of the file', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-156' })

    const projectName = unique('CSV Mixed Validity Project')
    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()
    await page.getByRole('menuitem', { name: /import from csv/i }).click()
    await page.waitForURL(/\/projects\/import\/csv/)

    await page.locator('input[type="file"]').setInputFiles({
      name: 'cases.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Title,Priority\nGood case,high\n,high\n'),
    })
    await page.getByLabel('New project name').fill(projectName)
    await page.getByRole('button', { name: /^import cases$/i }).click()

    await expect(page.getByText('Import complete')).toBeVisible()
    await expect(page.getByText(/1 row couldn.t be imported/i)).toBeVisible()
    await expect(page.getByText(/row 3/i)).toBeVisible()
  })
})

test.describe('Requirement: A user with read permission can export a project\'s or folder\'s cases to CSV', () => {
  test('Scenario: Exporting a folder downloads a CSV with the matching case count', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-157' })

    const projectName = unique('CSV Export Project')
    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()
    await page.getByRole('menuitem', { name: /import from csv/i }).click()
    await page.waitForURL(/\/projects\/import\/csv/)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'cases.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Title\nExport case one\nExport case two\nExport case three\n'),
    })
    await page.getByLabel('New project name').fill(projectName)
    await page.getByRole('button', { name: /^import cases$/i }).click()
    await page.getByRole('link', { name: new RegExp(`open ${projectName}`, 'i') }).click()
    await openFolderExplorer(page)
    await expect(page.getByText('Export case one')).toBeVisible()

    await page.getByRole('button', { name: /^export$/i }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /entire project/i }).click()
    const download = await downloadPromise
    const path = await download.path()
    const { readFileSync } = await import('node:fs')
    const csvText = readFileSync(path!, 'utf-8')
    const dataRows = csvText.trim().split('\n').slice(1)
    expect(dataRows).toHaveLength(3)
    expect(csvText).toContain('Export case one')
    expect(csvText).toContain('Export case two')
    expect(csvText).toContain('Export case three')
  })
})
