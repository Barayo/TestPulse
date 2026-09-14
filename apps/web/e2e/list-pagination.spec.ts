// BDD E2E for the list-pagination capability, mapped to
// openspec/changes/add-cursor-pagination/specs/list-pagination/spec.md.
// Most of that spec's scenarios (envelope shape, cursor semantics, limit
// clamping, ordering) are backend/API concerns already covered by Go API
// tests (apps/api/internal/server/*_test.go) — the scenarios genuinely
// requiring a real browser are the "Load more" UI behavior and the
// auto-drain-before-filtering/searching correctness property that behavior
// depends on, which is what this file covers.
// GIVEN: the compose stack is up (make e2e), with a fresh or accumulated
// database — see individual scenarios' comments for how each stays correct
// either way.

import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

async function createProject(page: Page, label: string): Promise<{ projectKey: string }> {
  const name = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByRole('menuitem', { name: /start from scratch/i }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.waitForURL(/\/projects\//)
  const projectKey = new URL(page.url()).pathname.split('/')[2]
  return { projectKey }
}

test.describe('Requirement: "Load more" reveals additional pages', () => {
  test('Scenario: Load more fetches and reveals a real second page of runs', async ({ page, request }) => {
    const { projectKey } = await createProject(page, 'Runs Pagination')
    // A brand-new project's runs are exclusively the ones this test creates
    // — no cross-test accumulation risk, so exactly 51 (one page of 50 plus
    // one) is a reliable way to guarantee a genuine second page exists.
    await Promise.all(
      Array.from({ length: 51 }, (_, i) =>
        request.post(`/api/v1/projects/${projectKey}/runs`, { data: { name: `Run ${String(i + 1).padStart(2, '0')}` } }),
      ),
    )

    await page.goto(`/projects/${projectKey}/runs`)
    const loadMoreButton = page.getByRole('button', { name: /load more runs/i })
    await expect(loadMoreButton).toBeVisible()

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes(`/api/v1/projects/${projectKey}/runs`) && res.url().includes('cursor='),
      ),
      loadMoreButton.click(),
    ])
    expect(response.ok()).toBe(true)
    const body: { items: unknown[]; nextCursor: string | null } = await response.json()
    expect(body.items.length).toBeGreaterThan(0)
    // Exactly one run (the 51st) remains after a 50-item first page, so this
    // click empties the cursor and the button must disappear — a project
    // scoped to this test alone, so there's no accumulation risk here.
    expect(body.nextCursor).toBeNull()
    await expect(loadMoreButton).toHaveCount(0)
  })

  test('Scenario: Load more fetches and reveals a real second page of run items', async ({ page, request }) => {
    const { projectKey } = await createProject(page, 'Run Items Pagination')
    const caseResponses = await Promise.all(
      Array.from({ length: 51 }, (_, i) =>
        request.post(`/api/v1/projects/${projectKey}/cases`, { data: { title: `Case ${String(i + 1).padStart(2, '0')}` } }),
      ),
    )
    const cases: { key: string }[] = await Promise.all(caseResponses.map((r) => r.json()))
    const runRes = await request.post(`/api/v1/projects/${projectKey}/runs`, {
      data: { name: unique('Big run'), caseKeys: cases.map((c) => c.key) },
    })
    const run: { key: string } = await runRes.json()

    await page.goto(`/runs/${run.key}`)
    // /^Select / alone would also match the header's "Select all" checkbox —
    // scope to row checkboxes specifically via the case-title prefix.
    const itemCheckboxes = page.getByRole('checkbox', { name: /^Select Case /i })
    await expect(itemCheckboxes).toHaveCount(50)

    const loadMoreButton = page.getByRole('button', { name: /load more items/i })
    await expect(loadMoreButton).toBeVisible()

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/v1/runs/${run.key}/items`) && res.url().includes('cursor=')),
      loadMoreButton.click(),
    ])
    expect(response.ok()).toBe(true)
    const body: { items: unknown[]; nextCursor: string | null } = await response.json()
    expect(body.nextCursor).toBeNull()
    await expect(itemCheckboxes).toHaveCount(51)
    await expect(loadMoreButton).toHaveCount(0)
  })
})

test.describe('Requirement: Filtering and searching drain remaining pages first, so a real match is never silently missed', () => {
  test('Scenario: Selecting a status filter surfaces a matching item that was on an unfetched page', async ({ page, request }) => {
    const { projectKey } = await createProject(page, 'Auto Drain Items')
    const caseResponses = await Promise.all(
      Array.from({ length: 51 }, (_, i) =>
        request.post(`/api/v1/projects/${projectKey}/cases`, { data: { title: `Drain Case ${String(i + 1).padStart(2, '0')}` } }),
      ),
    )
    const cases: { key: string }[] = await Promise.all(caseResponses.map((r) => r.json()))
    const runRes = await request.post(`/api/v1/projects/${projectKey}/runs`, {
      data: { name: unique('Drain Run'), caseKeys: cases.map((c) => c.key) },
    })
    const run: { key: string } = await runRes.json()

    // A large single fetch is safe here purely to locate the item to mark
    // failed — this run is brand-new and scoped to this test alone, so
    // "the last item in true insertion order" is unambiguous. Marking it
    // failed via the results API (not the UI) is ordinary cross-cutting
    // setup, same convention as addProjectMember elsewhere in this suite.
    const itemsRes = await request.get(`/api/v1/runs/${run.key}/items?limit=200`)
    const { items }: { items: { id: string; content: { title: string } }[] } = await itemsRes.json()
    const lastItem = items[items.length - 1]
    await request.post(`/api/v1/items/${lastItem.id}/results`, { data: { verdict: 'failed' } })

    // A fresh page load only fetches the default first page (50 items) — the
    // failed item, being last, is not among them.
    await page.goto(`/runs/${run.key}`)
    await expect(page.getByText('Case 01')).toBeVisible()
    await expect(page.getByText(lastItem.content.title)).not.toBeVisible()

    await page
      .getByRole('group', { name: /filter items by status/i })
      .getByRole('button', { name: /^failed/i })
      .click()

    // The filter must not silently miss a real match sitting on an
    // undrained page — this is the exact correctness property auto-drain
    // exists to protect, and the exact area where a real bug (duplicate
    // items from an unguarded overlapping drain) was found and fixed
    // earlier in this same change.
    await expect(page.getByText(lastItem.content.title)).toBeVisible()
  })

  test('Scenario: Searching surfaces a user that was on an unfetched page', async ({ page, request }) => {
    // /api/v1/users is a genuinely global, cross-test-accumulating resource
    // (E2E specs share one database with no reset between runs, and this
    // suite is re-run repeatedly over the project's life) — seed the
    // minimum needed rather than a large fixed batch. A big unconditional
    // batch here would itself become the thing repeatedly pushing this
    // shared table toward the drain's own intentional page-count ceiling
    // (fetchAllPages' security-driven cap) on some future run, and the
    // concurrent write volume was observed to cause real contention against
    // the single local compose Postgres instance other workers share.
    //
    // If a real second page already exists (true on any DB with meaningful
    // history), reuse an existing user from it — zero new users created.
    // Only on a small/fresh instance where everyone fits on page 1 do we
    // create the one user needed to guarantee a second page exists.
    const page1: { items: { email: string }[]; nextCursor: string | null } = await (
      await request.get('/api/v1/users')
    ).json()
    let targetEmail: string | undefined
    if (page1.nextCursor) {
      const page2: { items: { email: string }[] } = await (
        await request.get(`/api/v1/users?cursor=${encodeURIComponent(page1.nextCursor)}`)
      ).json()
      targetEmail = page2.items[0]?.email
    }
    if (!targetEmail) {
      targetEmail = `${unique('drainuser').replace(/\s+/g, '-').toLowerCase()}@example.com`
      await request.post('/api/v1/users', { data: { email: targetEmail, password: 'correcthorse' } })
    }

    await page.goto('/settings/people')
    await expect(page.getByText(targetEmail)).not.toBeVisible()

    await page.getByPlaceholder(/search by email/i).fill(targetEmail.split('@')[0])

    // Same correctness property as the run-items filter scenario above,
    // for the sibling drain implementation (PeoplePage.ensureAllUsersLoaded)
    // — a search must not silently miss a real match on an undrained page.
    await expect(page.getByText(targetEmail)).toBeVisible()
  })
})
