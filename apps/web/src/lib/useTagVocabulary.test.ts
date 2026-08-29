import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTagVocabulary } from './useTagVocabulary'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useTagVocabulary', () => {
  it('returns the shared tag vocabulary', async () => {
    mockGET.mockResolvedValue({ data: ['mobile', 'internal'], response: { ok: true } })
    const { result } = renderHook(() => useTagVocabulary())
    await waitFor(() => expect(result.current).toEqual(['mobile', 'internal']))
    expect(mockGET).toHaveBeenCalledWith('/api/v1/tags')
  })

  it('defaults to empty on failure', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useTagVocabulary())
    await waitFor(() => expect(result.current).toEqual([]))
  })
})
