import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRunPassRateHistory } from './useRunPassRateHistory'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
})

// ListPage (apps/api/internal/store/runs.go) already orders newest-first —
// the API response below is deliberately newest-first, so the hook's own
// reversal to oldest-first is exercised, not accidentally masked by an
// already-sorted fixture.
const tenRunsNewestFirst = Array.from({ length: 10 }, (_, i) => ({
  id: `r${10 - i}`,
  key: `P-R${10 - i}`,
  passRate: (10 - i) * 5,
  createdAt: `2026-01-${String(10 - i).padStart(2, '0')}T00:00:00Z`,
}))

describe('useRunPassRateHistory', () => {
  it('requests exactly 10 runs from the member endpoint, no pagination', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/runs')
        return Promise.resolve({ data: { items: tenRunsNewestFirst, nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    renderHook(() => useRunPassRateHistory('p1', true, false))

    await waitFor(() =>
      expect(mockGET).toHaveBeenCalledWith('/api/v1/projects/{projectKey}/runs', {
        params: { path: { projectKey: 'p1' }, query: { limit: 10 } },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('requests the public endpoint for an anonymous visitor', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/public/projects/{projectKey}/runs')
        return Promise.resolve({ data: { items: tenRunsNewestFirst, nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    renderHook(() => useRunPassRateHistory('p1', false, false))

    await waitFor(() =>
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/runs', {
        params: { path: { projectKey: 'p1' }, query: { limit: 10 } },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('reverses the newest-first API response to oldest-first points', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/runs')
        return Promise.resolve({ data: { items: tenRunsNewestFirst, nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    const { result } = renderHook(() => useRunPassRateHistory('p1', true, false))

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.points.map((p) => p.createdAt)).toEqual([
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      '2026-01-03T00:00:00Z',
      '2026-01-04T00:00:00Z',
      '2026-01-05T00:00:00Z',
      '2026-01-06T00:00:00Z',
      '2026-01-07T00:00:00Z',
      '2026-01-08T00:00:00Z',
      '2026-01-09T00:00:00Z',
      '2026-01-10T00:00:00Z',
    ])
    expect(result.current.points[0].passRate).toBe(5)
    expect(result.current.points[9].passRate).toBe(50)
  })

  it('returns fewer points for a project with fewer than 10 runs, no padding', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/runs')
        return Promise.resolve({ data: { items: tenRunsNewestFirst.slice(0, 3), nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    const { result } = renderHook(() => useRunPassRateHistory('p1', true, false))

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.points).toHaveLength(3)
  })

  it('returns an empty array for a project with zero runs', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/runs')
        return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    const { result } = renderHook(() => useRunPassRateHistory('p1', true, false))

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.points).toEqual([])
  })

  it('includes a run with passRate: null as a point, not filtered out', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/runs')
        return Promise.resolve({
          data: { items: [{ id: 'r1', key: 'P-R1', passRate: null, createdAt: '2026-01-01T00:00:00Z' }], nextCursor: null },
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    const { result } = renderHook(() => useRunPassRateHistory('p1', true, false))

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.points).toEqual([{ passRate: null, createdAt: '2026-01-01T00:00:00Z' }])
  })
})
