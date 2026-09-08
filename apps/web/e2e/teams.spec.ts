import { test, expect, type Browser, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for add-team-deletion-preview, mapped to
// openspec/changes/add-team-deletion-preview/specs/teams/spec.md scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.

async function createProjectId(page: Page, label: string): Promise<string> {
  const projectName = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByLabel('Name').fill(projectName)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.waitForURL(/\/projects\//)
  return new URL(page.url()).pathname.split('/')[2]
}

async function loginAsNewUser(adminPage: Page, browser: Browser, label: string): Promise<{ page: Page; userId: string }> {
  const email = `${unique(label).replace(/\s+/g, '-').toLowerCase()}@example.com`
  const password = 'correcthorse'
  const created = await (await adminPage.request.post('/api/v1/users', { data: { email, password } })).json()

  const context = await browser.newContext()
  const page = await context.newPage()
  const loginResponse = await page.request.post('/api/v1/auth/login', { data: { email, password } })
  expect(loginResponse.ok()).toBe(true)
  return { page, userId: created.id }
}

test.describe('Requirement: Team management', () => {
  test('Scenario: Tenant Admin views a team\'s deletion preview, then deletes it and access is revoked', async ({
    page,
    browser,
  }) => {
test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-40' })

    const projectId = await createProjectId(page, 'Team Delete Preview')
    const teamName = unique('QA Core E2E')
    const team = await (await page.request.post('/api/v1/teams', { data: { name: teamName } })).json()

    const { page: memberPage, userId } = await loginAsNewUser(page, browser, 'Team Delete Preview Member')
    await page.request.post(`/api/v1/teams/${team.id}/members/${userId}`)

    const { items: roles }: { items: { id: string; name: string }[] } = await (await page.request.get('/api/v1/roles')).json()
    const testerRoleId = roles.find((r) => r.name === 'Tester')?.id
    if (!testerRoleId) throw new Error(`no seeded role named "Tester" found in ${JSON.stringify(roles)}`)
    const assignRes = await page.request.put(`/api/v1/projects/${projectId}/teams/${team.id}`, {
      data: { roleId: testerRoleId },
    })
    expect(assignRes.status()).toBe(204)

    // The team's membership grants the member real access before deletion.
    const beforeList = await (await memberPage.request.get('/api/v1/projects')).json()
    expect(beforeList.some((p: { key: string }) => p.key === projectId)).toBe(true)

    // Teams (unlike Users) has no search box, so a newly-created team —
    // the newest, and therefore last-paginated-in, since the list is in
    // insertion order — has no auto-drain trigger. On a fresh/small
    // instance it lands on page 1 for free; on a long-lived shared
    // instance (e2e specs share one database with no reset between runs)
    // it may not. Click "Load more" (waiting on the real network response
    // each time, not a fixed sleep) until the button itself is gone — the
    // list is fully drained, and only then is the team guaranteed to have
    // rendered — rather than snapshot-checking visibility mid-drain, which
    // races React's render commit against the next loop iteration. Bounded
    // to 25 clicks, matching MAX_DRAIN_PAGES (the same ceiling the app's
    // own auto-drain uses elsewhere), so a genuine failure to ever finish
    // draining still fails fast instead of hanging.
    await page.goto('/settings/people')
    const teamsSection = page.locator('section').filter({ has: page.getByRole('heading', { name: /^teams/i }) })
    const loadMoreTeams = teamsSection.getByRole('button', { name: /^load more$/i })
    for (let clicks = 0; clicks < 25; clicks++) {
      // A short polling wait, not an instant snapshot: the button
      // disappears via a React re-render after the previous click's fetch
      // resolves, which doesn't necessarily land before this check runs.
      const stillHasMore = await expect(loadMoreTeams)
        .toBeVisible({ timeout: 1000 })
        .then(() => true)
        .catch(() => false)
      if (!stillHasMore) break
      await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/v1/teams') && res.url().includes('cursor=')),
        loadMoreTeams.click(),
      ])
    }
    await expect(page.getByText(teamName)).toBeVisible()
    await page.getByRole('button', { name: `Delete ${teamName}` }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/1 member/i)
    await expect(dialog).toContainText(/1 project/i)

    await dialog.getByRole('button', { name: /^delete team$/i }).click()
    await expect(page.getByText(teamName)).toHaveCount(0)

    // Access that depended solely on the now-deleted team's assignment is gone.
    const afterList = await (await memberPage.request.get('/api/v1/projects')).json()
    expect(afterList.some((p: { key: string }) => p.key === projectId)).toBe(false)

    await memberPage.close()
  })
})
