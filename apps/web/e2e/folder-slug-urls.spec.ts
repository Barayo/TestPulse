import { test, expect, type Page } from '@playwright/test'
import { unique } from './support'

// BDD E2E for the folder-slug-urls capability, mapped to
// openspec/changes/add-folder-slug-urls/specs/folder-slug-urls/spec.md
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

// Creates a subsection inside whichever folder is currently open, via the
// content-pane "+ New section" control.
async function createSection(page: Page, name: string) {
  await page.getByRole('button', { name: /^\+ new section$/i }).click()
  await page.getByLabel('New section name').fill(name)
  await page.getByLabel('New section name').press('Enter')
}

test('Requirement: Folder URLs are slug-path based — navigate, move-redirect, not-found, and collision rejection', async ({ page }) => {
  const projectKey = await createProject(page, 'Folder Slug URLs Project')
  await openFolderExplorer(page)

  // 1. Build a nested structure: Authentication > Two-Factor.
  await createSection(page, 'Authentication')
  await page.getByRole('link', { name: 'Authentication' }).or(page.getByText('Authentication')).first().click()
  await page.waitForURL(/\/library\/authentication$/)
  await createSection(page, 'Two-Factor')
  await page.getByText('Two-Factor').first().click()
  await page.waitForURL(/\/library\/authentication\/two-factor$/)

  // 2. In-app navigation (clicking through the sidebar) built a real,
  // human-readable slug-path URL, not a UUID.
  expect(page.url()).toMatch(/\/library\/authentication\/two-factor$/)

  // 3. Loading that same slug-path URL directly (a fresh page load, not
  // in-app navigation) resolves to the same folder.
  await page.goto(`/projects/${projectKey}/library/authentication/two-factor`)
  const nav = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(nav.getByText('Two-Factor')).toBeVisible()
  await expect(nav.getByText('Authentication')).toBeVisible()

  // 4. Sibling-name collision on create is rejected, with a visible error,
  // and the create row stays open with the typed name intact.
  await page.goto(`/projects/${projectKey}/library/authentication`)
  await createSection(page, 'Two-Factor')
  await expect(page.getByText(/a section named "two-factor" already exists here/i)).toBeVisible()
  await expect(page.getByLabel('New section name')).toHaveValue('Two-Factor')
  await page.getByLabel('New section name').press('Escape')

  // 5. Create a second top-level section to move things into, then attempt
  // (and fail) to move "Two-Factor" into a parent with a colliding name.
  await page.goto(`/projects/${projectKey}/library`)
  await createSection(page, 'Security')
  await page.getByText('Security').first().click()
  await page.waitForURL(/\/library\/security$/)
  await createSection(page, 'Two-Factor')

  // "Two-Factor" is a row inside its parent "Authentication"'s listing —
  // its row-level "Actions"/"Move to…" menu lives there, not on its own page.
  await page.goto(`/projects/${projectKey}/library/authentication`)
  await page.getByRole('button', { name: /actions for two-factor/i }).click()
  await page.getByRole('menuitem', { name: /move to…/i }).click()
  await page.getByRole('dialog').getByText('Security', { exact: true }).click()
  await expect(page.getByText(/already exists here|still reserved/i)).toBeVisible()
  await page.keyboard.press('Escape')

  // 6. A real move succeeds: move "Authentication" (with its live child
  // "Two-Factor" still under it) to become a child of "Security" instead.
  // "Authentication" is a row inside root's own listing; a successful move
  // doesn't navigate anywhere by itself, it just updates that listing.
  await page.goto(`/projects/${projectKey}/library`)
  await page.getByRole('button', { name: /actions for authentication/i }).click()
  await page.getByRole('menuitem', { name: /move to…/i }).click()
  await page.getByRole('dialog').getByText('Security', { exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText('Authentication')).not.toBeVisible()

  await page.goto(`/projects/${projectKey}/library/security/authentication`)
  expect(page.url()).toMatch(/\/library\/security\/authentication$/)

  // 7. Loading the OLD (pre-move) bookmarked URL redirects once to the
  // folder's new location and shows a one-shot confirmation banner.
  await page.goto(`/projects/${projectKey}/library/authentication`)
  await expect(page.getByText(/section "authentication" moved — showing its current location/i)).toBeVisible()
  await page.waitForURL(/\/library\/security\/authentication$/)
  const navAfterRedirect = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(navAfterRedirect.getByText('Authentication')).toBeVisible()
  await expect(navAfterRedirect.getByText('Security')).toBeVisible()

  // 8. The nested child ("Two-Factor") is still reachable under the new
  // parent path — the move carried its whole live subtree along.
  await page.goto(`/projects/${projectKey}/library/security/authentication/two-factor`)
  const navChild = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(navChild.getByText('Two-Factor')).toBeVisible()

  // 9. A slug-path that matches nothing shows a real not-found state, not
  // a blank page.
  await page.goto(`/projects/${projectKey}/library/does-not-exist`)
  await expect(page.getByText(/section not found/i)).toBeVisible()
  await page.getByRole('link', { name: /go to library/i }).click()
  await page.waitForURL(new RegExp(`/projects/${projectKey}/library$`))

  // 10. Moving a folder back to a parent it previously occupied must
  // succeed — a real bug found via manual testing (not anticipated by any
  // unit test written ahead of time): the folder's own leftover previous-
  // identity stamp from the first move (root -> security) was incorrectly
  // treated as a reserved-slug conflict when moving it back to root.
  await page.goto(`/projects/${projectKey}/library/security`)
  await page.getByRole('button', { name: /actions for authentication/i }).click()
  await page.getByRole('menuitem', { name: /move to…/i }).click()
  await page.getByRole('dialog').getByText('Library', { exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText(/already exists here|still reserved/i)).not.toBeVisible()

  await page.goto(`/projects/${projectKey}/library/authentication`)
  await expect(page.getByText(/moved — showing its current location/i)).not.toBeVisible()
  const navMovedBack = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(navMovedBack.getByText('Authentication')).toBeVisible()
})
