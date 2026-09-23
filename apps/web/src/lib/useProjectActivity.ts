import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useDataRevision } from '@/lib/DataRevision'
import type { components } from '@testpulse/shared/api'

type AuditEntry = components['schemas']['AuditEntry']

const ENTRY_COUNT = 5

export type ProjectActivity = {
  entries: AuditEntry[]
  loaded: boolean
}

const empty: ProjectActivity = { entries: [], loaded: false }

// The project landing page's Activity panel teaser: the last 5 audited
// writes, newest first, already ordered by the API
// (project-activity-feed) — no client-side sort needed. Mirrors
// useProjectReportsTeaser's dual-mode signature exactly.
export function useProjectActivity(
  projectKey: string | undefined,
  isMember: boolean,
  accessLoading: boolean,
): ProjectActivity {
  const dataRevision = useDataRevision()
  const [activity, setActivity] = useState<ProjectActivity>(empty)

  useEffect(() => {
    if (!projectKey || accessLoading) {
      setActivity(empty)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const signal = controller.signal

    const request = isMember
      ? api.GET('/api/v1/projects/{projectKey}/audit', {
          params: { path: { projectKey }, query: { limit: ENTRY_COUNT } },
          signal,
        })
      : api.GET('/api/v1/public/projects/{projectKey}/audit', {
          params: { path: { projectKey }, query: { limit: ENTRY_COUNT } },
          signal,
        })

    void request
      .then(({ data }) => {
        if (cancelled) return
        setActivity({ entries: data ?? [], loaded: true })
      })
      .catch(() => {
        if (!cancelled) setActivity({ ...empty, loaded: true })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [projectKey, isMember, accessLoading, dataRevision])

  return activity
}
