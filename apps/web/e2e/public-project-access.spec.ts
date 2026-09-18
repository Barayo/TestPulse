import { test, expect, type Browser, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the public-project-access capability, mapped to
// openspec/changes/enable-public-project-access/specs/public-project-access/spec.md,
// openspec/changes/add-public-project-discovery/specs/public-project-access/spec.md
// (partially superseded), and
// openspec/changes/unify-authenticated-and-public-views/specs/public-project-access/spec.md
// scenarios.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.
//
// unify-authenticated-and-public-views retired the standalone /public and
// /public/{key} pages: anonymous visitors now read the same
// /projects/{key} page (and its suites/runs/library/case/run-item pages)
// authenticated members see, with write controls hidden rather than a
// separate implementation. The old URLs still work, as plain redirects.

// This whole file — not just the kill-switch block below — now mutates
// instance- and multiple-project-wide public-access state (discovery index
// tests need to control exactly how many projects are public at once).
// Serial execution avoids two problems at the shared database (support.ts):
// races between this file's own tests (playwright.config.ts's
// fullyParallel: true), and — since the database is never reset between
// local re-runs either — the discovery tests explicitly re-establish their
// own preconditions rather than assuming a pristine DB, but still need
// serial order so they aren't racing a sibling test's cleanup.
test.describe.configure({ mode: 'serial' })

async function createProject(
  page: Page,
  label: string,
): Promise<{ projectId: string; projectKey: string; projectName: string }> {
  const projectName = unique(label)
  await page.goto('/')
  await page.getByRole('button', { name: /new project/i }).click()
  await page.getByRole('menuitem', { name: /start from scratch/i }).click()
  await page.getByLabel('Name').fill(projectName)
  await page.getByRole('button', { name: /^create$/i }).click()
  await page.waitForURL(/\/projects\//)
  const projectId = new URL(page.url()).pathname.split('/')[2]
  const project = await (await page.request.get(`/api/v1/projects/${projectId}`)).json()
  return { projectId, projectKey: project.key, projectName }
}

// A fresh, unauthenticated browser context — no session cookie, mirroring
// project-rbac.spec.ts's loginAsNewUser but deliberately never logging in.
// Must explicitly override storageState: playwright.config.ts sets it
// globally (the admin session) as the default for every new context,
// including browser.newContext() — omitting this override silently gave
// every "anonymous" page the real admin cookie. That leak was invisible
// against the old standalone /public/{key} page (which never checked
// useAuth() at all), and only surfaced once the unified /projects/{key}
// page started branching on real session state.
async function anonymousPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  return context.newPage()
}

test.describe('Requirement: Per-project public read access', () => {
  test('Scenario: Project Admin enables public access and an anonymous visitor can read it, with no write controls', async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-20' })
    const { projectId, projectKey } = await createProject(page, 'Public Access')

    await page.goto(`/projects/${projectId}/settings`)
    await page.getByRole('switch', { name: /public access/i }).click()
    await expect(page.getByText(`/projects/${projectKey}`)).toBeVisible()

    const anon = await anonymousPage(browser)
    await anon.goto(`/projects/${projectKey}`)
    await expect(anon.getByText(/viewing this without an account/i)).toBeVisible()
    await expect(anon.getByText(projectKey)).toBeVisible()
    await expect(anon.getByRole('button', { name: /new run/i })).toHaveCount(0)
    await expect(anon.getByRole('button', { name: /create/i })).toHaveCount(0)
    await anon.close()
  })

  test('Scenario: Disabling public access immediately revokes anonymous reads', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-21' })
    const { projectId, projectKey } = await createProject(page, 'Public Access Revoke')

    await page.goto(`/projects/${projectId}/settings`)
    await page.getByRole('switch', { name: /public access/i }).click()
    await expect(page.getByText(`/projects/${projectKey}`)).toBeVisible()

    const anon = await anonymousPage(browser)
    await anon.goto(`/projects/${projectKey}`)
    await expect(anon.getByText(/viewing this without an account/i)).toBeVisible()

    await page.getByRole('switch', { name: /public access/i }).click()
    await anon.goto(`/projects/${projectKey}`)
    await expect(anon.getByText(/project not found/i)).toBeVisible()
    await anon.close()
  })

  test('Scenario: A non-public project is unreachable anonymously', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-22' })
    const { projectKey } = await createProject(page, 'Never Public')

    const anon = await anonymousPage(browser)
    await anon.goto(`/projects/${projectKey}`)
    await expect(anon.getByText(/project not found/i)).toBeVisible()
    await anon.close()
  })
})

// publicProjectsEnabled is a single, genuinely instance-wide row — unlike
// every other piece of E2E test data, it can't be namespaced per-test via
// unique() (support.ts). Safe under the file-wide serial mode configured
// above.
test.describe('Requirement: Instance-wide kill switch for public project access', () => {
  test('Scenario: Instance-wide switch overrides a project\'s own setting, and re-enabling restores it without touching the project flag', async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-23' })
    const { projectId, projectKey } = await createProject(page, 'Kill Switch')
    await page.goto(`/projects/${projectId}/settings`)
    await page.getByRole('switch', { name: /public access/i }).click()
    await expect(page.getByText(`/projects/${projectKey}`)).toBeVisible()

    const anon = await anonymousPage(browser)
    await anon.goto(`/projects/${projectKey}`)
    await expect(anon.getByText(/viewing this without an account/i)).toBeVisible()

    // Turn the instance-wide switch off.
    await page.goto('/settings/instance')
    const instanceSwitch = page.getByRole('switch', { name: /public project access, instance-wide/i })
    await expect(instanceSwitch).toBeChecked()
    await instanceSwitch.click()

    await anon.goto(`/projects/${projectKey}`)
    await expect(anon.getByText(/project not found/i)).toBeVisible()

    // Turn it back on — the project's own setting was never touched.
    await page.goto('/settings/instance')
    await page.getByRole('switch', { name: /public project access, instance-wide/i }).click()

    await anon.goto(`/projects/${projectKey}`)
    await expect(anon.getByText(/viewing this without an account/i)).toBeVisible()
    await anon.close()
  })
})

test.describe('Requirement: Anonymous visitors see the same pages as authenticated members, read-only', () => {
  test('Scenario: A private or nonexistent project shows the same not-found handling regardless of cause, with an option to log in', async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-24' })
    const { projectKey } = await createProject(page, 'Not Found Login Option')

    const anon = await anonymousPage(browser)
    await anon.goto(`/projects/${projectKey}`)
    await expect(anon.getByText(/project not found/i)).toBeVisible()
    // Scoped to <main>: the anonymous-viewer Layout header (task 1) always
    // carries its own "Log in" link too, so an unscoped lookup here is a
    // strict-mode violation with two matches — this asserts the not-found
    // state's own link (design.md D3), not the header's.
    const loginLink = anon.getByRole('main').getByRole('link', { name: /log in/i })
    await expect(loginLink).toBeVisible()
    await loginLink.click()
    await anon.waitForURL(/\/login$/)
    await anon.close()
  })

  test('Scenario: An old direct public-project link still works', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-25' })
    const { projectId, projectKey } = await createProject(page, 'Legacy Direct Link')
    await page.request.patch(`/api/v1/projects/${projectId}`, { data: { publicAccess: true } })

    const anon = await anonymousPage(browser)
    await anon.goto(`/public/${projectKey}`)
    await anon.waitForURL(`/projects/${projectKey}`)
    await expect(anon.getByText(/viewing this without an account/i)).toBeVisible()
    await anon.close()

    await page.request.patch(`/api/v1/projects/${projectId}`, { data: { publicAccess: false } })
  })

  test('Scenario: An old discovery-index link still works', async ({ browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-26' })
    const anon = await anonymousPage(browser)
    await anon.goto('/public')
    await anon.waitForURL('/')
    await anon.close()
  })
})

// Disables public access on every project GET /api/v1/public/projects
// currently reports — used to establish a known "exactly N public
// projects" precondition regardless of what earlier local re-runs (the
// shared database is never reset between them, support.ts) or earlier
// tests in this file left behind.
async function disableAllPublicProjects(page: Page) {
  const publicProjects: { key: string }[] = await (await page.request.get('/api/v1/public/projects')).json()
  for (const p of publicProjects) {
    await page.request.patch(`/api/v1/projects/${p.key}`, { data: { publicAccess: false } })
  }
}

test.describe('Requirement: Project list resolves to zero, one, or many public projects for anonymous visitors', () => {
  test('Scenario: Exactly one public project redirects directly', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-27' })
    await disableAllPublicProjects(page)
    const { projectId, projectKey } = await createProject(page, 'Only Public')
    await page.request.patch(`/api/v1/projects/${projectId}`, { data: { publicAccess: true } })

    const anon = await anonymousPage(browser)
    await anon.goto('/')
    await anon.waitForURL(new RegExp(`/projects/${projectKey}$`))
    await anon.close()

    // Restore: this test's project off, Sample Project back on (its
    // documented default — see docs/test-management.md).
    await page.request.patch(`/api/v1/projects/${projectId}`, { data: { publicAccess: false } })
    await page.request.patch('/api/v1/projects/SP', { data: { publicAccess: true } })
  })

  test('Scenario: Multiple public projects show a list', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-28' })
    await disableAllPublicProjects(page)
    const first = await createProject(page, 'Public List A')
    const second = await createProject(page, 'Public List B')
    await page.request.patch(`/api/v1/projects/${first.projectId}`, { data: { publicAccess: true } })
    await page.request.patch(`/api/v1/projects/${second.projectId}`, { data: { publicAccess: true } })

    const anon = await anonymousPage(browser)
    await anon.goto('/')
    // The card's accessible name is the project's display name (D6's
    // PublicHeader-derived card, matching ProjectsPage's own authenticated
    // cards) — the project key never appears in the link text.
    await expect(anon.getByRole('link', { name: first.projectName })).toBeVisible()
    await expect(anon.getByRole('link', { name: second.projectName })).toBeVisible()
    await anon.close()

    await page.request.patch(`/api/v1/projects/${first.projectId}`, { data: { publicAccess: false } })
    await page.request.patch(`/api/v1/projects/${second.projectId}`, { data: { publicAccess: false } })
    await page.request.patch('/api/v1/projects/SP', { data: { publicAccess: true } })
  })

  test('Scenario: No public projects shows an empty state', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-29' })
    await disableAllPublicProjects(page)

    const anon = await anonymousPage(browser)
    await anon.goto('/')
    await expect(anon.getByText(/no public projects/i)).toBeVisible()
    await anon.close()

    await page.request.patch('/api/v1/projects/SP', { data: { publicAccess: true } })
  })
})

test.describe('Requirement: Discovery entry point on the login page', () => {
  // Re-scoped by add-auth-split-screen-redesign (Pepe design review): the
  // login page previously had no way back to the public home at all, so
  // this link was relabeled "Back to home" and made unconditional instead
  // of gating it on publicProjectsEnabled — it's no longer purely a
  // "browse public projects" discovery affordance (hide it when there's
  // nothing to discover), it's now the login screen's only wayfinding
  // control (always let a visitor leave). The destination still degrades
  // gracefully when public access is off instance-wide: ProjectsPage.tsx
  // renders its own real empty state ("No public projects yet") rather
  // than erroring, so there's no dead end to protect against by hiding
  // the link.
  test('Scenario: A "Back to home" link is always shown, regardless of public access being enabled instance-wide', async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-30' })
    const anon = await anonymousPage(browser)
    await anon.goto('/login')
    await expect(anon.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')

    await page.goto('/settings/instance')
    const instanceSwitch = page.getByRole('switch', { name: /public project access, instance-wide/i })
    await expect(instanceSwitch).toBeChecked()
    await instanceSwitch.click()

    await anon.goto('/login')
    await expect(anon.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')

    // Restore — subsequent tests (and a normal single-tenant instance)
    // assume this switch defaults to on.
    await page.goto('/settings/instance')
    await page.getByRole('switch', { name: /public project access, instance-wide/i }).click()
    await anon.close()
  })
})

test.describe('Requirement: Logging in from a public project returns to it', () => {
  test('Scenario: Member returns to the project they were viewing', async ({ page, browser }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-31' })
    const { projectId, projectKey } = await createProject(page, 'Login Return')
    await page.request.patch(`/api/v1/projects/${projectId}`, { data: { publicAccess: true } })

    const anon = await anonymousPage(browser)
    await anon.goto(`/projects/${projectKey}`)
    await anon.getByRole('link', { name: /log in/i }).click()
    await anon.waitForURL(/\/login$/)
    await anon.getByLabel(/^email$/i).fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com')
    await anon.getByLabel(/password/i).fill(process.env.E2E_ADMIN_PASSWORD ?? 'correcthorsebatterystaple')
    await anon.getByRole('button', { name: /^log in$/i }).click()

    await anon.waitForURL(`/projects/${projectKey}`)
    await anon.close()

    await page.request.patch(`/api/v1/projects/${projectId}`, { data: { publicAccess: false } })
  })
})

// Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
// design.md D4) — a hard prerequisite for unwrapping these pages from
// RequireAuth: every write control on a project-content page must be
// gated on the caller's actual permission flag, not merely "is
// authenticated", since an anonymous visitor now reaches these same pages.
// Exhaustively covered at the unit level (SuitesPage/RunsPage/
// CaseDetailPage/RunItemDetailPage/RunPage/FolderExplorerPage/
// SuiteActionsMenu tests, tasks.md group 2) — this is a single
// real-browser proof that the retrofit holds together end-to-end for an
// authenticated-but-under-permissioned member, not a re-enumeration of
// every gated control.
test.describe('Requirement: Permission-gating retrofit hides write controls from an under-permissioned member', () => {
  test('Scenario: A member with a read-only role sees no write controls across the retrofitted pages', async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-32' })
    const { projectId, projectKey } = await createProject(page, 'Read Only Retrofit')

    // Seed a section, a case, a suite containing it, and a run — enough
    // content that every page under test has something to render besides
    // its own empty state.
    const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
    const getStarted = page.getByRole('button', { name: /add your first test case/i })
    await goToLibrary.or(getStarted).click()
    await page.getByRole('link', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Read-only retrofit case')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByText('Read-only retrofit case')).toBeVisible()

    const { items: cases }: { items: { key: string }[] } = await (
      await page.request.get(`/api/v1/projects/${projectId}/cases`)
    ).json()
    const suite = await (
      await page.request.post(`/api/v1/projects/${projectId}/suites`, { data: { name: unique('Retrofit Suite') } })
    ).json()
    await page.request.put(`/api/v1/suites/${suite.key}/cases/${cases[0].key}`)
    const run = await (
      await page.request.post(`/api/v1/projects/${projectId}/runs`, {
        data: { name: unique('Retrofit Run'), suiteKey: suite.key },
      })
    ).json()

    // A role with every write flag off — no seeded role (Tester/
    // Contributor/Project Admin) lacks all of suiteCreate/runCreate/
    // caseEdit/caseDelete/runRecordResult/suiteEditMembership/
    // manageProject simultaneously, so a dedicated custom role is created
    // (roles are fully custom and instance-wide, design.md D10 of
    // add-project-rbac).
    const roleName = unique('Read Only E2E')
    const role = await (
      await page.request.post('/api/v1/roles', {
        data: {
          name: roleName,
          canRead: true,
          canCaseCreate: false,
          canCaseEdit: false,
          canCaseDelete: false,
          canSectionCreate: false,
          canSectionDelete: false,
          canSuiteCreate: false,
          canSuiteEditMembership: false,
          canRunCreate: false,
          canRunRecordResult: false,
          canManageProject: false,
        },
      })
    ).json()

    const email = `${unique('readonly').replace(/\s+/g, '-').toLowerCase()}@example.com`
    const created = await (
      await page.request.post('/api/v1/users', { data: { email, password: 'correcthorse' } })
    ).json()
    await page.request.put(`/api/v1/projects/${projectId}/members/${created.id}`, { data: { roleId: role.id } })

    const context = await browser.newContext()
    const memberPage = await context.newPage()
    const loginRes = await memberPage.request.post('/api/v1/auth/login', { data: { email, password: 'correcthorse' } })
    expect(loginRes.ok()).toBe(true)

    // FolderExplorerPage (Library)
    await memberPage.goto(`/projects/${projectKey}/library`)
    await expect(memberPage.getByText('Read-only retrofit case')).toBeVisible()
    await expect(memberPage.getByRole('button', { name: '+ New section' })).toHaveCount(0)
    await expect(memberPage.getByRole('button', { name: '+ New test case' })).toHaveCount(0)

    // SuitesPage
    await memberPage.goto(`/projects/${projectKey}/suites`)
    await expect(memberPage.getByText(suite.name)).toBeVisible()
    await expect(memberPage.getByRole('button', { name: '+ New suite' })).toHaveCount(0)

    // SuiteDetailPage (SuiteActionsMenu, buttons variant)
    await memberPage.goto(`/projects/${projectKey}/suites/${suite.key}`)
    await expect(memberPage.getByRole('button', { name: 'Run suite' })).toHaveCount(0)
    await expect(memberPage.getByRole('button', { name: 'Rename' })).toHaveCount(0)
    await expect(memberPage.getByRole('button', { name: 'Delete' })).toHaveCount(0)

    // RunsPage
    await memberPage.goto(`/projects/${projectKey}/runs`)
    await expect(memberPage.getByRole('link', { name: /\+ new run/i })).toHaveCount(0)

    // RunPage — the row's own "Actions for …" menu stays present (it also
    // offers non-write items like "Open execution"); only the
    // runRecordResult-gated "Assign to…" entry inside it is missing.
    await memberPage.goto(`/runs/${run.key}`)
    await expect(memberPage.getByRole('button', { name: /close run/i })).toHaveCount(0)
    await memberPage.getByRole('button', { name: /^actions for/i }).click()
    await expect(memberPage.getByRole('menuitem', { name: 'Open execution' })).toBeVisible()
    await expect(memberPage.getByRole('menuitem', { name: 'Assign to…' })).toHaveCount(0)

    // CaseDetailPage
    await memberPage.goto(`/projects/${projectKey}/cases/${cases[0].key}`)
    await expect(memberPage.getByRole('button', { name: 'Edit' })).toHaveCount(0)

    await context.close()
  })
})

// design.md D11 (unify-authenticated-and-public-views, added after a
// post-implementation security review): GET /api/v1/projects/{projectKey}
// requires PermRead, so a signed-in user with no ProjectMembers row at all
// (not even a restrictive role — genuinely never added to the project) got
// 403 from the authenticated branch every dual-mode page used to take
// unconditionally whenever `user` was truthy — worse than an anonymous,
// logged-out visitor to the identical public URL. Unlike the
// permission-gating scenario above (a real member with an all-false
// role), this is a real login through POST /api/v1/auth/login for a user
// who is never assigned any project role.
test.describe('Requirement: A signed-in non-member reads a public project exactly like an anonymous visitor', () => {
  test('Scenario: A user with no membership on the project reads it read-only instead of hitting "not found"', async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-33' })
    const { projectId, projectKey } = await createProject(page, 'Non-Member Read')
    await page.request.patch(`/api/v1/projects/${projectId}`, { data: { publicAccess: true } })

    const goToLibrary = page.getByRole('button', { name: 'Go to Library' })
    const getStarted = page.getByRole('button', { name: /add your first test case/i })
    await goToLibrary.or(getStarted).click()
    await page.getByRole('link', { name: /new test case/i }).click()
    await page.getByLabel(/^title$/i).fill('Non-member read case')
    await page.getByRole('button', { name: /create test case/i }).click()
    await expect(page.getByText('Non-member read case')).toBeVisible()

    // A real user, never added as a member of this (or any) project.
    const email = `${unique('nonmember').replace(/\s+/g, '-').toLowerCase()}@example.com`
    await page.request.post('/api/v1/users', { data: { email, password: 'correcthorse' } })
    const context = await browser.newContext()
    const nonMemberPage = await context.newPage()
    const loginRes = await nonMemberPage.request.post('/api/v1/auth/login', { data: { email, password: 'correcthorse' } })
    expect(loginRes.ok()).toBe(true)

    await nonMemberPage.goto(`/projects/${projectKey}`)
    // Signed in — must not show the anonymous-viewer banner (that's for
    // visitors with no account at all) or a redundant "Log in" link.
    await expect(nonMemberPage.getByText(/viewing this without an account/i)).toHaveCount(0)
    await expect(nonMemberPage.getByText(projectKey)).toBeVisible()

    await nonMemberPage.goto(`/projects/${projectKey}/library`)
    await expect(nonMemberPage.getByText('Non-member read case')).toBeVisible()
    await expect(nonMemberPage.getByRole('link', { name: /new test case/i })).toHaveCount(0)

    await context.close()
    await page.request.patch(`/api/v1/projects/${projectId}`, { data: { publicAccess: false } })
  })
})
