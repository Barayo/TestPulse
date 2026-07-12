import { test, expect } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the test-authoring capability, mapped to
// openspec/changes/add-core-domain/specs/test-authoring/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database.

test.describe('Requirement: Project management', () => {
  test('Scenario: Create a project', async ({ page }) => {
    const name = unique('QA Platform')
    await page.goto('/')
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('link', { name })).toBeVisible()
  })

  test('Scenario: Project name is required', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText(/name is required/i)).toBeVisible()
  })
})

test.describe('Requirement: Test case creation and immutable versioning', () => {
  test('Scenario: Create a test case, then edit it to create a new version', async ({ page }) => {
    const project = unique('Versioning Project')
    await page.goto('/')
    await page.getByLabel('Name').fill(project)
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByRole('link', { name: project }).click()

    // Create.
    await page.getByLabel('Title').fill('Login works')
    await page.getByRole('button', { name: 'Create case' }).click()
    await expect(page.getByText('Login works')).toBeVisible()
    await expect(page.getByText('v1', { exact: true })).toBeVisible()

    // Edit → new version (scenario: "Editing creates a new version").
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Edit title').fill('Login works v2')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Login works v2')).toBeVisible()
    await expect(page.getByText('v2', { exact: true })).toBeVisible()
  })
})

test.describe('Requirement: Test suite grouping', () => {
  test('Scenario: Add cases to a suite; removing one does not delete the case', async ({
    page,
  }) => {
    const project = unique('Suites Project')
    await page.goto('/')
    await page.getByLabel('Name').fill(project)
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByRole('link', { name: project }).click()

    await page.getByLabel('Title').fill('Case A')
    await page.getByRole('button', { name: 'Create case' }).click()
    await expect(page.getByText('Case A')).toBeVisible()

    await page.getByLabel(/suite name/i).fill('Smoke')
    await page.getByRole('button', { name: 'Create suite' }).click()
    await expect(page.getByText(/Smoke/)).toBeVisible()

    await page.getByLabel(/add case to smoke/i).selectOption({ label: 'Case A' })
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('(1 cases)')).toBeVisible()

    await page.getByRole('button', { name: /remove case a from smoke/i }).click()
    await expect(page.getByText('(0 cases)')).toBeVisible()
    // Case A still exists in the project's case list (also reappears as a
    // selectable option in the suite's "add case" dropdown, hence .first()).
    await expect(page.getByText('Case A').first()).toBeVisible()
  })
})

test.describe('Requirement: Project-level case folders', () => {
  test('Scenario: New project has a root folder; case defaults into it', async ({
    page,
    request,
  }) => {
    const project = unique('Folders Project')
    await page.goto('/')
    await page.getByLabel('Name').fill(project)
    await page.getByRole('button', { name: 'Create' }).click()
    const link = page.getByRole('link', { name: project })
    const projectId = (await link.getAttribute('href'))!.split('/').pop()!
    await link.click()

    // Root (default) is already selectable before any folder is created.
    await expect(page.getByLabel('Folder', { exact: true })).toContainText('Root (default)')

    await page.getByLabel('Title').fill('Login works')
    await page.getByRole('button', { name: 'Create case' }).click()
    await expect(page.getByText('Login works')).toBeVisible()

    const folders = await (
      await request.get(`/api/v1/projects/${projectId}/folders`)
    ).json()
    const root = folders.find((f: { parentFolderId?: string }) => !f.parentFolderId)
    const cases = await (
      await request.get(`/api/v1/projects/${projectId}/cases`)
    ).json()
    expect(cases[0].folderId).toBe(root.id)
  })

  test('Scenario: Create a nested folder and place a case in it', async ({ page, request }) => {
    const project = unique('Nested Folders Project')
    await page.goto('/')
    await page.getByLabel('Name').fill(project)
    await page.getByRole('button', { name: 'Create' }).click()
    const link = page.getByRole('link', { name: project })
    const projectId = (await link.getAttribute('href'))!.split('/').pop()!
    await link.click()

    await page.getByLabel('New folder name').fill('Auth')
    await page.getByRole('button', { name: 'Create folder' }).click()
    await expect(page.getByLabel('Folder', { exact: true })).toContainText('Auth')

    await page.getByLabel('Title').fill('Login works')
    await page.getByLabel('Folder', { exact: true }).selectOption({ label: 'Auth' })
    await page.getByRole('button', { name: 'Create case' }).click()
    await expect(page.getByText('Login works')).toBeVisible()

    const folders = await (
      await request.get(`/api/v1/projects/${projectId}/folders`)
    ).json()
    const auth = folders.find((f: { name: string }) => f.name === 'Auth')
    const cases = await (
      await request.get(`/api/v1/projects/${projectId}/cases`)
    ).json()
    expect(cases[0].folderId).toBe(auth.id)
  })

  test('Scenario: Folder name is required', async ({ page }) => {
    const project = unique('Folder Validation Project')
    await page.goto('/')
    await page.getByLabel('Name').fill(project)
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByRole('link', { name: project }).click()

    await page.getByRole('button', { name: 'Create folder' }).click()
    await expect(page.getByText(/folder name is required/i)).toBeVisible()
  })
})
