import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useDataRevision } from '@/lib/DataRevision'

export type LandingFolder = { id: string; name: string; caseCount: number }
// LandingSuite/LandingRun.id holds the suite/run's key (add-human-readable-keys),
// not its internal id — every route/link these feed is key-based.
export type LandingSuite = { id: string; name: string; caseCount: number }
export type LandingRun = { id: string; name: string; createdAt: string; passRate: number | null }

export type ProjectLanding = {
  folders: LandingFolder[]
  totalFolders: number
  totalCases: number
  suites: LandingSuite[]
  totalSuites: number
  runs: LandingRun[]
  totalRuns: number
  loaded: boolean
}

// Raised from 4 (enrich-project-landing design.md) now that the summary
// strip above the panels carries the "how healthy is this project" signal —
// the panels themselves can afford to show a bit more without feeling dense.
const TOP_N = 5
const empty: ProjectLanding = {
  folders: [],
  totalFolders: 0,
  totalCases: 0,
  suites: [],
  totalSuites: 0,
  runs: [],
  totalRuns: 0,
  loaded: false,
}

// Top-level folders (children of root) with a recursive case count, top
// suites by creation order with their case count, and the most recent runs
// with a pass rate — all computed client-side from already-fetched project
// data (design.md D4), capped to TOP_N so the landing stays glanceable.
export function useProjectLanding(projectKey: string | undefined): ProjectLanding {
  const dataRevision = useDataRevision()
  const [landing, setLanding] = useState<ProjectLanding>(empty)

  useEffect(() => {
    if (!projectKey) {
      setLanding(empty)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const signal = controller.signal

    void Promise.all([
      api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey } }, signal }),
      api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey } }, signal }),
      api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey } }, signal }),
      api.GET('/api/v1/projects/{projectKey}/runs', { params: { path: { projectKey } }, signal }),
    ])
      .then(async ([foldersRes, casesRes, suitesRes, runsRes]) => {
        const folders = foldersRes.data ?? []
        const cases = casesRes.data ?? []
        const suites = suitesRes.data ?? []
        const runs = runsRes.data ?? []

        const root = folders.find((f) => !f.parentFolderId)
        const topLevel = folders.filter((f) => f.parentFolderId === root?.id)

        function descendantIds(folderId: string): Set<string> {
          const ids = new Set([folderId])
          let added = true
          while (added) {
            added = false
            for (const f of folders) {
              if (f.parentFolderId && ids.has(f.parentFolderId) && !ids.has(f.id)) {
                ids.add(f.id)
                added = true
              }
            }
          }
          return ids
        }

        const landingFolders: LandingFolder[] = topLevel.map((f) => {
          const ids = descendantIds(f.id)
          const caseCount = cases.filter((c) => ids.has(c.folderId)).length
          return { id: f.id, name: f.name, caseCount }
        })

        // Cases created before any subsection existed default into root,
        // which has no row of its own here otherwise — surface them as a
        // pseudo-row so they're never invisible (move-cases-between-folders
        // design.md). Prepended, so it competes for the TOP_N slot like any
        // other row rather than being exempted from the cap.
        const rootCaseCount = root ? cases.filter((c) => c.folderId === root.id).length : 0
        if (root && rootCaseCount > 0) {
          landingFolders.unshift({ id: root.id, name: 'Unsectioned', caseCount: rootCaseCount })
        }

        const landingSuites: LandingSuite[] = suites
          .slice(0, TOP_N)
          .map((s) => ({ id: s.key, name: s.name, caseCount: s.caseIds.length }))

        const recentRuns = [...runs]
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, TOP_N)
        const landingRuns: LandingRun[] = await Promise.all(
          recentRuns.map(async (r) => {
            const { data: summary } = await api.GET('/api/v1/runs/{runKey}/summary', {
              params: { path: { runKey: r.key } },
              signal,
            })
            let passRate: number | null = null
            if (summary && summary.total > 0) {
              passRate = Math.round(((summary.counts.pass ?? 0) / summary.total) * 100)
            }
            return { id: r.key, name: r.name, createdAt: r.createdAt, passRate }
          }),
        )

        if (!cancelled) {
          setLanding({
            folders: landingFolders.slice(0, TOP_N),
            totalFolders: topLevel.length,
            totalCases: cases.length,
            suites: landingSuites,
            totalSuites: suites.length,
            runs: landingRuns,
            totalRuns: runs.length,
            loaded: true,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setLanding({ ...empty, loaded: true })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [projectKey, dataRevision])

  return landing
}
