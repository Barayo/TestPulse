import { test, expect } from '@playwright/test'

// BDD E2E for add-first-run-setup, mapped to
// openspec/changes/add-first-run-setup/specs/authentication/spec.md
// scenarios.
//
// The shared compose stack (make e2e) always boots with a bootstrap admin
// already seeded (TESTPULSE_ADMIN_EMAIL/PASSWORD in
// deploy/compose/docker-compose.yml; global-setup.ts logs in as it before
// any spec runs) — every browser session in this suite is therefore always
// past the zero-users moment, and cannot reach the actual account-creation
// form through real navigation without wiping the shared database out from
// under every other parallel spec. The full "Creating the first admin
// account" / "Unavailable once any user exists" / "Concurrent setup
// attempts" scenarios are covered as real HTTP-to-Postgres integration
// tests instead: apps/api/internal/server/setup_api_test.go
// (TestScenario_SetupCreatesAdminAndLogsIn,
// TestScenario_SetupRejectedWhenUsersExist,
// TestScenario_SetupWeakPasswordRejected) and
// apps/api/internal/service/identity_test.go
// (TestSetupFirstAdminRaceOnlyOneSucceeds). What's left, and genuinely
// browser-only, is proving the routing/redirect wiring itself works
// end-to-end in the real bundled app, not just against mocked API
// responses (apps/web/src/pages/SetupPage.test.tsx already covers the
// form's own behavior with a mocked API).

test.describe('Requirement: First-run instance setup', () => {
  test('Scenario: Unavailable once any user exists (stale /setup visit redirects to /login)', async ({ page }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-86' })
    // No storageState here — a genuinely unauthenticated visit, the same
    // way anyone reaching /setup by URL/bookmark would.
    const context = await page.context().browser()!.newContext()
    const unauthed = await context.newPage()

    await unauthed.goto('/setup')
    await unauthed.waitForURL('/login')
    await expect(unauthed.getByLabel(/^email$/i)).toBeVisible()

    await context.close()
  })
})
