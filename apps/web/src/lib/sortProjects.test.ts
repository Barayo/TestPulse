import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT_DIRECTION, sortProjects } from './sortProjects'
import type { ProjectSummary } from './useProjectSummaries'

function project(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: overrides.id ?? Math.random().toString(36),
    name: 'Project',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    isSample: false,
    suiteCount: 0,
    caseCount: 0,
    passRate: null,
    lastRunAt: null,
    isFavorite: false,
    ...overrides,
  }
}

describe('sortProjects', () => {
  const b = project({ id: 'b', name: 'Banking App', suiteCount: 5, caseCount: 50, createdAt: '2026-02-01T00:00:00.000Z' })
  const a = project({ id: 'a', name: 'Analytics', suiteCount: 20, caseCount: 10, createdAt: '2026-03-01T00:00:00.000Z' })
  const c = project({ id: 'c', name: 'Checkout', suiteCount: 1, caseCount: 200, createdAt: '2026-01-01T00:00:00.000Z' })
  const list = [b, a, c]

  it('sorts by name ascending', () => {
    expect(sortProjects(list, 'name', 'asc').map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by name descending', () => {
    expect(sortProjects(list, 'name', 'desc').map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by suite count ascending', () => {
    expect(sortProjects(list, 'suites', 'asc').map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by suite count descending', () => {
    expect(sortProjects(list, 'suites', 'desc').map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by case count ascending', () => {
    expect(sortProjects(list, 'cases', 'asc').map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by case count descending', () => {
    expect(sortProjects(list, 'cases', 'desc').map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by creation date ascending', () => {
    expect(sortProjects(list, 'created', 'asc').map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by creation date descending', () => {
    expect(sortProjects(list, 'created', 'desc').map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input array', () => {
    const copy = [...list]
    sortProjects(list, 'name', 'asc')
    expect(list).toEqual(copy)
  })

  it('defines a sensible default direction per key', () => {
    expect(DEFAULT_SORT_DIRECTION).toEqual({
      name: 'asc',
      suites: 'desc',
      cases: 'desc',
      created: 'desc',
    })
  })
})
