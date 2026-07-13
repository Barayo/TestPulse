import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '@/lib/api'
import { useDataRevision } from '@/lib/DataRevision'

export type ProjectSummary = {
  id: string
  name: string
  suiteCount: number
  caseCount: number
  passRate: number | null
}

async function loadSummary(
  project: { id: string; name: string },
  signal: AbortSignal,
): Promise<ProjectSummary> {
  const [suitesRes, casesRes, runsRes] = await Promise.all([
    api.GET('/api/v1/projects/{projectId}/suites', { params: { path: { projectId: project.id } }, signal }),
    api.GET('/api/v1/projects/{projectId}/cases', { params: { path: { projectId: project.id } }, signal }),
    api.GET('/api/v1/projects/{projectId}/runs', { params: { path: { projectId: project.id } }, signal }),
  ])

  const runs = runsRes.data ?? []
  const latestRun = [...runs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]

  let passRate: number | null = null
  if (latestRun) {
    const { data: summary } = await api.GET('/api/v1/runs/{runId}/summary', {
      params: { path: { runId: latestRun.id } },
      signal,
    })
    if (summary && summary.total > 0) {
      const pass = summary.counts.pass ?? 0
      passRate = Math.round((pass / summary.total) * 100)
    }
  }

  return {
    id: project.id,
    name: project.name,
    suiteCount: suitesRes.data?.length ?? 0,
    caseCount: casesRes.data?.length ?? 0,
    passRate,
  }
}

// Caps how many projects' summaries are fetched at once — an unbounded
// Promise.all here means every project in the list fires 3-4 requests
// simultaneously, which saturates the browser's per-origin connection limit
// and starves whatever page the user navigates to next (issue: empty
// landing panels after clicking a project from this list).
const MAX_CONCURRENT_SUMMARIES = 4

async function loadSummariesLimited(
  projects: { id: string; name: string }[],
  signal: AbortSignal,
): Promise<ProjectSummary[]> {
  const results = new Array<ProjectSummary>(projects.length)
  let next = 0

  async function worker() {
    while (next < projects.length) {
      const index = next++
      results[index] = await loadSummary(projects[index], signal)
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_SUMMARIES, projects.length) }, worker)
  await Promise.all(workers)
  return results
}

// Per-project suite/case counts and latest-run pass rate, computed client-side
// from already-available list endpoints (design.md D3/D4) — no new endpoints.
export function useProjectSummaries(): ProjectSummary[] {
  const location = useLocation()
  const dataRevision = useDataRevision()
  const [summaries, setSummaries] = useState<ProjectSummary[]>([])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    void api
      .GET('/api/v1/projects', { signal: controller.signal })
      .then(async ({ data }) => {
        const projects = data ?? []
        const results = await loadSummariesLimited(projects, controller.signal)
        if (!cancelled) setSummaries(results)
      })
      .catch(() => {
        if (!cancelled) setSummaries([])
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [location.pathname, dataRevision])

  return summaries
}
