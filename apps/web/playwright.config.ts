import { defineConfig } from '@playwright/test'

// E2E tests run against the compose stack (make e2e brings it up).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // In CI, 'junit' feeds docs/importing-results.md's importer — case keys
  // are matched via test.info().annotations (see scripts/dogfood), which
  // only reach the report's <properties> with embedAnnotationsAsProperties.
  reporter: process.env.CI
    ? [['github'], ['junit', { outputFile: 'e2e-results.xml', embedAnnotationsAsProperties: true }]]
    : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'on-first-retry',
    // Every spec starts already authenticated (see global-setup.ts) —
    // exercises the real login endpoint once instead of per test.
    storageState: './e2e/.auth/admin.json',
  },
})
