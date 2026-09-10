import { describe, expect, it, vi, beforeEach } from 'vitest'
import { bulkMoveCases } from './bulkMoveCases'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { PUT: vi.fn() } }))
const mockPUT = vi.mocked(api.PUT)

beforeEach(() => {
  vi.resetAllMocks()
  mockPUT.mockResolvedValue({ response: { ok: true } })
})

describe('bulkMoveCases', () => {
  it('moves a single case to the target folder', async () => {
    await bulkMoveCases(['c1'], 'f1')

    expect(mockPUT).toHaveBeenCalledTimes(1)
    expect(mockPUT).toHaveBeenCalledWith(
      '/api/v1/cases/{caseKey}/folder',
      expect.objectContaining({ params: { path: { caseKey: 'c1' } }, body: { folderId: 'f1' } }),
    )
  })

  it('moves every case in the list to the same target folder', async () => {
    await bulkMoveCases(['c1', 'c2', 'c3'], 'f2')

    expect(mockPUT).toHaveBeenCalledTimes(3)
    for (const key of ['c1', 'c2', 'c3']) {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/cases/{caseKey}/folder',
        expect.objectContaining({ params: { path: { caseKey: key } }, body: { folderId: 'f2' } }),
      )
    }
  })

  it('resolves undefined when every move succeeds', async () => {
    const result = await bulkMoveCases(['c1', 'c2'], 'f2')
    expect(result).toBeUndefined()
  })

  it('resolves an error message naming how many moves failed', async () => {
    mockPUT
      .mockResolvedValueOnce({ response: { ok: false }, error: { error: 'nope' } })
      .mockResolvedValueOnce({ response: { ok: true } })

    const result = await bulkMoveCases(['c1', 'c2'], 'f2')
    expect(result).toBe('Could not move 1 of 2 cases.')
  })

  it('resolves an error message when every move fails', async () => {
    mockPUT.mockResolvedValue({ response: { ok: false }, error: { error: 'nope' } })

    const result = await bulkMoveCases(['c1', 'c2'], 'f2')
    expect(result).toBe('Could not move the selected cases.')
  })
})
