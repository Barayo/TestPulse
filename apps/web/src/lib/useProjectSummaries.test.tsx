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
    createdAt: '',
  }))
}

describe('useProjectSummaries concurrency', () => {
  it('never has more than 4 per-project summary requests in flight at once', async () => {
    const projectCount = 20
    let inFlight = 0
    let maxInFlight = 0

    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects') {
        return Promise.resolve({ data: manyProjects(projectCount), response: { ok: true } })
      }
      // suites/cases/runs calls for each project's summary
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight--
          resolve({ data: [], response: { ok: true } })
        }, 5)
      })
    })

    const { result } = renderHook(() => useProjectSummaries(), { wrapper })

    await waitFor(() => expect(result.current).toHaveLength(projectCount))
    expect(maxInFlight).toBeLessThanOrEqual(4 * 3)
  })

  it('aborts in-flight per-project requests when the component unmounts', async () => {
    const abortedSignals: AbortSignal[] = []
    mockGET.mockImplementation((path: string, options?: { signal?: AbortSignal }) => {
      if (path === '/api/v1/projects') {
        return Promise.resolve({ data: manyProjects(10), response: { ok: true } })
      }
      if (options?.signal) abortedSignals.push(options.signal)
      return new Promise(() => {}) // never resolves
    })

    const { unmount } = renderHook(() => useProjectSummaries(), { wrapper })

    await waitFor(() => expect(abortedSignals.length).toBeGreaterThan(0))
    unmount()

    expect(abortedSignals.some((s) => s.aborted)).toBe(true)
  })
})
