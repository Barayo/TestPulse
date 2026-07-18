import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useProjectSummaries } from './useProjectSummaries'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

beforeEach(() => {
  vi.resetAllMocks()
})

function manyProjects(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Project ${i}`,
    archived: false,
    description: '',
    createdAt: '',
  }))
}

function mockBatchedAPI(projectCount: number) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects') {
      return Promise.resolve({ data: manyProjects(projectCount), response: { ok: true } })
    }
    if (path === '/api/v1/projects/summaries') {
      return Promise.resolve({
        data: manyProjects(projectCount).map((p, i) => ({
          projectId: p.id,
          suiteCount: i,
          caseCount: i * 2,
          passRate: i === 0 ? null : 50,
          isFavorite: false,
        })),
        response: { ok: true },
      })
    }
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

describe('useProjectSummaries', () => {
  it('makes exactly one summaries request regardless of project count', async () => {
    mockBatchedAPI(50)
    const { result } = renderHook(() => useProjectSummaries(), { wrapper })
    await waitFor(() => expect(result.current).toHaveLength(50))

    const summaryCalls = mockGET.mock.calls.filter((call) => call[0] === '/api/v1/projects/summaries')
    expect(summaryCalls).toHaveLength(1)
  })

  it('merges project names with their batched stats', async () => {
    mockBatchedAPI(2)
    const { result } = renderHook(() => useProjectSummaries(), { wrapper })
    await waitFor(() => expect(result.current).toHaveLength(2))

    expect(result.current[0]).toEqual({
      id: 'p0',
      name: 'Project 0',
      description: '',
      createdAt: '',
      suiteCount: 0,
      caseCount: 0,
      passRate: null,
      lastRunAt: null,
      isFavorite: false,
    })
    expect(result.current[1]).toEqual({
      id: 'p1',
      name: 'Project 1',
      description: '',
      createdAt: '',
      suiteCount: 1,
      caseCount: 2,
      passRate: 50,
      lastRunAt: null,
      isFavorite: false,
    })
  })

  it('passes through description and isFavorite from the API', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects') {
        return Promise.resolve({
          data: [
            {
              id: 'p0',
              name: 'Project 0',
              archived: false,
              description: 'a description',
              createdAt: '2026-01-01T00:00:00Z',
            },
          ],
          response: { ok: true },
        })
      }
      if (path === '/api/v1/projects/summaries') {
        return Promise.resolve({
          data: [
            {
              projectId: 'p0',
              suiteCount: 1,
              caseCount: 2,
              passRate: 90,
              lastRunAt: '2026-01-02T00:00:00Z',
              isFavorite: true,
            },
          ],
          response: { ok: true },
        })
      }
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    const { result } = renderHook(() => useProjectSummaries(), { wrapper })
    await waitFor(() => expect(result.current).toHaveLength(1))

    expect(result.current[0]).toEqual({
      id: 'p0',
      name: 'Project 0',
      description: 'a description',
      createdAt: '2026-01-01T00:00:00Z',
      suiteCount: 1,
      caseCount: 2,
      passRate: 90,
      lastRunAt: '2026-01-02T00:00:00Z',
      isFavorite: true,
    })
  })

  it('aborts in-flight requests when the component unmounts', async () => {
    const abortedSignals: AbortSignal[] = []
    mockGET.mockImplementation((_path: string, options?: { signal?: AbortSignal }) => {
      if (options?.signal) abortedSignals.push(options.signal)
      return new Promise(() => {}) // never resolves
    })

    const { unmount } = renderHook(() => useProjectSummaries(), { wrapper })

    await waitFor(() => expect(abortedSignals.length).toBeGreaterThan(0))
    unmount()

    expect(abortedSignals.some((s) => s.aborted)).toBe(true)
  })

  it('recovers gracefully when the request fails', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useProjectSummaries(), { wrapper })
    await waitFor(() => expect(result.current).toEqual([]))
  })
})
