import { useEffect, useState } from 'react'
import { useMatch } from 'react-router-dom'
import { api } from '@/lib/api'

// A project is "active" on /projects/:projectKey directly, or indirectly on
// /runs/:runKey (resolved by fetching the run to find its project's key —
// Run carries projectKey alongside its internal projectId specifically for
// this, since a run's own route isn't nested under its project's).
export function useActiveProjectId(): string | undefined {
  const projectMatch = useMatch('/projects/:projectKey/*')
  const runMatch = useMatch('/runs/:runKey')
  const [runProjectKey, setRunProjectKey] = useState<string>()

  useEffect(() => {
    const runKey = runMatch?.params.runKey
    if (!runKey) {
      setRunProjectKey(undefined)
      return
    }
    let cancelled = false
    void api
      .GET('/api/v1/runs/{runKey}', { params: { path: { runKey } } })
      .then(({ data }) => {
        if (!cancelled) setRunProjectKey(data?.projectKey)
      })
      .catch(() => {
        if (!cancelled) setRunProjectKey(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [runMatch?.params.runKey])

  return projectMatch?.params.projectKey ?? runProjectKey
}
