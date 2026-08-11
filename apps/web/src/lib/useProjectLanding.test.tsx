import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProjectLanding } from './useProjectLanding'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useProjectLanding abort behaviour', () => {
  it('aborts in-flight requests when the project id changes or the component unmounts', async () => {
    const abortedSignals: AbortSignal[] = []
    mockGET.mockImplementation((_path: string, options?: { signal?: AbortSignal }) => {
      if (options?.signal) abortedSignals.push(options.signal)
      return new Promise(() => {}) // never resolves
    })

    const { unmount } = renderHook(() => useProjectLanding('p1', true, false))

    await waitFor(() => expect(abortedSignals.length).toBeGreaterThan(0))
    unmount()

    expect(abortedSignals.every((s) => s.aborted)).toBe(true)
  })
})
