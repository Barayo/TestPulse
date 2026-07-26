import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ReactNode } from 'react'
import { useActiveProjectId } from './useActiveProject'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
})

function wrapper(path: string, routePattern: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePattern} element={children} />
        </Routes>
      </MemoryRouter>
    )
  }
}

describe('useActiveProjectId', () => {
  it('resolves directly from a /projects/:projectKey route', () => {
    const { result } = renderHook(() => useActiveProjectId(), {
      wrapper: wrapper('/projects/p1/library', '/projects/:projectKey/*'),
    })
    expect(result.current).toBe('p1')
  })

  it('resolves indirectly on /runs/:runKey by fetching the run', async () => {
    mockGET.mockResolvedValue({ data: { projectKey: 'p1' }, response: { ok: true } })
    const { result } = renderHook(() => useActiveProjectId(), {
      wrapper: wrapper('/runs/r1', '/runs/:runKey'),
    })
    await waitFor(() => expect(result.current).toBe('p1'))
    expect(mockGET).toHaveBeenCalledWith(
      '/api/v1/runs/{runKey}',
      expect.objectContaining({ params: { path: { runKey: 'r1' } } }),
    )
  })

  it('also resolves on a run item\'s own page (/runs/:runKey/items/:caseKey) — not just the run page itself', async () => {
    mockGET.mockResolvedValue({ data: { projectKey: 'p1' }, response: { ok: true } })
    const { result } = renderHook(() => useActiveProjectId(), {
      wrapper: wrapper('/runs/r1/items/c1', '/runs/:runKey/items/:caseKey'),
    })
    await waitFor(() => expect(result.current).toBe('p1'))
  })

  it('returns undefined on an unrelated route', () => {
    const { result } = renderHook(() => useActiveProjectId(), {
      wrapper: wrapper('/settings/people', '/settings/people'),
    })
    expect(result.current).toBeUndefined()
    expect(mockGET).not.toHaveBeenCalled()
  })
})
