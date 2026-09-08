import { describe, expect, it, vi } from 'vitest'
import { fetchAllPages } from './fetchAllPages'

describe('fetchAllPages', () => {
  it('returns every item from a single page, not truncated', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [1, 2, 3], nextCursor: null })

    const result = await fetchAllPages(fetchPage)

    expect(result).toEqual({ items: [1, 2, 3], truncated: false })
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(undefined)
  })

  it('drains every page, concatenating items in order', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], nextCursor: 'cursor-a' })
      .mockResolvedValueOnce({ items: [3, 4], nextCursor: 'cursor-b' })
      .mockResolvedValueOnce({ items: [5], nextCursor: null })

    const result = await fetchAllPages(fetchPage)

    expect(result).toEqual({ items: [1, 2, 3, 4, 5], truncated: false })
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'cursor-a')
    expect(fetchPage).toHaveBeenNthCalledWith(3, 'cursor-b')
  })

  it('returns an empty, non-truncated result for an empty result', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [], nextCursor: null })

    const result = await fetchAllPages(fetchPage)

    expect(result).toEqual({ items: [], truncated: false })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('stops after maxPages and reports truncated when more pages remain', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], nextCursor: 'cursor-a' })
      .mockResolvedValueOnce({ items: [2], nextCursor: 'cursor-b' })
      .mockResolvedValueOnce({ items: [3], nextCursor: 'cursor-c' })

    const result = await fetchAllPages(fetchPage, 2)

    expect(result).toEqual({ items: [1, 2], truncated: true })
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('is not truncated when the last page exactly fills maxPages', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], nextCursor: 'cursor-a' })
      .mockResolvedValueOnce({ items: [2], nextCursor: null })

    const result = await fetchAllPages(fetchPage, 2)

    expect(result).toEqual({ items: [1, 2], truncated: false })
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })
})
