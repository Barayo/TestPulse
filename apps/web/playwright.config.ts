import { defineConfig } from '@playwright/test'

// E2E tests run against the compose stack (make e2e brings it up).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Uncapped concurrency (defaults to CPU count) overwhelms the single
  // compose-stack instance every test run shares — on an 11-core machine
  // that's 11 concurrent browsers hammering one API/DB container, and
  // request latency under that contention trips fixed timeouts (waitForURL,
  // the default 5s expect timeout), not any bug in the tests themselves:
  // every test that failed under full parallelism passed reliably alone.
  // 4 was verified stable across repeated full-suite runs. Applies to CI
  // too now (self-host-ci-runner) — CI runs on this same dev machine, not
  // a separate lower-core-count GitHub-hosted runner, so the two cases are
  // no longer different.
  workers: 4,
  forbidOnly: !!process.env.CI,
  // 2, not 1: even at workers: 4, rare contention on the one shared
  // compose-stack instance can still make a test fail two attempts in a
  // row (observed live) — a real fix means giving these fixtures
  // instance-unique data instead of shared literals like "Login works",
  // out of scope for the self-hosted-runner migration itself.
  retries: process.env.CI ? 2 : 0,
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
