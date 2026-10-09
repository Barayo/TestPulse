// Resolves the four add-web-performance-lighthouse target page URLs from
// the running API (project/run keys aren't stable across reseeds —
// design.md D3), the same discovery-not-hardcoding approach
// apps/api/perf/summaries-and-run-items.js's setup() uses for its fixture.
//
// Uses the authenticated /api/v1/projects routes, not /api/v1/public/* —
// the suite now authenticates (fix-web-perf-lighthouse-methodology D2, to
// avoid the single-public-project redirect colliding two target pages),
// so there's no remaining reason to keep a separate unauthenticated
// discovery path. `cookie` is the session cookie from run.mjs's login().
export async function discoverUrls(baseUrl, fetchImpl = fetch, cookie) {
  const authHeaders = { headers: { Cookie: cookie } }

  const projectsRes = await fetchImpl(`${baseUrl}/api/v1/projects`, authHeaders)
  if (!projectsRes.ok) {
    throw new Error(`GET /api/v1/projects failed: ${projectsRes.status}`)
  }
  const projects = await projectsRes.json()
  const sample = projects.find((p) => p.isSample)
  if (!sample) {
    throw new Error(
      'No sample project found (isSample=true) — make sure the compose stack has ' +
        'started at least once so the Sample Project seeds. See apps/web/perf/README.md.',
    )
  }

  const runsRes = await fetchImpl(`${baseUrl}/api/v1/projects/${sample.key}/runs`, authHeaders)
  if (!runsRes.ok) {
    throw new Error(`GET /api/v1/projects/${sample.key}/runs failed: ${runsRes.status}`)
  }
  const runsBody = await runsRes.json()
  const run = runsBody.items[0]
  if (!run) {
    throw new Error(
      `Sample project "${sample.key}" has no runs — make sure the compose stack has ` +
        'started at least once so the Sample Project seeds its runs. See apps/web/perf/README.md.',
    )
  }

  return {
    projectsUrl: `${baseUrl}/`,
    projectUrl: `${baseUrl}/projects/${sample.key}`,
    libraryUrl: `${baseUrl}/projects/${sample.key}/library`,
    runUrl: `${baseUrl}/runs/${run.key}`,
  }
}
