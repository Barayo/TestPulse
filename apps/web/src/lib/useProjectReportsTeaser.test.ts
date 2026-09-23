import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProjectReportsTeaser } from './useProjectReportsTeaser'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
})

const summaryResponse = { data: { total: 10, counts: { pass: 8, failed: 2 } } }
const flakyResponse = {
  data: [
    { caseKey: 'P-C-1', caseTitle: 'Low flake', currentVersion: 1, rate: 20 },
    { caseKey: 'P-C-2', caseTitle: 'High flake', currentVersion: 2, rate: 80 },
    { caseKey: 'P-C-3', caseTitle: 'Mid flake', currentVersion: 1, rate: 50 },
  ],
}

describe('useProjectReportsTeaser flakyCases', () => {
  it('exposes flakyCases sorted by rate descending for a member', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/runs/status-summary') return Promise.resolve(summaryResponse)
      if (path === '/api/v1/projects/{projectKey}/flaky-cases') return Promise.resolve(flakyResponse)
      throw new Error(`unexpected path: ${path}`)
    })

    const { result } = renderHook(() => useProjectReportsTeaser('p1', true, false))

    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.flakyCases.map((c) => c.caseKey)).toEqual(['P-C-2', 'P-C-3', 'P-C-1'])
    expect(result.current.flakyCount).toBe(3)
  })

  it('exposes flakyCases sorted by rate descending for an anonymous visitor', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/public/projects/{projectKey}/runs/status-summary') return Promise.resolve(summaryResponse)
      if (path === '/api/v1/public/projects/{projectKey}/flaky-cases') return Promise.resolve(flakyResponse)
      throw new Error(`unexpected path: ${path}`)
    })

    const { result } = renderHook(() => useProjectReportsTeaser('p1', false, false))

    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.flakyCases.map((c) => c.caseKey)).toEqual(['P-C-2', 'P-C-3', 'P-C-1'])
  })

  it('defaults flakyCases to an empty array before load and on error', async () => {
    mockGET.mockImplementation(() => Promise.reject(new Error('network error')))

    const { result, rerender } = renderHook((props: { projectKey: string | undefined }) => useProjectReportsTeaser(props.projectKey, true, false), {
      initialProps: { projectKey: undefined as string | undefined },
    })
    expect(result.current.flakyCases).toEqual([])

    rerender({ projectKey: 'p1' })
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.flakyCases).toEqual([])
  })
})
