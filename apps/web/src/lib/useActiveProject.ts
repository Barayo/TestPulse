import { useEffect, useState } from 'react'
import { useMatch } from 'react-router-dom'
import { api } from '@/lib/api'

// A project is "active" on /projects/:projectId directly, or indirectly on
// /runs/:runId (resolved by fetching the run to find its project).
export function useActiveProjectId(): string | undefined {
  const projectMatch = useMatch('/projects/:projectId/*')
  const runMatch = useMatch('/runs/:runId')
  const [runProjectId, setRunProjectId] = useState<string>()

  useEffect(() => {
    const runId = runMatch?.params.runId
    if (!runId) {
      setRunProjectId(undefined)
      return
    }
    let cancelled = false
    void api
      .GET('/api/v1/runs/{runId}', { params: { path: { runId } } })
      .then(({ data }) => {
        if (!cancelled) setRunProjectId(data?.projectId)
      })
      .catch(() => {
        if (!cancelled) setRunProjectId(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [runMatch?.params.runId])

  return projectMatch?.params.projectId ?? runProjectId
}
