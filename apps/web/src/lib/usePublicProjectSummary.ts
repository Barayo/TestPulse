import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ProjectSummary } from '@/lib/useProjectSummaries'
import type { ProjectReadAccess } from '@/lib/useProjectPermissions'

// useProjectSummaries()'s batched authenticated aggregate
// (/api/v1/projects/summaries) has no public equivalent (same gap
// ProjectPage.tsx already works around locally for its own summary strip),
// so the header's ProjectSwitcher — fed by that hook — never resolves the
// active project's name for a non-member visitor (anonymous, or signed-in
// but not a project member, per unify-authenticated-and-public-views
// design.md D11) once they leave the project landing page. This fills that
// one gap for Layout.tsx: a single-project fallback built from the same
// public endpoint ProjectPage.tsx already uses. Counts/passRate are left
// at their defaults — unused by ProjectSwitcher's single-item
// (canSwitch === false) branch, which only renders id/name.
export function usePublicProjectSummary(
  projectKey: string | undefined,
  access: ProjectReadAccess,
): ProjectSummary | undefined {
  const [summary, setSummary] = useState<ProjectSummary>()

  useEffect(() => {
    setSummary(undefined)
    if (!projectKey || access !== 'public') return
    let cancelled = false
    void api
      .GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } })
      .then(({ data }) => {
        if (cancelled || !data) return
        setSummary({
          id: data.key,
          name: data.name,
          description: data.description ?? '',
          createdAt: data.createdAt,
          isSample: data.isSample ?? false,
          suiteCount: 0,
          caseCount: 0,
          passRate: null,
          lastRunAt: null,
          isFavorite: false,
          archived: data.archived ?? false,
          tags: [],
        })
      })
      .catch(() => {
        if (!cancelled) setSummary(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [projectKey, access])

  return summary
}
