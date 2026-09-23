import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProjectActivity } from './useProjectActivity'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
})

const entries = [
  { id: 'a1', actorKind: 'user', actorId: 'u1', actorName: 'Sam', action: 'update', entityType: 'case', entityId: 'c1', projectId: 'p1', occurredAt: '2026-01-02T00:00:00Z' },
  { id: 'a2', actorKind: 'agent', actorId: 't1', actorName: 'ci-pipeline', action: 'create', entityType: 'run', entityId: 'r1', projectId: 'p1', occurredAt: '2026-01-01T00:00:00Z' },
]

describe('useProjectActivity', () => {
  it('requests exactly 5 entries from the member endpoint', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/audit') return Promise.resolve({ data: entries, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    renderHook(() => useProjectActivity('p1', true, false))

    await waitFor(() =>
      expect(mockGET).toHaveBeenCalledWith('/api/v1/projects/{projectKey}/audit', {
        params: { path: { projectKey: 'p1' }, query: { limit: 5 } },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('requests the public endpoint for an anonymous visitor', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/public/projects/{projectKey}/audit') return Promise.resolve({ data: entries, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    renderHook(() => useProjectActivity('p1', false, false))

    await waitFor(() =>
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/audit', {
        params: { path: { projectKey: 'p1' }, query: { limit: 5 } },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('returns the entries in the order the API returns them, newest first', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/audit') return Promise.resolve({ data: entries, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    const { result } = renderHook(() => useProjectActivity('p1', true, false))

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.entries.map((e) => e.id)).toEqual(['a1', 'a2'])
  })

  it('returns an empty array on a fetch failure', async () => {
    mockGET.mockImplementation(() => Promise.reject(new Error('network error')))

    const { result } = renderHook(() => useProjectActivity('p1', true, false))

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.entries).toEqual([])
  })
})
