import http from 'k6/http'
import { check, fail } from 'k6'

// Baseline load test for the two API endpoints with real aggregation/
// pagination cost (backlog #22, methodology refined per #216): GET
// /api/v1/projects/summaries and GET /api/v1/runs/{runKey}/items. See
// openspec/changes/archive/*-add-api-performance-tests/design.md and
// *-improve-api-perf-test-methodology/design.md for the full rationale.
//
// Not wired into CI — no pass/fail gate on latency (see thresholds
// below). Run via `make perf-api`; see README.md for prerequisites,
// including `make seed-perf` (not `make seed-demo` — this suite needs a
// purpose-built, larger fixture; see design.md).

const BASE_URL = __ENV.TESTPULSE_BASE_URL || 'http://localhost:8080'
const TOKEN = __ENV.TESTPULSE_PERF_TOKEN

// Matches apps/api/cmd/seed-perf's project naming (`Perf Load 01`..`60`).
const PERF_PROJECT_PREFIX = 'Perf Load '
const EXPECTED_PROJECT_COUNT = 60
const RUN_PROJECT_COUNT = 10

export const options = {
  scenarios: {
    summaries_heavy_mix: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
  },
  // p99 isn't in k6's default summary stats — add it explicitly so the
  // baseline this suite captures actually includes the p95/p99 numbers
  // design.md commits to recording, not just p90/p95.
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  // Informational only — this suite establishes a baseline, not a gate
  // (design.md D4). No abortOnFail, no CI exit-code dependency on these.
  // The per-tag entries exist to make k6 print a per-endpoint breakdown
  // in its summary (design.md's "per-endpoint, not blended" baseline
  // requirement) — their thresholds are set high enough to never
  // realistically fail; `warmup`-tagged requests have no entry here
  // since they're deliberately excluded from the recorded baseline.
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    'http_req_duration{endpoint:summaries}': ['p(95)<5000'],
    'http_req_duration{endpoint:run_items}': ['p(95)<5000'],
  },
}

function authHeaders(extraTags) {
  return { headers: { Authorization: `Bearer ${TOKEN}` }, tags: extraTags }
}

export function setup() {
  if (!TOKEN) {
    fail(
      'TESTPULSE_PERF_TOKEN is not set. Create a scoped API token at ' +
        '/settings/tokens and export it before running `make perf-api` ' +
        '— see apps/api/perf/README.md.',
    )
  }

  const projectsRes = http.get(`${BASE_URL}/api/v1/projects`, authHeaders({ endpoint: 'setup' }))
  if (projectsRes.status !== 200) {
    fail(`GET /api/v1/projects failed during setup: ${projectsRes.status} ${projectsRes.body}`)
  }
  const allProjects = projectsRes.json()
  const perfProjects = allProjects.filter((p) => p.name.startsWith(PERF_PROJECT_PREFIX))
  if (perfProjects.length < EXPECTED_PROJECT_COUNT) {
    fail(
      `Expected at least ${EXPECTED_PROJECT_COUNT} "${PERF_PROJECT_PREFIX}*" projects, ` +
        `found ${perfProjects.length}. Run \`make seed-perf\` against the compose stack ` +
        'before running the perf suite — see README.md.',
    )
  }

  const pairs = []
  for (let i = 1; i <= RUN_PROJECT_COUNT; i++) {
    const name = `${PERF_PROJECT_PREFIX}${String(i).padStart(2, '0')}`
    const project = perfProjects.find((p) => p.name === name)
    if (!project) {
      fail(`Expected project "${name}" not found. Run \`make seed-perf\` to (re)seed the fixture.`)
    }
    const runsRes = http.get(`${BASE_URL}/api/v1/projects/${project.key}/runs`, authHeaders({ endpoint: 'setup' }))
    if (runsRes.status !== 200) {
      fail(`GET /api/v1/projects/${project.key}/runs failed during setup: ${runsRes.status} ${runsRes.body}`)
    }
    const runs = runsRes.json().items
    if (!runs || runs.length === 0) {
      fail(`Project "${name}" has no runs. Run \`make seed-perf\` to (re)seed the fixture.`)
    }
    pairs.push({ projectKey: project.key, runKey: runs[0].key })
  }

  // Warm-up burst, tagged separately so it's excluded from the
  // summaries/run_items percentiles the baseline is captured from
  // (design.md D5) — first-connection/first-query-plan cold-start
  // effects land here, not in the measured scenario's stats.
  for (let i = 0; i < 3; i++) {
    http.get(`${BASE_URL}/api/v1/projects/summaries`, authHeaders({ endpoint: 'warmup' }))
  }
  for (let i = 0; i < 2; i++) {
    http.get(`${BASE_URL}/api/v1/runs/${pairs[0].runKey}/items`, authHeaders({ endpoint: 'warmup' }))
  }

  return { pairs }
}

export default function (data) {
  // Weighted mix: summaries is the cheaper, more-frequent call in real
  // usage (the project list page loads it on every visit), so it gets
  // roughly 2x the calls of the run-items fetch within each iteration.
  const summariesRes = http.get(`${BASE_URL}/api/v1/projects/summaries`, authHeaders({ endpoint: 'summaries' }))
  check(summariesRes, { 'summaries status is 200': (r) => r.status === 200 })

  const summariesRes2 = http.get(`${BASE_URL}/api/v1/projects/summaries`, authHeaders({ endpoint: 'summaries' }))
  check(summariesRes2, { 'summaries status is 200 (2nd)': (r) => r.status === 200 })

  // Pick a different {project, run} pair each iteration instead of
  // hammering one hot row for the whole run (design.md D3).
  const pair = data.pairs[Math.floor(Math.random() * data.pairs.length)]

  // Walk the full cursor chain — against the 120-item "Perf Load 10" run
  // this is 3 requests at the default 50-item page size, actually
  // exercising the cursor-seek path instead of fetching page 1 only
  // (design.md D4).
  let cursor = ''
  let page = 0
  do {
    const url = cursor
      ? `${BASE_URL}/api/v1/runs/${pair.runKey}/items?cursor=${encodeURIComponent(cursor)}`
      : `${BASE_URL}/api/v1/runs/${pair.runKey}/items`
    const itemsRes = http.get(url, authHeaders({ endpoint: 'run_items' }))
    check(itemsRes, { 'run items status is 200': (r) => r.status === 200 })
    const body = itemsRes.json()
    cursor = body && body.nextCursor
    page++
  } while (cursor && page < 10) // safety cap, well above the 3 pages 120 items/50-limit produces
}
