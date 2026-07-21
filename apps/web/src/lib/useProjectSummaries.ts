import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '@/lib/api'
import { useDataRevision } from '@/lib/DataRevision'

export type ProjectSummary = {
  // Holds the project's human-readable key (add-human-readable-keys), not
  // its internal database id — every route/link this feeds is key-based,
  // and the frontend never needs the raw id for anything.
  id: string
  name: string
  description: string
  createdAt: string
  suiteCount: number
  caseCount: number
  passRate: number | null
  lastRunAt: string | null
  isFavorite: boolean
}

// Per-project suite/case counts and latest-run pass rate, fetched in one
// batched request (GET /api/v1/projects/summaries, add-project-stats-endpoint)
// merged with project names/ids — replaces the earlier N-requests-per-project
// client-side loop, which saturated the browser's connection pool once
// project counts grew (see add-project-stats-endpoint's proposal.md).
export function useProjectSummaries(): ProjectSummary[] {
  const location = useLocation()
  const dataRevision = useDataRevision()
  const [summaries, setSummaries] = useState<ProjectSummary[]>([])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const signal = controller.signal

    void Promise.all([
      api.GET('/api/v1/projects', { signal }),
      api.GET('/api/v1/projects/summaries', { signal }),
    ])
      .then(([{ data: projects }, { data: stats }]) => {
        const statsById = new Map((stats ?? []).map((s) => [s.projectId, s]))
        const results = (projects ?? []).map((p) => {
          const stat = statsById.get(p.id)
          return {
            id: p.key,
            name: p.name,
            description: p.description ?? '',
            createdAt: p.createdAt,
            suiteCount: stat?.suiteCount ?? 0,
            caseCount: stat?.caseCount ?? 0,
            passRate: stat?.passRate ?? null,
            lastRunAt: stat?.lastRunAt ?? null,
            isFavorite: stat?.isFavorite ?? false,
          }
        })
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
