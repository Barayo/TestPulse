// Resolves the four add-web-performance-lighthouse target page URLs from
// the running API (project/run keys aren't stable across reseeds —
// design.md D3), the same discovery-not-hardcoding approach
// apps/api/perf/summaries-and-run-items.js's setup() uses for its fixture.
//
// Uses the unauthenticated /api/v1/public/* route group (public_handlers.go),
// not the authenticated /api/v1/projects — this suite needs no session or
// token precisely because the Sample Project is public (design.md Context),
// and /api/v1/projects itself requires auth with no anonymous bypass.
export async function discoverUrls(baseUrl, fetchImpl = fetch) {
  const projectsRes = await fetchImpl(`${baseUrl}/api/v1/public/projects`)
  if (!projectsRes.ok) {
    throw new Error(`GET /api/v1/public/projects failed: ${projectsRes.status}`)
  }
  const projects = await projectsRes.json()
  const sample = projects.find((p) => p.isSample)
  if (!sample) {
    throw new Error(
      'No sample project found (isSample=true) — make sure the compose stack has ' +
        'started at least once so the Sample Project seeds. See apps/web/perf/README.md.',
    )
  }

  const runsRes = await fetchImpl(`${baseUrl}/api/v1/public/projects/${sample.key}/runs`)
  if (!runsRes.ok) {
    throw new Error(`GET /api/v1/public/projects/${sample.key}/runs failed: ${runsRes.status}`)
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
