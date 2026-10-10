import http from 'k6/http'
import { check, fail } from 'k6'
import exec from 'k6/execution'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js'

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

// The dedicated CreateRun write-path scratch project (add-create-run-
// load-test, regression guard for #180) — deliberately not named
// "Perf Load NN", so it's excluded from PERF_PROJECT_PREFIX filtering
// above and doesn't affect EXPECTED_PROJECT_COUNT.
const WRITE_LOAD_PROJECT_NAME = 'Perf Write Load'

export const options = {
  scenarios: {
    summaries_heavy_mix: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
    // Fewer VUs than the read scenario — each iteration here is
    // strictly heavier (a ~500-case-key batched resolution plus a full
    // run-creation write, then a delete). Runs concurrently with
    // summaries_heavy_mix (k6's default — no startTime stagger), giving
    // this one 30s suite invocation a realistic mixed read+write load
    // (design.md D2).
    create_run_write: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      exec: 'createRunWrite',
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
    'http_req_duration{endpoint:create_run}': ['p(95)<5000'],
    'http_req_duration{endpoint:create_run_delete}': ['p(95)<5000'],
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
  // Exact match, not a floor (fix-web-perf-lighthouse-methodology D3) —
  // `make seed-perf` is now idempotent, so a correct re-run always
  // converges to exactly EXPECTED_PROJECT_COUNT; a mismatch either way
  // means the fixture drifted and should fail loudly, not silently pass.
  if (perfProjects.length !== EXPECTED_PROJECT_COUNT) {
    const hint =
      perfProjects.length < EXPECTED_PROJECT_COUNT
        ? 'Run `make seed-perf` against the compose stack before running the perf suite.'
        : 'More projects than expected were found — wipe the database (docker compose down -v) and re-seed for a clean fixture.'
    fail(
      `Expected exactly ${EXPECTED_PROJECT_COUNT} "${PERF_PROJECT_PREFIX}*" projects, ` +
        `found ${perfProjects.length}. ${hint} See README.md.`,
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

  // The CreateRun write scenario's fixture: find the scratch project and
  // walk its full case list once here (not timed) rather than
  // re-fetching it every iteration, which would otherwise time an
  // unrelated read endpoint inside what's meant to be a pure write-path
  // measurement (design.md D4).
  const writeLoadProject = allProjects.find((p) => p.name === WRITE_LOAD_PROJECT_NAME)
  if (!writeLoadProject) {
    fail(`Expected project "${WRITE_LOAD_PROJECT_NAME}" not found. Run \`make seed-perf\` to (re)seed the fixture.`)
  }
  const caseKeys = []
  let casesCursor = ''
  do {
    const url = casesCursor
      ? `${BASE_URL}/api/v1/projects/${writeLoadProject.key}/cases?limit=200&cursor=${encodeURIComponent(casesCursor)}`
      : `${BASE_URL}/api/v1/projects/${writeLoadProject.key}/cases?limit=200`
    const casesRes = http.get(url, authHeaders({ endpoint: 'setup' }))
    if (casesRes.status !== 200) {
      fail(`GET /api/v1/projects/${writeLoadProject.key}/cases failed during setup: ${casesRes.status} ${casesRes.body}`)
    }
    const body = casesRes.json()
    for (const c of body.items) {
      caseKeys.push(c.key)
    }
    casesCursor = body.nextCursor
  } while (casesCursor)
  if (caseKeys.length === 0) {
    fail(`Project "${WRITE_LOAD_PROJECT_NAME}" has no cases. Run \`make seed-perf\` to (re)seed the fixture.`)
  }

  return { pairs, writeLoadProjectKey: writeLoadProject.key, caseKeys }
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

// CreateRun write-path scenario (design.md D1-D3): every iteration
// creates a run from the full ~500-case-key "Perf Write Load" fixture —
// large enough that a reintroduced per-case-key round trip in
// CreateRun's case-key resolution (#180) would be visible in
// wall-clock terms — then deletes it immediately, so repeated suite
// invocations never leave runs behind. Create and delete are tagged
// separately: they have very different expected costs (a multi-row
// write + spec expansion vs. an FK-cascade delete), and blending them
// under one tag would make neither baseline number meaningful.
export function createRunWrite(data) {
  const runName = `Perf Write Load — VU${exec.vu.idInTest} iter${exec.vu.iterationInInstance}`
  const createRes = http.post(
    `${BASE_URL}/api/v1/projects/${data.writeLoadProjectKey}/runs`,
    JSON.stringify({ name: runName, caseKeys: data.caseKeys }),
    {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      tags: { endpoint: 'create_run' },
    },
  )
  const created = check(createRes, { 'create run status is 201': (r) => r.status === 201 })
  if (!created) {
    return
  }

  const runKey = createRes.json().key
  const deleteRes = http.del(`${BASE_URL}/api/v1/runs/${runKey}`, null, authHeaders({ endpoint: 'create_run_delete' }))
  check(deleteRes, { 'delete run status is 204': (r) => r.status === 204 })
}

// Returning a custom handleSummary() suppresses k6's own default
// terminal summary unless explicitly reconstructed — textSummary() does
// exactly that, preserving today's console output while also writing a
// machine-readable summary.json next to it, consumable by a future
// script or CI step without re-running the suite (improve-perf-suite-
// reporting D1). Not an npm dependency — a k6-bundler-resolved HTTP(S)
// import, cached by k6 after first fetch, the standard pattern for this.
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'apps/api/perf/.results/summary.json': JSON.stringify(data, null, 2),
  }
}
