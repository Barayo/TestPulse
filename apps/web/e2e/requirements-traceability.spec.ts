import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for add-requirements-traceability, mapped to
// openspec/specs/requirements-traceability.
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

async function createCase(page: Page, projectKey: string, title: string): Promise<string> {
  const res = await page.request.post(`/api/v1/projects/${projectKey}/cases`, { data: { title } })
  const body = await res.json()
  return body.key as string
}

async function createReleaseAndPlan(page: Page, projectKey: string, releaseName: string, planName: string) {
  const rel = await (await page.request.post(`/api/v1/projects/${projectKey}/releases`, { data: { name: releaseName } })).json()
  const plan = await (await page.request.post(`/api/v1/releases/${rel.key}/plans`, { data: { name: planName } })).json()
  return { releaseKey: rel.key as string, planKey: plan.key as string }
}

async function runCaseToPass(page: Page, projectKey: string, planKey: string, caseKey: string) {
  const run = await (
    await page.request.post(`/api/v1/projects/${projectKey}/runs`, {
      data: { name: unique('run'), testPlanKey: planKey, caseKeys: [caseKey] },
    })
  ).json()
  const itemsPage = await (await page.request.get(`/api/v1/runs/${run.key}/items`)).json()
  await page.request.put(`/api/v1/items/${itemsPage.items[0].id}/status`, { data: { status: 'pass' } })
}

test.describe('Requirement: Requirement entity, flat and project-scoped', () => {
  test('Scenario: A newly created Requirement has a key', async ({ page }) => {
    const projectKey = await createProject(page, 'Requirements Project')

    await page.goto(`/projects/${projectKey}/settings`)
    await page.getByRole('link', { name: /manage requirements/i }).click()
    await page.waitForURL(/\/requirements$/)

    await page.getByRole('button', { name: /new requirement/i }).first().click()
    await page.getByLabel(/^name$/i).fill('Guest checkout')
    await page.getByRole('button', { name: /^create$/i }).click()

    await page.waitForURL(/\/requirements\/.+/)
    await expect(page.getByRole('heading', { name: 'Guest checkout' })).toBeVisible()
    await expect(page.getByText(/-REQ1$/)).toBeVisible()
  })
})

test.describe('Requirement: Release-scoped requirement coverage matrix', () => {
  test('Scenario: Coverage reflects unrun-then-passing linked cases, scoped to this Release only', async ({ page }) => {
    const projectKey = await createProject(page, 'Coverage Project')
    const caseAKey = await createCase(page, projectKey, 'Guest checkout works')
    const caseBKey = await createCase(page, projectKey, 'Saved-card checkout works')
    const { releaseKey, planKey } = await createReleaseAndPlan(page, projectKey, '2026.1', 'iOS')
    // A second release, unrelated to the coverage being checked, proves a
    // result recorded there does not bleed into the first release's
    // coverage (the spec's "a result from a different release does not
    // count" scenario).
    const other = await createReleaseAndPlan(page, projectKey, '2026.2', 'iOS')

    await page.goto(`/projects/${projectKey}/settings`)
    await page.getByRole('link', { name: /manage requirements/i }).click()
    await page.waitForURL(/\/requirements$/)
    await page.getByRole('button', { name: /new requirement/i }).first().click()
    await page.getByLabel(/^name$/i).fill('Guest checkout')
    await page.getByRole('button', { name: /^create$/i }).click()
    await page.waitForURL(/\/requirements\/.+/)

    await page.getByRole('button', { name: /edit cases/i }).click()
    await page.getByRole('checkbox', { name: 'Guest checkout works' }).check()
    await page.getByRole('checkbox', { name: 'Saved-card checkout works' }).check()
    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText('Guest checkout works')).toBeVisible()
    await expect(page.getByText('Saved-card checkout works')).toBeVisible()

    // Run and pass the first case under the OTHER release — must not count
    // toward the release under test.
    await runCaseToPass(page, projectKey, other.planKey, caseAKey)

    await page.goto(`/projects/${projectKey}/releases/${releaseKey}`)
    await expect(page.getByRole('link', { name: 'Guest checkout' })).toBeVisible()
    await expect(page.getByText('Not run')).toBeVisible()

    // Now run and pass the first case under the release actually being
    // checked — still notRun overall, since the second linked case hasn't
    // run under it yet (worst-case rollup).
    await runCaseToPass(page, projectKey, planKey, caseAKey)
    await page.reload()
    await expect(page.getByText('Not run')).toBeVisible()

    // Run and pass the second case under the same release too — every
    // linked case now has a passing result under this release's Test
    // Plans, so coverage flips to covered.
    await runCaseToPass(page, projectKey, planKey, caseBKey)
    await page.reload()
    await expect(page.getByText('Covered')).toBeVisible()
  })
})
