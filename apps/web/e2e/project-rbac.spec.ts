import { test, expect, type Browser, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the authorization/project-membership capabilities, mapped to
// openspec/changes/add-project-rbac/specs/authorization/spec.md and
// specs/test-authoring/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.

async function createProjectWithCase(page: Page, label: string): Promise<{ projectId: string; caseKey: string }> {
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

  const cases = await (await page.request.get(`/api/v1/projects/${projectId}/cases`)).json()
  return { projectId, caseKey: cases[0].key }
}

// Creates a fresh non-admin user (as the admin `page`) and returns a new
// Page authenticated as that user — a real login through
// POST /api/v1/auth/login, not a testing bypass, mirroring global-setup.ts's
// own approach for the admin actor.
async function loginAsNewUser(adminPage: Page, browser: Browser, label: string): Promise<{ page: Page; userId: string }> {
  const email = `${unique(label).replace(/\s+/g, '-').toLowerCase()}@example.com`
  const password = 'correcthorse'
  const created = await (
    await adminPage.request.post('/api/v1/users', { data: { email, password } })
  ).json()

  const context = await browser.newContext()
  const page = await context.newPage()
  const loginResponse = await page.request.post('/api/v1/auth/login', { data: { email, password } })
  expect(loginResponse.ok()).toBe(true)
  return { page, userId: created.id }
}

// Roles are fully custom and instance-wide (design.md D10) — assignment is
// by roleId, not a name string, so look the seeded default up by name first,
// mirroring apps/api/internal/server/project_rbac_api_test.go's roleIDByName.
async function assignRole(adminPage: Page, projectId: string, userId: string, roleName: string) {
  const roles: { id: string; name: string }[] = await (await adminPage.request.get('/api/v1/roles')).json()
  const roleId = roles.find((r) => r.name === roleName)?.id
  if (!roleId) throw new Error(`no seeded role named "${roleName}" found in ${JSON.stringify(roles)}`)

  const res = await adminPage.request.put(`/api/v1/projects/${projectId}/members/${userId}`, { data: { roleId } })
  expect(res.status()).toBe(204)
}

test.describe('Requirement: Effective project role from membership and teams', () => {
  test('Scenario: User with no membership cannot see a project', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-16' })
    const { projectId } = await createProjectWithCase(page, 'RBAC No Membership')
    const { page: outsiderPage } = await loginAsNewUser(page, browser, 'Outsider')

    await outsiderPage.goto(`/projects/${projectId}`)
    await expect(outsiderPage.getByText('RBAC No Membership')).toHaveCount(0)

    const list = await (await outsiderPage.request.get('/api/v1/projects')).json()
    expect(list).toEqual([])
    await outsiderPage.close()
  })

  test('Scenario: Tester can read but cannot modify cases', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-17' })
    const { projectId, caseKey } = await createProjectWithCase(page, 'RBAC Tester')
    const { page: testerPage, userId } = await loginAsNewUser(page, browser, 'Tester User')
    await assignRole(page, projectId, userId, 'Tester')

    const readRes = await testerPage.request.get(`/api/v1/projects/${projectId}/cases`)
    expect(readRes.status()).toBe(200)

    const editRes = await testerPage.request.put(`/api/v1/cases/${caseKey}`, {
      data: { title: 'Login works (tester edit)', priority: 'medium' },
    })
    expect(editRes.status()).toBe(403)
    await testerPage.close()
  })

  test('Scenario: Contributor can edit but cannot delete a case', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-18' })
    const { projectId, caseKey } = await createProjectWithCase(page, 'RBAC Contributor')
    const { page: contributorPage, userId } = await loginAsNewUser(page, browser, 'Contributor User')
    await assignRole(page, projectId, userId, 'Contributor')

    const editRes = await contributorPage.request.put(`/api/v1/cases/${caseKey}`, {
      data: { title: 'Login works (contributor edit)', priority: 'medium' },
    })
    expect(editRes.status()).toBe(200)

    const deleteRes = await contributorPage.request.delete(`/api/v1/cases/${caseKey}`)
    expect(deleteRes.status()).toBe(403)
    await contributorPage.close()
  })

  test('Scenario: Project Admin can delete a case', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-19' })
    const { projectId, caseKey } = await createProjectWithCase(page, 'RBAC Project Admin')
    const { page: adminPage, userId } = await loginAsNewUser(page, browser, 'Project Admin User')
    await assignRole(page, projectId, userId, 'Project Admin')

    const deleteRes = await adminPage.request.delete(`/api/v1/cases/${caseKey}`)
    expect(deleteRes.status()).toBe(204)
    await adminPage.close()
  })
})
