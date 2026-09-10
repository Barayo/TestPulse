import { describe, expect, it, vi, beforeEach } from 'vitest'
import { bulkDeleteCases } from './bulkDeleteCases'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { DELETE: vi.fn() } }))
const mockDELETE = vi.mocked(api.DELETE)

beforeEach(() => {
  vi.resetAllMocks()
  mockDELETE.mockResolvedValue({ response: { ok: true } })
})

describe('bulkDeleteCases', () => {
  it('deletes a single case', async () => {
    await bulkDeleteCases(['c1'])

    expect(mockDELETE).toHaveBeenCalledTimes(1)
    expect(mockDELETE).toHaveBeenCalledWith(
      '/api/v1/cases/{caseKey}',
      expect.objectContaining({ params: { path: { caseKey: 'c1' } } }),
    )
  })

  it('deletes every case in the list', async () => {
    await bulkDeleteCases(['c1', 'c2', 'c3'])

    expect(mockDELETE).toHaveBeenCalledTimes(3)
    for (const key of ['c1', 'c2', 'c3']) {
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/cases/{caseKey}',
        expect.objectContaining({ params: { path: { caseKey: key } } }),
      )
    }
  })

  it('resolves undefined when every delete succeeds', async () => {
    const result = await bulkDeleteCases(['c1', 'c2'])
    expect(result).toBeUndefined()
  })

  it('resolves an error message naming how many deletes failed', async () => {
    mockDELETE
      .mockResolvedValueOnce({ response: { ok: true } })
      .mockResolvedValueOnce({ response: { ok: false }, error: { error: 'nope' } })
      .mockResolvedValueOnce({ response: { ok: true } })

    const result = await bulkDeleteCases(['c1', 'c2', 'c3'])
    expect(result).toBe('Could not delete 1 of 3 cases.')
  })

  it('resolves an error message when every delete fails', async () => {
    mockDELETE.mockResolvedValue({ response: { ok: false }, error: { error: 'nope' } })

    const result = await bulkDeleteCases(['c1', 'c2'])
    expect(result).toBe('Could not delete the selected cases.')
  })
})
