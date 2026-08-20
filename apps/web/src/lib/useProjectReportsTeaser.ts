import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useDataRevision } from '@/lib/DataRevision'
import type { components } from '@testpulse/shared/api'

type Status = components['schemas']['Status']

export type ProjectReportsTeaser = {
  total: number
  counts: Partial<Record<Status, number>>
  flakyCount: number
  loaded: boolean
}

const empty: ProjectReportsTeaser = { total: 0, counts: {}, flakyCount: 0, loaded: false }

// The project landing page's Reports panel teaser: just enough data to
// summarize "how is this project doing" without navigating away
// (add-project-reports-page). Mirrors useProjectLanding's dual-mode
// call-site signature exactly — `isMember`/`accessLoading` passed in
// explicitly rather than resolved internally.
export function useProjectReportsTeaser(
  projectKey: string | undefined,
  isMember: boolean,
  accessLoading: boolean,
): ProjectReportsTeaser {
  const dataRevision = useDataRevision()
  const [teaser, setTeaser] = useState<ProjectReportsTeaser>(empty)

  useEffect(() => {
    if (!projectKey || accessLoading) {
      setTeaser(empty)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const signal = controller.signal

    void Promise.all(
      isMember
        ? [
            api.GET('/api/v1/projects/{projectKey}/runs/status-summary', { params: { path: { projectKey } }, signal }),
            api.GET('/api/v1/projects/{projectKey}/flaky-cases', { params: { path: { projectKey } }, signal }),
          ]
        : [
            api.GET('/api/v1/public/projects/{projectKey}/runs/status-summary', { params: { path: { projectKey } }, signal }),
            api.GET('/api/v1/public/projects/{projectKey}/flaky-cases', { params: { path: { projectKey } }, signal }),
          ],
    )
      .then(([summaryRes, flakyRes]) => {
        if (cancelled) return
        setTeaser({
          total: summaryRes.data?.total ?? 0,
          counts: summaryRes.data?.counts ?? {},
          flakyCount: flakyRes.data?.length ?? 0,
          loaded: true,
        })
      })
      .catch(() => {
        if (!cancelled) setTeaser({ ...empty, loaded: true })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [projectKey, isMember, accessLoading, dataRevision])

  return teaser
}
