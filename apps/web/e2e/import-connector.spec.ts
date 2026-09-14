import { test, expect } from '@playwright/test'

// BDD E2E for add-testrail-importer, mapped to
// openspec/changes/add-testrail-importer/specs/testrail-import/spec.md's
// "The web app offers importing a TestRail project as a project-creation
// entry point" requirement.
// GIVEN: the compose stack is up (make e2e), with a fresh database, and the
// default authenticated page (global-setup.ts) is the Tenant Admin.
//
// A full crawl-and-import run against a live/mocked TestRail instance is
// out of scope here — no TestRail test double exists in this repo's E2E
// suite. That's covered instead by tools/import-connector's own Go tests
// (internal/testrailclient, internal/importer, internal/poller) against a
// fake TestRail HTTP server. This file covers only what's reachable
// without a live TestRail connection: the entry point and the Connect
// screen's client-side validation.

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
