import { test, expect } from '@playwright/test'

// BDD E2E for add-testrail-importer, mapped to
// openspec/changes/add-testrail-importer/specs/testrail-import/spec.md's
// "The web app offers importing a TestRail project as a project-creation
// entry point" requirement. add-qase-importer's, add-zephyr-scale-importer's,
// add-kiwi-tcms-importer's, and add-xray-importer's own scenarios (below)
// mirror the same coverage for their own equivalent requirements, reusing
// this file rather than forking sibling specs — all five connectors share
// the exact same entry-point/Connect-screen shape (Xray adds a Cloud/Server
// mode toggle on top of it, design.md D-X9).
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.
//
// A full crawl-and-import run against a live/mocked TestRail, Qase, Zephyr
// Scale, Kiwi TCMS, or Xray instance is out of scope here — no test double
// for any of these vendors exists in this repo's E2E suite. That's covered
// instead by tools/import-connector's own Go tests (internal/testrailclient /
// internal/qaseclient / internal/zephyrscaleclient / internal/kiwitcmsclient /
// internal/xrayclient, internal/importer, internal/poller) against fake
// HTTP servers. This file covers only what's reachable without a live
// connection: the entry point and each Connect screen's client-side
// validation.

test.describe('Requirement: The web app offers importing a TestRail project as a project-creation entry point', () => {
  test('Scenario: A user can reach the TestRail import flow from project creation', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-149' })

    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()

    const menu = page.getByRole('menu', { name: /new project/i })
    await expect(menu.getByRole('menuitem', { name: /start from scratch/i })).toBeVisible()
    const importItem = menu.getByRole('menuitem', { name: /import from testrail/i })
    await expect(importItem).toBeVisible()

    await importItem.click()
    await page.waitForURL(/\/projects\/import\/testrail/)
    await expect(page.getByRole('heading', { name: /import from testrail/i })).toBeVisible()
  })

  test('Scenario: The Connect screen requires every field before previewing an import', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-150' })

    await page.goto('/projects/import/testrail')
    const submit = page.getByRole('button', { name: /preview import/i })
    await expect(submit).toBeDisabled()

    await page.getByLabel('TestRail site URL').fill('https://acme.testrail.io')
    await expect(submit).toBeDisabled()
    await page.getByLabel('TestRail project ID').fill('7')
    await expect(submit).toBeDisabled()
    await page.getByLabel('TestRail account email').fill('qa-lead@acme.com')
    await expect(submit).toBeDisabled()
    await page.getByLabel('TestRail API key').fill('a-real-key')
    await expect(submit).toBeDisabled()

    // "New project" is the default target mode — the name field is the
    // last missing piece.
    await page.getByLabel('New project name').fill('QA Platform (E2E)')
    await expect(submit).toBeEnabled()
  })

  test('Scenario: The Connect screen discloses this is an unofficial, unaffiliated integration', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-151' })

    await page.goto('/projects/import/testrail')
    await expect(page.getByText(/not affiliated with.*idera/i)).toBeVisible()
  })
})

test.describe('Requirement: The web app offers importing a Qase project as a project-creation entry point', () => {
  test('Scenario: A user can reach the Qase import flow from project creation', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-152' })

    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()

    const menu = page.getByRole('menu', { name: /new project/i })
    await expect(menu.getByRole('menuitem', { name: /start from scratch/i })).toBeVisible()
    const importItem = menu.getByRole('menuitem', { name: /import from qase/i })
    await expect(importItem).toBeVisible()

    await importItem.click()
    await page.waitForURL(/\/projects\/import\/qase/)
    await expect(page.getByRole('heading', { name: /import from qase/i })).toBeVisible()
  })

  test('Scenario: The Connect screen requires every field before previewing an import', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-153' })

    await page.goto('/projects/import/qase')
    const submit = page.getByRole('button', { name: /preview import/i })
    await expect(submit).toBeDisabled()

    await page.getByLabel('Qase API token').fill('a-real-token')
    await expect(submit).toBeDisabled()
    await page.getByLabel('Qase project code').fill('PRJ')
    await expect(submit).toBeDisabled()

    // "New project" is the default target mode — the name field is the
    // last missing piece.
    await page.getByLabel('New project name').fill('QA Platform (E2E)')
    await expect(submit).toBeEnabled()
  })

  test('Scenario: The Connect screen discloses this is an unofficial, unaffiliated integration', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-154' })

    await page.goto('/projects/import/qase')
    await expect(page.getByText(/not affiliated with.*qase/i)).toBeVisible()
  })
})

test.describe('Requirement: The web app offers importing a Zephyr Scale project as a project-creation entry point', () => {
  test('Scenario: A user can reach the Zephyr Scale import flow from project creation', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-158' })

    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()

    const menu = page.getByRole('menu', { name: /new project/i })
    await expect(menu.getByRole('menuitem', { name: /start from scratch/i })).toBeVisible()
    const importItem = menu.getByRole('menuitem', { name: /import from zephyr scale/i })
    await expect(importItem).toBeVisible()

    await importItem.click()
    await page.waitForURL(/\/projects\/import\/zephyr-scale/)
    await expect(page.getByRole('heading', { name: /import from zephyr scale/i })).toBeVisible()
  })

  test('Scenario: The Connect screen requires every field before previewing an import', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-159' })

    await page.goto('/projects/import/zephyr-scale')
    const submit = page.getByRole('button', { name: /preview import/i })
    await expect(submit).toBeDisabled()

    await page.getByLabel('Zephyr Scale API token').fill('a-real-token')
    await expect(submit).toBeDisabled()
    await page.getByLabel('Zephyr Scale project key').fill('PROJ')
    await expect(submit).toBeDisabled()

    // "New project" is the default target mode — the name field is the
    // last missing piece.
    await page.getByLabel('New project name').fill('QA Platform (E2E)')
    await expect(submit).toBeEnabled()
  })

  test('Scenario: The Connect screen discloses this is an unofficial, unaffiliated integration', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-160' })

    await page.goto('/projects/import/zephyr-scale')
    await expect(page.getByText(/not affiliated with.*smartbear/i)).toBeVisible()
  })
})

test.describe('Requirement: The web app offers importing a Kiwi TCMS product as a project-creation entry point', () => {
  test('Scenario: A user can reach the Kiwi TCMS import flow from project creation', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-161' })

    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()

    const menu = page.getByRole('menu', { name: /new project/i })
    await expect(menu.getByRole('menuitem', { name: /start from scratch/i })).toBeVisible()
    const importItem = menu.getByRole('menuitem', { name: /import from kiwi tcms/i })
    await expect(importItem).toBeVisible()

    await importItem.click()
    await page.waitForURL(/\/projects\/import\/kiwi-tcms/)
    await expect(page.getByRole('heading', { name: /import from kiwi tcms/i })).toBeVisible()
  })

  test('Scenario: The Connect screen requires every field before previewing an import', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-162' })

    await page.goto('/projects/import/kiwi-tcms')
    const submit = page.getByRole('button', { name: /preview import/i })
    await expect(submit).toBeDisabled()

    await page.getByLabel('Kiwi TCMS site URL').fill('https://kiwi.example.com')
    await expect(submit).toBeDisabled()
    await page.getByLabel('Kiwi TCMS username').fill('admin')
    await expect(submit).toBeDisabled()
    await page.getByLabel('Kiwi TCMS password').fill('a-real-password')
    await expect(submit).toBeDisabled()
    await page.getByLabel('Kiwi TCMS product').fill('Acme')
    await expect(submit).toBeDisabled()

    // "New project" is the default target mode — the name field is the
    // last missing piece.
    await page.getByLabel('New project name').fill('QA Platform (E2E)')
    await expect(submit).toBeEnabled()
  })

  test('Scenario: The Connect screen discloses this is an unofficial, unaffiliated integration', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-163' })

    await page.goto('/projects/import/kiwi-tcms')
    await expect(page.getByText(/not affiliated with.*kiwi tcms/i)).toBeVisible()
  })
})

test.describe('Requirement: The web app offers importing an Xray project as a project-creation entry point', () => {
  test('Scenario: A user can reach the Xray import flow from project creation', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-164' })

    await page.goto('/')
    await page.getByRole('button', { name: /new project/i }).click()

    const menu = page.getByRole('menu', { name: /new project/i })
    await expect(menu.getByRole('menuitem', { name: /start from scratch/i })).toBeVisible()
    const importItem = menu.getByRole('menuitem', { name: /import from xray/i })
    await expect(importItem).toBeVisible()

    await importItem.click()
    await page.waitForURL(/\/projects\/import\/xray/)
    await expect(page.getByRole('heading', { name: /import from xray/i })).toBeVisible()
  })

  test('Scenario: The Connect screen defaults to Cloud mode, and switching to Server/Data Center swaps the credential fields', async ({
    page,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-165' })

    await page.goto('/projects/import/xray')
    await expect(page.getByRole('button', { name: /^cloud$/i })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Xray Client ID')).toBeVisible()
    await expect(page.getByLabel('Xray site URL')).not.toBeVisible()

    await page.getByRole('button', { name: /server.*data center/i }).click()
    await expect(page.getByLabel('Xray site URL')).toBeVisible()
    await expect(page.getByLabel('Xray Client ID')).not.toBeVisible()
  })

  test('Scenario: The Cloud Connect screen requires every field before previewing an import', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-166' })

    await page.goto('/projects/import/xray')
    const submit = page.getByRole('button', { name: /preview import/i })
    await expect(submit).toBeDisabled()

    await page.getByLabel('Xray Client ID').fill('cid-123')
    await expect(submit).toBeDisabled()
    await page.getByLabel('Xray Client Secret').fill('csecret-123')
    await expect(submit).toBeDisabled()
    await page.getByLabel('Xray project ID').fill('10000')
    await expect(submit).toBeDisabled()

    // "New project" is the default target mode — the name field is the
    // last missing piece.
    await page.getByLabel('New project name').fill('QA Platform (E2E)')
    await expect(submit).toBeEnabled()
  })

  test('Scenario: The Server/Data Center Connect screen requires every field before previewing an import', async ({
    page,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-167' })

    await page.goto('/projects/import/xray')
    await page.getByRole('button', { name: /server.*data center/i }).click()
    const submit = page.getByRole('button', { name: /preview import/i })
    await expect(submit).toBeDisabled()

    await page.getByLabel('Xray site URL').fill('https://jira.example.com')
    await expect(submit).toBeDisabled()
    await page.getByLabel('Xray Personal Access Token').fill('pat-123')
    await expect(submit).toBeDisabled()
    await page.getByLabel('Xray project key').fill('XRAY')
    await expect(submit).toBeDisabled()

    await page.getByLabel('New project name').fill('QA Platform (E2E)')
    await expect(submit).toBeEnabled()
  })

  test('Scenario: The Connect screen discloses this is an unofficial, unaffiliated integration', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-168' })

    await page.goto('/projects/import/xray')
    await expect(page.getByText(/not affiliated with.*xpand it/i)).toBeVisible()
  })
})
