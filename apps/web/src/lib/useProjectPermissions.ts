import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { AuthUser } from '@/lib/useAuth'
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

// Whether a signed-in user's authenticated project fetch should be
// trusted for a dual-mode page's content, vs falling back to the public
// endpoints (unify-authenticated-and-public-views design.md D11): a
// signed-in user with no membership on a project gets 403 from every
// authenticated route, including this one (`PermRead`-gated), while the
// public equivalent succeeds for the identical project if it's public —
// so a dual-mode page branching on `user` alone 403-walls a signed-in
// non-member where a logged-out visitor would succeed. Kept separate
// from useProjectPermissions, whose `undefined` already conflates
// "loading" and "denied" (fine for hiding UI controls, wrong for this
// decision, which needs to tell them apart).
export type ProjectReadAccess = 'loading' | 'member' | 'public'

export function useProjectReadAccess(
  projectKey: string | undefined,
  user: AuthUser | null,
  authLoading: boolean,
): ProjectReadAccess {
  const [access, setAccess] = useState<ProjectReadAccess>('loading')

  useEffect(() => {
    if (!projectKey || authLoading) {
      setAccess('loading')
      return
    }
    if (!user) {
      setAccess('public')
      return
    }
    let cancelled = false
    setAccess('loading')
    void api
      .GET('/api/v1/projects/{projectKey}/permissions', { params: { path: { projectKey } } })
      .then(({ data }) => {
        if (!cancelled) setAccess(data ? 'member' : 'public')
      })
      .catch(() => {
        if (!cancelled) setAccess('public')
      })
    return () => {
      cancelled = true
    }
  }, [projectKey, user, authLoading])

  return access
}
