import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import { discoverUrls } from './discover-urls.mjs'

// Local/manual Lighthouse baseline for the web app's four heaviest pages
// (add-web-performance-lighthouse, backlog #23). Not wired into CI — no
// pass/fail gate, just a documented baseline (see README.md). Runs
// `lighthouse`/`chrome-launcher` directly rather than `@lhci/cli` —
// design.md D1 found `@lhci/cli` pulls in ~17 new high/moderate `npm
// audit` findings from its own wrapper tooling (wizard, server-upload),
// none of which this suite uses.

const BASE_URL = process.env.TESTPULSE_BASE_URL || 'http://localhost:8080'
const NUMBER_OF_RUNS = 3 // median of 3 reduces single-run CPU-throttling noise (D2)

const RESULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.results')

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function runOnce(url, port) {
  const result = await lighthouse(
    url,
    { port, output: 'json', logLevel: 'silent' },
    undefined,
  )
  return result.lhr
}

async function runPage(name, url, port) {
  const lhrs = []
  for (let i = 0; i < NUMBER_OF_RUNS; i++) {
    lhrs.push(await runOnce(url, port))
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
  const urls = await discoverUrls(BASE_URL)
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
      results.push(await runPage(name, url, chrome.port))
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
