import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { discoverUrls } from './discover-urls.mjs'

// Local/manual Lighthouse baseline for the web app's four heaviest pages
// (add-web-performance-lighthouse, backlog #23). Not wired into CI — no
// pass/fail gate, just a documented baseline (see README.md). Runs
// `lighthouse`/`chrome-launcher` directly rather than `@lhci/cli` —
// design.md D1 found `@lhci/cli` pulls in ~17 new high/moderate `npm
// audit` findings from its own wrapper tooling (wizard, server-upload),
// none of which this suite uses.

const BASE_URL = process.env.TESTPULSE_BASE_URL || 'http://localhost:8080'
const ADMIN_EMAIL = process.env.TESTPULSE_ADMIN_EMAIL || 'admin@example.com'
const ADMIN_PASSWORD = process.env.TESTPULSE_ADMIN_PASSWORD || 'correcthorsebatterystaple'
const NUMBER_OF_RUNS = 3 // median of 3 reduces single-run CPU-throttling noise (D2)

const RESULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.results')

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// Logs in as the compose stack's fixed admin (deploy/compose/docker-
// compose.yml) and returns the session cookie — fixes the `/` → single-
// public-project redirect colliding two target pages into one
// (fix-web-perf-lighthouse-methodology D2). No setup beyond the compose
// stack being up: these credentials are already how cmd/seed-demo and
// cmd/seed-perf's own documented workflow authenticates.
async function login() {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!res.ok) {
    throw new Error(
      `Login failed: ${res.status}. Is the compose stack up with its default admin ` +
        'credentials (TESTPULSE_ADMIN_EMAIL/TESTPULSE_ADMIN_PASSWORD)? See README.md.',
    )
  }
  const [cookie] = res.headers.getSetCookie()
  return cookie.split(';')[0]
}

async function runOnce(url, port, cookie) {
  // Desktop, not Lighthouse's default mobile profile — TestPulse is a
  // desktop test-management tool (fix-web-perf-lighthouse-methodology D1).
  const result = await lighthouse(
    url,
    { port, output: 'json', logLevel: 'silent', extraHeaders: { Cookie: cookie } },
    desktopConfig,
  )
  return result.lhr
}

async function runPage(name, url, port, cookie) {
  const lhrs = []
  for (let i = 0; i < NUMBER_OF_RUNS; i++) {
    lhrs.push(await runOnce(url, port, cookie))
  }
  await mkdir(RESULTS_DIR, { recursive: true })
  await Promise.all(
    lhrs.map((lhr, i) =>
      writeFile(path.join(RESULTS_DIR, `${name}-${i}.json`), JSON.stringify(lhr, null, 2)),
    ),
  )

  const scores = (category) => lhrs.map((lhr) => lhr.categories[category].score * 100)
  const vitals = (audit) => lhrs.map((lhr) => lhr.audits[audit].numericValue)

  return {
    name,
    url,
    performance: median(scores('performance')),
    accessibility: median(scores('accessibility')),
    bestPractices: median(scores('best-practices')),
    lcp: median(vitals('largest-contentful-paint')),
    tbt: median(vitals('total-blocking-time')),
    cls: median(vitals('cumulative-layout-shift')),
  }
}

async function main() {
  const cookie = await login()
  const urls = await discoverUrls(BASE_URL, fetch, cookie)
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] })

  try {
    const pages = [
      ['projects', urls.projectsUrl],
      ['project', urls.projectUrl],
      ['library', urls.libraryUrl],
      ['run', urls.runUrl],
    ]

    const results = []
    for (const [name, url] of pages) {
      results.push(await runPage(name, url, chrome.port, cookie))
    }

    console.log('\nLighthouse baseline (median of %d runs per page):\n', NUMBER_OF_RUNS)
    for (const r of results) {
      console.log(`${r.name} (${r.url})`)
      console.log(
        `  performance=${r.performance} accessibility=${r.accessibility} best-practices=${r.bestPractices}`,
      )
      console.log(`  LCP=${Math.round(r.lcp)}ms TBT=${Math.round(r.tbt)}ms CLS=${r.cls.toFixed(3)}`)
    }
  } finally {
    await chrome.kill()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
