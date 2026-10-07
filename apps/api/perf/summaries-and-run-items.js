import http from 'k6/http'
import { check, fail } from 'k6'

// Baseline load test for the two API endpoints with real aggregation/
// pagination cost (backlog #22): GET /api/v1/projects/summaries and
// GET /api/v1/runs/{runKey}/items. See openspec/changes/add-api-
// performance-tests/design.md for the full rationale.
//
// Not wired into CI — no pass/fail gate on latency (see thresholds
// below). Run via `make perf-api`; see README.md for prerequisites.

const BASE_URL = __ENV.TESTPULSE_BASE_URL || 'http://localhost:8080'
const TOKEN = __ENV.TESTPULSE_PERF_TOKEN
const TARGET_PROJECT_NAME = __ENV.TESTPULSE_PERF_PROJECT_NAME || 'Banca Móvil'

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
  thresholds: {
    http_req_duration: ['p(95)<5000'],
  },
}

function authHeaders() {
  return { headers: { Authorization: `Bearer ${TOKEN}` } }
}

export function setup() {
  if (!TOKEN) {
    fail(
      'TESTPULSE_PERF_TOKEN is not set. Create a scoped API token at ' +
        '/settings/tokens and export it before running `make perf-api` ' +
        '— see apps/api/perf/README.md.',
    )
  }

  // ProjectSummary only carries `projectId` (internal UUID) — no name or
  // `key` — so discovery goes through the full project list instead.
  const projectsRes = http.get(`${BASE_URL}/api/v1/projects`, authHeaders())
  if (projectsRes.status !== 200) {
    fail(`GET /api/v1/projects failed during setup: ${projectsRes.status} ${projectsRes.body}`)
  }
  const projects = projectsRes.json()
  const project = projects.find((p) => p.name === TARGET_PROJECT_NAME)
  if (!project) {
    fail(
      `No project named "${TARGET_PROJECT_NAME}" found. Run \`make seed-demo\` ` +
        'against the compose stack before running the perf suite — see README.md.',
    )
  }

  const runsRes = http.get(`${BASE_URL}/api/v1/projects/${project.key}/runs`, authHeaders())
  if (runsRes.status !== 200) {
    fail(`GET /api/v1/projects/${project.key}/runs failed during setup: ${runsRes.status} ${runsRes.body}`)
  }
  const runs = runsRes.json().items
  if (!runs || runs.length === 0) {
    fail(`Project "${TARGET_PROJECT_NAME}" has no runs. Run \`make seed-demo\` to seed one.`)
  }

  return { projectKey: project.key, runKey: runs[0].key }
}

export default function (data) {
  // Weighted mix: summaries is the cheaper, more-frequent call in real
  // usage (the project list page loads it on every visit), so it gets
  // roughly 2x the calls of the run-items fetch within each iteration.
  const summariesRes = http.get(`${BASE_URL}/api/v1/projects/summaries`, authHeaders())
  check(summariesRes, { 'summaries status is 200': (r) => r.status === 200 })

  const summariesRes2 = http.get(`${BASE_URL}/api/v1/projects/summaries`, authHeaders())
  check(summariesRes2, { 'summaries status is 200 (2nd)': (r) => r.status === 200 })

  const itemsRes = http.get(`${BASE_URL}/api/v1/runs/${data.runKey}/items`, authHeaders())
  check(itemsRes, { 'run items status is 200': (r) => r.status === 200 })
}
