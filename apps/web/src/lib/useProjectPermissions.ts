import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { components } from '@testpulse/shared/api'

type Permissions = components['schemas']['Permissions']

// The caller's own effective permissions on a project — used to hide (not
// just disable) permission-gated UI, like the delete mode toggle
// (add-delete-mode). Returns undefined while loading, on failure, or when
// projectKey is absent, which callers treat the same as "no permissions" —
// there's nothing unsafe about defaulting to hidden.
export function useProjectPermissions(projectKey: string | undefined): Permissions | undefined {
  const [permissions, setPermissions] = useState<Permissions>()

  useEffect(() => {
    setPermissions(undefined)
    if (!projectKey) return
    let cancelled = false
    void api
      .GET('/api/v1/projects/{projectKey}/permissions', { params: { path: { projectKey } } })
      .then(({ data }) => {
        if (!cancelled) setPermissions(data)
      })
      .catch(() => {
        if (!cancelled) setPermissions(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [projectKey])

  return permissions
}
