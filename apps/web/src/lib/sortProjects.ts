import type { ProjectSummary } from './useProjectSummaries'

export type SortKey = 'name' | 'suites' | 'cases' | 'created'
export type SortDirection = 'asc' | 'desc'

// The direction someone actually reaches for the first time a key is
// selected (design.md, add-project-list-sort) — Name reads A–Z, size-based
// keys and Created read biggest/newest first. The toggle always overrides
// this afterward.
export const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  name: 'asc',
  suites: 'desc',
  cases: 'desc',
  created: 'desc',
}

export function sortProjects(
  projects: ProjectSummary[],
  key: SortKey,
  direction: SortDirection,
): ProjectSummary[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...projects].sort((a, b) => {
    switch (key) {
      case 'name':
        return a.name.localeCompare(b.name) * sign
      case 'suites':
        return (a.suiteCount - b.suiteCount) * sign
      case 'cases':
        return (a.caseCount - b.caseCount) * sign
      case 'created':
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * sign
    }
  })
}
