import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useDataRevision } from '@/lib/DataRevision'

const RUN_COUNT = 10

export type PassRatePoint = { passRate: number | null; createdAt: string }

export type RunPassRateHistory = {
  points: PassRatePoint[]
  loaded: boolean
}

const empty: RunPassRateHistory = { points: [], loaded: false }

// The project landing page's Reports panel sparkline: the last 10 runs'
// pass rates in one request (dashboard-passrate-sparkline design.md) —
// `passRate` is already computed alongside listRuns's own query
// (packages/shared/openapi.yaml's Run.passRate doc comment: "cheap, not a
// per-run round trip"), and ListPage already orders newest-first, so no
// per-run summary fetch and no client-side sort are needed, only a
// reversal to oldest-first for left-to-right timeline rendering. Mirrors
// useProjectReportsTeaser's dual-mode signature exactly.
export function useRunPassRateHistory(
  projectKey: string | undefined,
  isMember: boolean,
  accessLoading: boolean,
): RunPassRateHistory {
  const dataRevision = useDataRevision()
  const [history, setHistory] = useState<RunPassRateHistory>(empty)

  useEffect(() => {
    if (!projectKey || accessLoading) {
      setHistory(empty)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const signal = controller.signal

    const request = isMember
      ? api.GET('/api/v1/projects/{projectKey}/runs', {
          params: { path: { projectKey }, query: { limit: RUN_COUNT } },
          signal,
        })
      : api.GET('/api/v1/public/projects/{projectKey}/runs', {
          params: { path: { projectKey }, query: { limit: RUN_COUNT } },
          signal,
        })

    void request
      .then(({ data }) => {
        if (cancelled) return
        const points = (data?.items ?? [])
          .slice()
          .reverse()
          .map((r) => ({ passRate: r.passRate ?? null, createdAt: r.createdAt }))
        setHistory({ points, loaded: true })
      })
      .catch(() => {
        if (!cancelled) setHistory({ ...empty, loaded: true })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [projectKey, isMember, accessLoading, dataRevision])

  return history
}
